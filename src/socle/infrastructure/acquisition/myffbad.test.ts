import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  classementDuJoueur,
  creerModuleMyffbad,
  identifiantDuJoueur,
  identiteDuJoueur,
} from "./myffbad.ts";
import { ClassementIllisible } from "../../core/classement.ts";
import { IdentiteIllisible } from "../../core/identite.ts";
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

  it("n'exerce les actions que sous session, faute de personId à composer sans elle", () => {
    // La sonde joue une liste connue d'avance : elle ne peut pas enchaîner la
    // fiche puis l'action comme la passe de 028 le fait, donc l'identifiant lui
    // vient encore du jeton. L'appel, lui, part sans cookie.
    const sansSession = module.pagesDeLaSonde(null).map(({ intitule }) => intitule);
    const avecSession = module.pagesDeLaSonde(jetonValide).map(({ intitule }) => intitule);

    assert.ok(!sansSession.includes("classement (action, anonyme)"));
    assert.ok(sansSession.includes("fiche publique"), "la moitié anonyme part quand même");
    assert.ok(avecSession.includes("classement (action, anonyme)"));
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
    const requete = module.connexion?.requete({
      identifiant: "07194591",
      motDePasse: "un-secret",
      action: null,
    });

    assert.equal(requete?.url, "https://www.myffbad.fr/connexion");
    assert.equal(requete?.methode, "POST");
    assert.equal(requete?.jeton, null, "on se connecte sans session, forcément");
    assert.equal(
      requete?.corps,
      '[{"licence":"07194591","password":"un-secret","rememberMe":true}]',
    );
    assert.equal(requete?.entetes?.["next-action"], "404027a3acdeccf7af10522b3c0ef83c50db1a555d");
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

/**
 * La capture réelle de l'action « classement », relevée le 1er septembre 2026
 * par la sonde de 015 et archivée telle quelle.
 *
 * C'est la première des deux vérifications que 001 exige : le parseur rejoué
 * sur une capture réelle, sans réseau. La seconde — une passe réelle constatée
 * une fois à la mise en service — ne se joue pas ici, et c'est voulu : celle-ci
 * ne prouverait que le parseur, pas la chaîne session → requête → base → page.
 */
const FICHE = readFileSync(new URL("exemples/myffbad-classement.txt", import.meta.url), "utf8");

function reponse(contenu: string) {
  return {
    url: "https://www.myffbad.fr/joueur/07194591",
    statutHttp: 200,
    contenu,
    cookies: [],
  };
}

/** La fiche réelle, réduite aux clés que le parseur lit, pour en varier une. */
function ficheAvec(remplacements: Record<string, unknown>): string {
  const ligne = {
    RankingDate: "2026-09-01",
    SimpleSubLevel: "D9",
    SimpleRate: "936.00",
    DoubleSubLevel: "D8",
    DoubleRate: "1311.00",
    MixteSubLevel: "D9",
    MixteRate: "1007.00",
    ...remplacements,
  };
  return `0:{"b":"DQCg8nwBq71o32okRTijN"}\n1:${JSON.stringify(ligne)}\n`;
}

describe("le classement lu sur la fiche", () => {
  it("rend les trois disciplines de la capture réelle, dans l'ordre", () => {
    assert.deepEqual(classementDuJoueur(reponse(FICHE)), [
      { discipline: "simple", lettre: "D9", cpph: 936 },
      { discipline: "double", lettre: "D8", cpph: 1311 },
      { discipline: "mixte", lettre: "D9", cpph: 1007 },
    ]);
  });

  it("omet la discipline que la fiche ne porte pas, sans l'inventer", () => {
    const sansMixte = classementDuJoueur(reponse(ficheAvec({ MixteSubLevel: null })));

    assert.deepEqual(
      sansMixte.map(({ discipline }) => discipline),
      ["simple", "double"],
    );
  });

  it("prend `NC` pour ce qu'il est : une lettre du barème", () => {
    const nonClasse = ficheAvec({ SimpleSubLevel: "NC", SimpleRate: "0.00" });

    assert.deepEqual(classementDuJoueur(reponse(nonClasse))[0], {
      discipline: "simple",
      lettre: "NC",
      cpph: 0,
    });
  });

  it("échoue plutôt que d'entrer en base une lettre hors barème", () => {
    // Le seul moyen qu'un barème qui change se voie : sans ce refus, la page
    // servirait une donnée fausse avec l'aplomb d'une donnée vraie (019).
    assert.throws(
      () => classementDuJoueur(reponse(ficheAvec({ DoubleSubLevel: "D10" }))),
      ClassementIllisible,
    );
  });

  it("échoue plutôt que d'entrer en base un CPPH qui n'est pas un nombre", () => {
    assert.throws(
      () => classementDuJoueur(reponse(ficheAvec({ SimpleRate: "non communiqué" }))),
      ClassementIllisible,
    );
    assert.throws(
      () => classementDuJoueur(reponse(ficheAvec({ SimpleRate: null }))),
      ClassementIllisible,
    );
  });

  it("rend une liste vide quand la réponse ne porte pas de classement", () => {
    // C'est le succès vide de 019 : statut 200, aucune erreur, rien dedans.
    assert.deepEqual(classementDuJoueur(reponse("0:{\"b\":\"BUILD\"}\n")), []);
  });
});

describe("la requête de classement du module", () => {
  it("vise la fiche du joueur demandé et l'action relevée, sans cookie", () => {
    // Le joueur visé, jamais le mien : le module est construit avec ma licence
    // pour la connexion et la sonde, mais 028 le promène sur toute l'équipe.
    const requete = module.classement?.requete(licence("02345678"), 999);

    assert.equal(requete?.url, "https://www.myffbad.fr/joueur/02345678");
    assert.equal(requete?.corps, "[999]");
    assert.equal(requete?.jeton, null, "la chaîne de 028 est anonyme de bout en bout");
    assert.equal(requete?.entetes?.["next-action"], "402130d79e01a1af99d4a0a294276979e5077b0fb0");
  });

  it("demande la fiche publique elle aussi sans cookie", () => {
    const requete = module.identite?.requete(licence("02345678"));

    assert.equal(requete?.url, "https://www.myffbad.fr/joueur/02345678");
    assert.equal(requete?.jeton, null);
  });
});

/**
 * La fiche réelle, relevée **sans session** le 2 septembre 2026 et archivée
 * telle quelle — 91 Ko, non tronquée (spec 028).
 *
 * Non tronquée à dessein : une capture réduite à la ligne utile ne casserait
 * plus le jour où myffbad déplace le bloc, et c'est justement ce déplacement
 * qu'on veut voir.
 */
const FICHE_PUBLIQUE = readFileSync(new URL("exemples/myffbad-fiche.html", import.meta.url), "utf8");

describe("l'identité lue sur la fiche publique", () => {
  it("rend le nom et le personId de la capture réelle, sans session", () => {
    // C'est le fait qui a renversé 015 : `isAuthenticated:false`, et le
    // `personId` que l'action exige est là, sur une page servie à froid.
    assert.deepEqual(identiteDuJoueur(reponse(FICHE_PUBLIQUE), licence("07194591")), {
      licence: "07194591",
      nom: "Simon RENOULT",
      personId: 1083591,
    });
    assert.match(FICHE_PUBLIQUE, /isAuthenticated\\":false/);
  });

  it("ne porte aucun genre, ce qui laisse le sexe au CSV de 005", () => {
    for (const clef of ["gender", "sexe", "\"SH\"", "\"SD\""]) {
      assert.ok(!FICHE_PUBLIQUE.includes(clef), `la fiche ne porte pas ${clef}`);
    }
  });

  it("refuse la fiche qui répond pour quelqu'un d'autre", () => {
    // Une licence bien formée mais erronée rapporte le nom et le classement
    // d'un inconnu : rien d'autre que ce contrôle ne le dit avant la page.
    assert.throws(
      () => identiteDuJoueur(reponse(FICHE_PUBLIQUE), licence("02345678")),
      IdentiteIllisible,
    );
  });

  it("refuse la page qui ne porte pas de bloc d'identité", () => {
    assert.throws(
      () => identiteDuJoueur(reponse('0:{"b":"BUILD"}\n'), licence("07194591")),
      IdentiteIllisible,
    );
  });

  it("refuse un personId ou un nom que myffbad aurait vidés", () => {
    const bloc = (remplacements: Record<string, unknown>) =>
      `0:{"b":"BUILD"}\n1:${JSON.stringify([
        "$",
        "$L44",
        null,
        { personId: 1083591, fullName: "Simon RENOULT", licence: "07194591", ...remplacements },
      ])}\n`;

    assert.throws(() => identiteDuJoueur(reponse(bloc({ personId: 0 })), licence("07194591")), IdentiteIllisible);
    assert.throws(() => identiteDuJoueur(reponse(bloc({ fullName: "  " })), licence("07194591")), IdentiteIllisible);
  });
});

describe("les pages sondées, deuxième moitié", () => {
  it("exerce la fiche publique sans cookie, session ou pas", () => {
    for (const jeton of [null, `jwt=${jwt({ personId: "1083591", exp: 1790869415 })}`]) {
      const fiche = module.pagesDeLaSonde(jeton).find(({ intitule }) => intitule === "fiche publique");

      assert.equal(fiche?.requete.url, "https://www.myffbad.fr/joueur/07194591");
      assert.equal(fiche?.requete.jeton, null);
    }
  });

  it("compte l'identité extraite, parce qu'une page qui répond peut ne rien rendre", () => {
    const fiche = module.pagesDeLaSonde(null).find(({ intitule }) => intitule === "fiche publique");

    assert.equal(fiche?.extraire?.(reponse(FICHE_PUBLIQUE)), 1);
    assert.equal(fiche?.extraire?.(reponse('0:{"b":"BUILD"}\n')), 0);
  });
});
