import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Tournoi } from "../../socle/core/tournoi.ts";
import { distanceAVolDOiseau, resultatsDeLaVeille } from "./resultats.ts";
import type { Veille } from "./veille.ts";

const MAINTENANT = new Date("2026-09-09T08:00:00.000Z");

/** Paris, et un rayon de 50 km : le périmètre par défaut du formulaire. */
const VEILLE: Veille = {
  id: 1,
  nom: "DH avec Louis",
  active: true,
  latitude: 48.8534,
  longitude: 2.3488,
  rayonKm: 50,
  fenetre: { nature: "glissante", jours: 90 },
  tableaux: ["DH", "MX"],
  series: ["D7", "D8", "D9"],
  categories: [],
  ouvertes: true,
};

function tournoi(partiel: Partial<Tournoi> & { evenement: number }): Tournoi {
  return {
    nom: `Tournoi ${partiel.evenement}`,
    gymnase: null,
    adresse: null,
    ville: "Courbevoie",
    // Courbevoie : 8 km du centre de Paris, largement dans le rayon.
    latitude: 48.8967,
    longitude: 2.2567,
    dateLimite: null,
    familles: "D, P, NC",
    categories: "Seniors",
    tableaux: ["DH", "MX"],
    series: ["D8", "D9"],
    ficheRelevee: true,
    journees: [new Date("2026-10-24T12:00:00.000Z")],
    ...partiel,
  };
}

describe("ce qu'une veille retient", () => {
  it("retient un tournoi qui répond à tous les critères", () => {
    const { retenus } = resultatsDeLaVeille(VEILLE, [tournoi({ evenement: 1 })], MAINTENANT);

    assert.equal(retenus.length, 1);
    assert.equal(retenus[0]?.ville, "Courbevoie");
    assert.equal(retenus[0]?.distanceKm, 8, "à vol d'oiseau, calculée ici");
    assert.match(retenus[0]?.fiche ?? "", /tournoi\/public\/informations\?eventid=1/);
  });

  it("écarte ce qui est hors du rayon, même si l'index le porte encore", () => {
    // badnet coupe juste : ce filtre ne le corrige pas. Il sert quand on
    // resserre le rayon d'une veille — l'index garde jusqu'au lendemain les
    // tournois de l'ancien périmètre, et la page doit être juste tout de suite.
    const orleans = tournoi({ evenement: 2, latitude: 47.9029, longitude: 1.9093 });
    const { retenus, ecartes } = resultatsDeLaVeille(VEILLE, [orleans], MAINTENANT);

    assert.equal(retenus.length, 0, "111 km, pour un rayon de 50");
    assert.equal(ecartes, 1);
  });

  it("écarte un tournoi hors de la fenêtre", () => {
    const tropLoin = tournoi({ evenement: 3, journees: [new Date("2027-06-01T12:00:00.000Z")] });
    assert.equal(resultatsDeLaVeille(VEILLE, [tropLoin], MAINTENANT).retenus.length, 0);
  });

  it("écarte un tournoi dont les inscriptions sont closes, si on l'a demandé", () => {
    const close = tournoi({ evenement: 4, dateLimite: new Date("2026-09-01T12:00:00.000Z") });

    assert.equal(resultatsDeLaVeille(VEILLE, [close], MAINTENANT).retenus.length, 0);
    assert.equal(
      resultatsDeLaVeille({ ...VEILLE, ouvertes: false }, [close], MAINTENANT).retenus.length,
      1,
      "le critère se décoche",
    );
  });

  it("écarte un tournoi dont aucune série ne m'admet", () => {
    // Le cas que le champ `clt` de la recherche ne sait pas dire : il annonce
    // une famille, la fiche donne les rangs.
    const nationalSeulement = tournoi({ evenement: 5, series: ["N1", "N2", "N3"] });
    assert.equal(resultatsDeLaVeille(VEILLE, [nationalSeulement], MAINTENANT).retenus.length, 0);
  });

  it("écarte un tournoi qui ne propose pas mes tableaux", () => {
    const simpleSeulement = tournoi({ evenement: 6, tableaux: ["SH", "SD"] });
    assert.equal(resultatsDeLaVeille(VEILLE, [simpleSeulement], MAINTENANT).retenus.length, 0);
  });

  it("met à part, jamais à l'écart, ce que l'organisateur n'a pas déclaré", () => {
    // Ce sont les tournois fraîchement publiés — ceux que 013 existe pour
    // attraper, et ceux qui se remplissent le plus vite. « Indéterminé » n'est
    // pas « pas pour moi ».
    const neuf = tournoi({ evenement: 7, tableaux: [], series: [] });
    const { retenus, indetermines, ecartes } = resultatsDeLaVeille(VEILLE, [neuf], MAINTENANT);

    assert.equal(retenus.length, 0);
    assert.equal(indetermines.length, 1);
    assert.equal(ecartes, 0, "il n'est pas écarté, il est ailleurs");
  });

  it("compte à part ceux dont la fiche n'est pas encore relevée", () => {
    // La recherche passe à 5 h 15, les fiches à 5 h 30 : un tournoi découvert ce
    // matin n'a ni ville ni tableaux avant le quart d'heure suivant. La page le
    // dit plutôt que de faire disparaître des lignes qu'elle affichera demain.
    const ceMatin = tournoi({ evenement: 8, ficheRelevee: false, tableaux: [], series: [] });
    const resultats = resultatsDeLaVeille(VEILLE, [ceMatin], MAINTENANT);

    assert.equal(resultats.enAttenteDeFiche, 1);
    assert.equal(resultats.indetermines.length, 0);
    assert.equal(resultats.ecartes, 0);
  });

  it("trie par date, et range en dernier ce dont on ignore la date", () => {
    // Jamais sur le libellé : « du 3 au 4 octobre » et « samedi 14 novembre » se
    // comparent très mal comme deux chaînes. Et un tournoi sans date ne doit pas
    // remonter en tête, où il ferait croire à une échéance imminente.
    const resultats = resultatsDeLaVeille(
      VEILLE,
      [
        tournoi({ evenement: 1, journees: [new Date("2026-11-14T12:00:00.000Z")] }),
        tournoi({ evenement: 2, journees: [], dateLimite: null }),
        tournoi({ evenement: 3, journees: [new Date("2026-10-03T12:00:00.000Z")] }),
      ],
      MAINTENANT,
    );

    assert.deepEqual(
      resultats.retenus.map(({ evenement }) => evenement),
      [3, 1, 2],
    );
    assert.equal(resultats.retenus[2]?.quand, "dates non relevées");
  });
});

describe("la distance à vol d'oiseau", () => {
  it("mesure ce que le champ `distance` de badnet annonce faux", () => {
    // Relevé le 8 septembre 2026 : badnet annonçait « 9 km » pour un tournoi
    // parisien à 1,6 km, « 38 km » pour Créteil à 13. Le champ est vide deux
    // fois sur trois, et faux quand il ne l'est pas.
    const paris = { latitude: 48.8534, longitude: 2.3488 };

    assert.equal(distanceAVolDOiseau(paris, { latitude: 48.8534, longitude: 2.3488 }), 0);
    assert.equal(distanceAVolDOiseau(paris, { latitude: 48.8967, longitude: 2.2567 }), 8, "Courbevoie");
    assert.equal(distanceAVolDOiseau(paris, { latitude: 47.9029, longitude: 1.9093 }), 111, "Orléans");
    assert.equal(distanceAVolDOiseau(paris, { latitude: null, longitude: null }), null);
  });
});
