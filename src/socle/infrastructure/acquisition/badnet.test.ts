import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ACTION_RECHERCHE,
  moduleBadnet,
  rechercheDeTournois,
  tournoisDeLaRecherche,
} from "./badnet.ts";

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
