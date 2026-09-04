import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Classement } from "../../socle/core/classement.ts";
import type { Licence } from "../../socle/core/licence.ts";
import { licence } from "../../socle/core/licence.ts";
import type { MembreDeLEquipe, Sexe } from "./coequipier.ts";
import { forceDuTableau } from "./forces-par-tableau.ts";
import type { Paire } from "./paires.ts";
import {
  PaireRefusee,
  paireCanonique,
  seJoueEnPaires,
  tableauDeLaPaire,
  tableauDuCapitaine,
  verifierLaPaire,
} from "./paires.ts";

/**
 * Les licences font huit chiffres, zéros de tête compris (028). Des numéros
 * lisibles plutôt que réalistes : ce qu'on teste ici est un ordre, pas un
 * format.
 */
function membre(
  numero: string,
  nom: string | null,
  sexe: Sexe,
  classements: readonly Classement[],
): MembreDeLEquipe {
  return {
    licence: licence(numero),
    sexe,
    telephone: "0600000000",
    appel: "0600000000",
    fiche: `https://www.myffbad.fr/joueur/${numero}`,
    nom,
    classements,
    vuLe: nom === null ? null : new Date(2026, 8, 4),
  };
}

const classement = (discipline: Classement["discipline"], lettre: string, cpph: number) =>
  ({ discipline, lettre, cpph }) as Classement;

const ANNE = membre("00000001", "Anne MARTIN", "F", [
  classement("double", "D8", 1200),
  classement("mixte", "D7", 1400),
]);
const BRUNO = membre("00000002", "Bruno DUPONT", "M", [
  classement("double", "D7", 1500),
  classement("mixte", "D8", 1100),
]);
const CLARA = membre("00000003", "Clara DURAND", "F", [
  classement("double", "D9", 900),
  classement("mixte", "D9", 950),
]);
const DAVID = membre("00000004", "David PETIT", "M", [
  classement("double", "D9", 1000),
  classement("mixte", "R6", 1900),
]);
/** Jamais relevé : le cas qui sent la licence fausse (029). */
const INCONNU = membre("00000005", null, "M", []);

const EQUIPE = [ANNE, BRUNO, CLARA, DAVID, INCONNU];

function paire(id: number, un: MembreDeLEquipe, autre: MembreDeLEquipe, privilegiee = false): Paire {
  return { id, licences: paireCanonique(un.licence, autre.licence), privilegiee };
}

function page(options: {
  readonly tableau: Parameters<typeof forceDuTableau>[1];
  readonly paires?: readonly Paire[];
  readonly marques?: readonly { licence: Licence; tableau: string }[];
  readonly equipe?: readonly MembreDeLEquipe[];
}) {
  const equipe = options.equipe ?? EQUIPE;
  return tableauDuCapitaine({
    force: forceDuTableau(equipe, options.tableau),
    equipe,
    paires: options.paires ?? [],
    marques: (options.marques ?? []) as never,
  });
}

describe("le tableau d'une paire", () => {
  it("se déduit des deux sexes, sans autre choix possible", () => {
    assert.equal(tableauDeLaPaire("M", "M"), "DH");
    assert.equal(tableauDeLaPaire("F", "F"), "DD");
    assert.equal(tableauDeLaPaire("M", "F"), "MX");
    assert.equal(tableauDeLaPaire("F", "M"), "MX");
  });

  it("ne concerne que les trois tableaux qui se jouent à deux", () => {
    assert.equal(seJoueEnPaires("DH"), true);
    assert.equal(seJoueEnPaires("MX"), true);
    assert.equal(seJoueEnPaires("SH"), false);
    assert.equal(seJoueEnPaires("SD"), false);
  });

  /**
   * « Dupont avec Martin » et « Martin avec Dupont » sont la même décision.
   * Sans cette mise en forme, l'index d'unicité ne verrait pas le doublon.
   */
  it("range les deux licences pour que le doublon soit visible", () => {
    assert.deepEqual(paireCanonique(BRUNO.licence, ANNE.licence), [ANNE.licence, BRUNO.licence]);
    assert.deepEqual(paireCanonique(ANNE.licence, BRUNO.licence), [ANNE.licence, BRUNO.licence]);
  });
});

describe("la saisie d'une paire", () => {
  const verifier = (licences: readonly string[], tableau: Parameters<typeof forceDuTableau>[1]) =>
    verifierLaPaire({ licences, tableau, equipe: EQUIPE });

  it("accepte deux joueurs dont les sexes donnent le tableau demandé", () => {
    assert.deepEqual(verifier([BRUNO.licence, DAVID.licence], "DH"), [
      BRUNO.licence,
      DAVID.licence,
    ]);
  });

  it("refuse une paire qui appartiendrait à un autre tableau", () => {
    assert.throws(() => verifier([BRUNO.licence, DAVID.licence], "DD"), PaireRefusee);
    assert.throws(() => verifier([ANNE.licence, BRUNO.licence], "DH"), PaireRefusee);
  });

  it("refuse un joueur avec lui-même, et un joueur hors de l'équipe", () => {
    assert.throws(() => verifier([BRUNO.licence, BRUNO.licence], "DH"), PaireRefusee);
    assert.throws(() => verifier([BRUNO.licence, "99999999"], "DH"), PaireRefusee);
  });

  it("refuse un champ laissé vide", () => {
    assert.throws(() => verifier([BRUNO.licence], "DH"), PaireRefusee);
  });
});

describe("les paires d'un tableau", () => {
  it("sont ordonnées à la moyenne des deux cotes", () => {
    const { paires } = page({
      tableau: "DH",
      // Bruno + David = (1500 + 1000) / 2 = 1250.
      paires: [paire(1, BRUNO, DAVID)],
    });

    assert.equal(paires.length, 1);
    assert.equal(paires[0]?.cote, 1250);
  });

  it("classe une paire moins forte après une paire plus forte", () => {
    const { paires } = page({
      tableau: "MX",
      paires: [
        // Anne + Bruno = (1400 + 1100) / 2 = 1250.
        paire(1, ANNE, BRUNO),
        // Clara + David = (950 + 1900) / 2 = 1425.
        paire(2, CLARA, DAVID),
      ],
    });

    assert.deepEqual(
      paires.map(({ id, cote }) => [id, cote]),
      [
        [2, 1425],
        [1, 1250],
      ],
    );
  });

  /**
   * Une moyenne demande deux cotes. Remplacer celle qui manque par zéro
   * rangerait la paire dernière — exactement ce que 029 refuse de faire d'un
   * joueur non classé, au motif qu'en début de saison c'est presque toujours
   * une licence fausse et pas un joueur faible.
   */
  it("sort de l'ordre la paire dont un membre n'est pas classé", () => {
    const { paires, pairesHorsOrdre } = page({
      tableau: "DH",
      paires: [paire(1, BRUNO, DAVID), paire(2, BRUNO, INCONNU)],
    });

    assert.deepEqual(
      paires.map(({ id }) => id),
      [1],
    );
    assert.deepEqual(
      pairesHorsOrdre.map(({ id, cote }) => [id, cote]),
      [[2, null]],
    );
  });

  it("n'affiche une paire que sur le tableau de ses deux sexes", () => {
    const paires = [paire(1, BRUNO, DAVID), paire(2, ANNE, CLARA), paire(3, ANNE, BRUNO)];

    assert.deepEqual(
      page({ tableau: "DH", paires }).paires.map(({ id }) => id),
      [1],
    );
    assert.deepEqual(
      page({ tableau: "DD", paires }).paires.map(({ id }) => id),
      [2],
    );
    assert.deepEqual(
      page({ tableau: "MX", paires }).paires.map(({ id }) => id),
      [3],
    );
  });

  it("ignore une paire dont un membre a quitté l'équipe", () => {
    const { paires, pairesHorsOrdre } = page({
      tableau: "DH",
      equipe: [BRUNO, DAVID],
      paires: [paire(1, BRUNO, DAVID), { id: 2, licences: [BRUNO.licence, licence("99999999")], privilegiee: false }],
    });

    assert.deepEqual([...paires, ...pairesHorsOrdre].map(({ id }) => id), [1]);
  });

  it("ne cherche aucune paire sur un simple", () => {
    const { enPaires, paires, emplacements } = page({
      tableau: "SH",
      paires: [paire(1, BRUNO, DAVID)],
    });

    assert.equal(enPaires, false);
    assert.deepEqual(paires, []);
    assert.deepEqual(emplacements, []);
  });
});

describe("ce que le capitaine privilégie", () => {
  /**
   * Deux blocs, pas un bonus de points : un bonus produirait un ordre qui ne
   * serait ni celui du classement ni celui du capitaine.
   */
  it("remonte une paire marquée en tête sans perdre l'ordre des cotes", () => {
    const { paires } = page({
      tableau: "MX",
      paires: [
        paire(1, CLARA, DAVID), // 1425, la plus forte
        paire(2, ANNE, BRUNO, true), // 1250, mais privilégiée
      ],
    });

    assert.deepEqual(
      paires.map(({ id }) => id),
      [2, 1],
    );
  });

  it("garde le meilleur non marqué en tête de son bloc", () => {
    const ELIOTT = membre("00000006", "Eliott ROY", "M", [classement("double", "R6", 1800)]);
    const equipe = [...EQUIPE, ELIOTT];

    const { joueurs } = page({
      tableau: "DH",
      equipe,
      marques: [{ licence: DAVID.licence, tableau: "DH" }],
    });

    // David est marqué et passe premier ; derrière lui, l'ordre des cotes est
    // intact — Eliott 1800, puis Bruno 1500.
    assert.deepEqual(
      joueurs.map(({ nom }) => nom),
      ["David PETIT", "Eliott ROY", "Bruno DUPONT"],
    );
  });

  /**
   * Ce qu'on privilégie n'est pas un joueur, c'est un joueur à cette place.
   */
  it("marque un joueur sur un tableau sans le marquer sur les autres", () => {
    const marques = [{ licence: BRUNO.licence, tableau: "DH" }];

    const enDouble = page({ tableau: "DH", marques });
    const enMixte = page({ tableau: "MX", marques });

    assert.equal(enDouble.joueurs.find(({ licence: l }) => l === BRUNO.licence)?.privilegie, true);
    assert.equal(enMixte.joueurs.find(({ licence: l }) => l === BRUNO.licence)?.privilegie, false);
  });

  it("marque aussi une paire restée hors de l'ordre", () => {
    const { pairesHorsOrdre } = page({
      tableau: "DH",
      paires: [paire(1, BRUNO, INCONNU, true)],
    });

    // Une paire est une intention, pas un calcul : elle se marque même quand
    // aucune cote ne permet de la ranger.
    assert.equal(pairesHorsOrdre[0]?.privilegiee, true);
  });
});

describe("le formulaire de saisie", () => {
  it("offre un champ par place, filtré au sexe de la place", () => {
    const { emplacements } = page({ tableau: "MX" });

    assert.deepEqual(
      emplacements.map(({ sexe }) => sexe),
      ["M", "F"],
    );
    assert.deepEqual(
      emplacements[0]?.candidats.map(({ nom }) => nom),
      ["Bruno DUPONT", "David PETIT", null],
    );
    assert.deepEqual(
      emplacements[1]?.candidats.map(({ nom }) => nom),
      ["Anne MARTIN", "Clara DURAND"],
    );
  });

  it("propose deux champs identiques sur un double", () => {
    const { emplacements } = page({ tableau: "DH" });

    assert.equal(emplacements.length, 2);
    assert.deepEqual(
      emplacements.map(({ sexe }) => sexe),
      ["M", "M"],
    );
  });

  /**
   * Une paire est une intention : on peut vouloir essayer quelqu'un que la
   * passe n'a pas encore relevé, et qui n'a donc aucune cote.
   */
  it("propose les joueurs non relevés, que l'ordre de force écarte pourtant", () => {
    const { emplacements, force } = page({ tableau: "DH" });

    assert.equal(
      emplacements[0]?.candidats.some(({ licence: l }) => l === INCONNU.licence),
      true,
    );
    assert.equal(
      force.alignables.some(({ licence: l }) => l === INCONNU.licence),
      false,
    );
  });
});
