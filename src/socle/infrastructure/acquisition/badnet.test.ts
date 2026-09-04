import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ACTION_RECHERCHE,
  actionDeConnexion,
  moduleBadnet,
  rechercheDeTournois,
  tournoisDeLaRecherche,
} from "./badnet.ts";

/**
 * Réponse réelle du POST de connexion, relevée le 4 septembre 2026 : badnet a
 * ouvert la session **sans réclamer de code**. Soixante-neuf octets de
 * redirection JavaScript, et rien d'autre.
 */
const CONNEXION_REUSSIE = readFileSync(
  new URL("exemples/badnet-connexion.html", import.meta.url),
  "utf8",
);

/** Réponse réelle de la recherche publique, relevée le 1er septembre 2026. */
const RECHERCHE = readFileSync(
  new URL("exemples/badnet-recherche.html", import.meta.url),
  "utf8",
);

function reponse(contenu: string) {
  return { url: "https://badnet.fr/index.php", statutHttp: 200, contenu, cookies: [] };
}

describe("la recherche publique de tournois", () => {
  const requete = rechercheDeTournois({
    autourDe: { longitude: 2.3488, latitude: 48.8534 },
    rayonKm: 25,
    aVenir: true,
  });

  it("n'engage aucun compte : ni session, ni cookie", () => {
    assert.equal(requete.jeton, null);
  });

  it("poste sur le routeur iclick, avec l'action de recherche", () => {
    assert.equal(requete.url, "https://badnet.fr/index.php");
    assert.equal(requete.methode, "POST");

    const champs = new URLSearchParams(requete.corps);
    assert.equal(champs.get("ic_a"), ACTION_RECHERCHE);
    assert.equal(champs.get("type_event"), "70", "les compétitions individuelles");
    assert.equal(champs.get("city"), "2.3488;48.8534", "longitude d'abord, c'est ce qu'attend badnet");
    assert.equal(champs.get("rayon"), "25");
    assert.equal(champs.get("coming"), "1");
  });

  it("omet `coming` quand on ne veut pas se limiter à l'à-venir", () => {
    const large = rechercheDeTournois({
      autourDe: { longitude: 2.3488, latitude: 48.8534 },
      rayonKm: 25,
      aVenir: false,
    });

    assert.equal(new URLSearchParams(large.corps).get("coming"), null);
  });
});

describe("la lecture des résultats", () => {
  it("lit le JSON de la carte, et non les cartes", () => {
    const tournois = tournoisDeLaRecherche(reponse(RECHERCHE));

    assert.equal(tournois.length, 3);
    assert.partialDeepStrictEqual(tournois[0], {
      id: 50898,
      nom: "Circuit Jeune Départemental 95 - TOP ELITE DEPARTEMENTAL 1",
      classements: "R, D, P, NC",
      categories: "Jeunes",
    });
  });

  it("rend les coordonnées du gymnase, que seule cette source porte", () => {
    const [premier] = tournoisDeLaRecherche(reponse(RECHERCHE));

    assert.ok(Number.isFinite(premier?.latitude), "latitude exploitable");
    assert.ok(Number.isFinite(premier?.longitude), "longitude exploitable");
  });

  it("rend une liste vide plutôt que de lever, quand le fragment a changé", () => {
    assert.deepEqual(tournoisDeLaRecherche(reponse("<div>rien de connu</div>")), []);
    assert.deepEqual(tournoisDeLaRecherche(reponse('<div data-markers="pas du json"></div>')), []);
  });
});

describe("les deux visages de badnet", () => {
  it("ne fait jamais passer la recherche sous session, même quand il y en a une", () => {
    const pages = moduleBadnet.pagesDeLaSonde("session=valide");

    assert.equal(pages.length, 1, "les engagements relèvent de la spec 027, pas d'ici");
    assert.equal(pages[0]?.requete.jeton, null);
  });

  it("compte les tournois extraits, et non les octets reçus", () => {
    const [recherche] = moduleBadnet.pagesDeLaSonde(null);

    assert.equal(recherche?.extraire?.(reponse(RECHERCHE)), 3);
    assert.equal(recherche?.extraire?.(reponse("<div>plus rien</div>")), 0);
  });
});

/**
 * Le mur réel, tel que `GET https://badnet.fr/competitions` le rendait le
 * 4 septembre 2026 — champs et action relevés à la main sur le site.
 */
const MUR_REEL = `<form  method="post" action="index.php" data-ic_t="card_target" class="ic-form" data-ic_cb="noValidPopup">
<input name="ic_a" type="hidden" value="f232399d98e01deaa9a63ed008b915e5">
<input name="ic_ajax" type="hidden" value="1">
<input name="login" type="text"><input name="pwd" type="password"><input name="remember" type="checkbox">`;

describe("la connexion badnet", () => {
  it("relève l'identifiant d'action sur le mur, plutôt que de l'écrire en dur", () => {
    // Une action de connexion périmée laisse la session mourir sans que rien ne
    // la renouvelle : c'est le seul mode de panne qu'on ne verrait pas venir.
    assert.equal(actionDeConnexion(reponse(MUR_REEL)), "f232399d98e01deaa9a63ed008b915e5");
    assert.equal(actionDeConnexion(reponse("<p>pas de formulaire</p>")), null);
  });

  it("reconnaît le mur de connexion à ses champs, pas à une phrase", () => {
    assert.equal(moduleBadnet.murDeConnexion(reponse(MUR_REEL)), true);
    assert.equal(moduleBadnet.murDeConnexion(reponse("<div>mes engagements</div>")), false);
  });

  it("poste la licence, le mot de passe et l'action relevée", () => {
    const requete = moduleBadnet.connexion?.requete({
      identifiant: "07194591",
      motDePasse: "un-secret",
      action: "f232399d98e01deaa9a63ed008b915e5",
    });

    assert.equal(requete?.methode, "POST");
    assert.equal(requete?.jeton, null, "on se connecte sans session, forcément");
    assert.match(requete?.corps ?? "", /login=07194591/);
    assert.match(requete?.corps ?? "", /ic_a=f232399d98e01deaa9a63ed008b915e5/);
    // `remember` demande la session la plus longue que badnet accorde : chaque
    // expiration coûte un aller-retour dans une boîte mail.
    assert.match(requete?.corps ?? "", /remember=1/);
  });

  it("lit le cookie de session PHP, et lui seul", () => {
    const jeton = moduleBadnet.connexion?.jetonDepuisLesCookies([
      "cookieconsent=1; Path=/",
      "PHPSESSID=abcdef0123456789; Path=/; HttpOnly",
    ]);

    assert.equal(jeton, "PHPSESSID=abcdef0123456789");
    assert.equal(moduleBadnet.connexion?.jetonDepuisLesCookies(["autre=1"]), null);
  });

  it("distingue le mur du code de celui de la connexion", () => {
    const deuxiemeTemps = moduleBadnet.connexion?.deuxiemeTemps;

    // Les confondre ferait redemander un mot de passe là où il faut recopier
    // six chiffres.
    assert.equal(deuxiemeTemps?.reclameUnCode(reponse('<input name="code">')), true);
    assert.equal(deuxiemeTemps?.reclameUnCode(reponse(MUR_REEL)), false);
  });

  it("rejoue les cookies du premier temps avec le code", () => {
    const requete = moduleBadnet.connexion?.deuxiemeTemps?.confirmation(
      "123456",
      ["PHPSESSID=avant; Path=/"],
      reponse(`<input name="ic_a" type="hidden" value="abc123"><input name="code">`),
    );

    assert.match(requete?.jeton ?? "", /PHPSESSID=avant/);
    assert.match(requete?.corps ?? "", /code=123456/);
    assert.match(requete?.corps ?? "", /ic_a=abc123/);
  });
});

describe("la réponse réelle du 4 septembre 2026", () => {
  /**
   * La mesure qui corrige la spec : badnet n'a pas déclenché sa 2FA. C'est le
   * cas prévu — « si aucun code n'est réclamé, on prend la session telle
   * quelle » — et il s'est présenté au premier essai.
   */
  it("ne réclame aucun code", () => {
    assert.equal(
      moduleBadnet.connexion?.deuxiemeTemps?.reclameUnCode(reponse(CONNEXION_REUSSIE)),
      false,
    );
  });

  it("n'est pas le mur de connexion non plus", () => {
    // Ni mur, ni code : c'est ce qui, avec le cookie, vaut « entré ».
    assert.equal(moduleBadnet.murDeConnexion(reponse(CONNEXION_REUSSIE)), false);
  });

  /**
   * Le corps ne porte pas la session — c'est l'en-tête `Set-Cookie` qui la
   * porte. Une réponse de soixante-neuf octets aurait pu passer pour vide : il
   * a fallu la capture archivée pour le voir, et c'est exactement l'usage que
   * 019 prévoit pour elles.
   */
  it("tient en une redirection JavaScript, sans rien dire de la session", () => {
    assert.match(CONNEXION_REUSSIE, /location='\/tableau-de-bord'/);
    assert.equal(moduleBadnet.connexion?.jetonDepuisLesCookies([]), null);
  });
});
