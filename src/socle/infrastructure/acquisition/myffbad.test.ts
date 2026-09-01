import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creerModuleMyffbad, identifiantDuJoueur } from "./myffbad.ts";
import { licence } from "../../core/licence.ts";

const module = creerModuleMyffbad(licence("07194591"));

/** Un JWT de la forme que myffbad délivre, signature comprise mais non vérifiée. */
function jwt(charge: Record<string, unknown>): string {
  const en64 = (valeur: object) => Buffer.from(JSON.stringify(valeur)).toString("base64url");
  return `${en64({ alg: "HS256", typ: "JWT" })}.${en64(charge)}.signature-non-verifiee`;
}

describe("l'échéance du jeton myffbad", () => {
  it("lit le `exp` de la charge, seule date qui fasse foi", () => {
    // iat 2026-09-01, exp 2026-10-01 : le mois annoncé par la spec 015.
    const valeur = `jwt=${jwt({ licence: "07194591", iat: 1788277415, exp: 1790869415 })}`;

    assert.deepEqual(module.expirationDuJeton?.(valeur), new Date("2026-10-01T15:43:35Z"));
  });

  it("trouve le jeton au milieu des autres cookies", () => {
    const valeur = `_ga=GA1.2.3; jwt=${jwt({ exp: 1790869415 })}; consent=ok`;

    assert.deepEqual(module.expirationDuJeton?.(valeur), new Date("2026-10-01T15:43:35Z"));
  });

  it("rend null plutôt que d'inventer, quand rien ne se lit", () => {
    for (const valeur of [
      "session=opaque",
      "jwt=pas-un-jwt",
      `jwt=${jwt({ licence: "07194591" })}`,
      `jwt=${jwt({ exp: "bientôt" })}`,
      "jwt=a.b.c",
    ]) {
      assert.equal(module.expirationDuJeton?.(valeur), null, valeur);
    }
  });
});

describe("le mur de connexion myffbad", () => {
  it("reconnaît la redirection, que le statut ne trahit pas", () => {
    const page = { statutHttp: 200, contenu: "", cookies: [] };

    assert.equal(module.murDeConnexion({ ...page, url: "https://www.myffbad.fr/connexion" }), true);
    assert.equal(module.murDeConnexion({ ...page, url: "https://www.myffbad.fr/" }), false);
  });
});

describe("les pages sondées", () => {
  const jetonValide = `jwt=${jwt({ personId: "1083591", exp: 1790869415 })}`;

  it("n'exerce les actions que sous session, faute de personId sans elle", () => {
    const sansSession = module.pagesDeLaSonde(null).map(({ intitule }) => intitule);
    const avecSession = module.pagesDeLaSonde(jetonValide).map(({ intitule }) => intitule);

    assert.ok(!sansSession.includes("classement (action)"));
    assert.ok(avecSession.includes("classement (action)"));
    assert.ok(avecSession.includes("résultats (action)"));
  });

  it("vise ma licence et mon identifiant, et non ceux d'un autre", () => {
    const pages = module.pagesDeLaSonde(jetonValide);
    const resultats = pages.find(({ intitule }) => intitule === "résultats (action)");

    assert.equal(resultats?.requete.url, "https://www.myffbad.fr/joueur/07194591");
    assert.equal(
      resultats?.requete.corps,
      '[{"personId":1083591,"season":"$undefined","isHistory":false}]',
    );
  });
});

describe("l'identifiant interne du joueur", () => {
  it("se lit dans le jeton, seul endroit où myffbad l'expose", () => {
    assert.equal(identifiantDuJoueur(`jwt=${jwt({ personId: "1083591" })}`), 1083591);
  });

  it("rend null quand il n'y a rien à lire", () => {
    for (const jeton of [null, "session=opaque", `jwt=${jwt({})}`, `jwt=${jwt({ personId: "0" })}`]) {
      assert.equal(identifiantDuJoueur(jeton), null, String(jeton));
    }
  });
});

describe("l'appel d'une Server Action myffbad", () => {
  it("compose la connexion telle que le navigateur l'envoie", () => {
    const requete = module.connexion?.requete("un-secret");

    assert.equal(requete?.url, "https://www.myffbad.fr/connexion");
    assert.equal(requete?.methode, "POST");
    assert.equal(requete?.jeton, null, "on se connecte sans session, forcément");
    assert.equal(
      requete?.corps,
      '[{"licence":"07194591","password":"un-secret","rememberMe":true}]',
    );
    assert.equal(requete?.entetes?.["next-action"], "40960127f718c9144ddd4ae4c5212b5b5581a3951e");
    assert.equal(requete?.entetes?.["content-type"], "text/plain;charset=UTF-8");
  });

  it("ne garde que le jwt parmi les cookies posés", () => {
    const jeton = module.connexion?.jetonDepuisLesCookies([
      "rgpd=0; Path=/; Max-Age=31536000",
      "jwt=eyJhbG.charge.sig; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);

    assert.equal(jeton, "jwt=eyJhbG.charge.sig");
  });

  it("ne prend pas un jwt vide pour un jeton", () => {
    assert.equal(module.connexion?.jetonDepuisLesCookies(["jwt=; Path=/", "rgpd=0"]), null);
    assert.equal(module.connexion?.jetonDepuisLesCookies([]), null);
  });
});
