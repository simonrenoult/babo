import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Classement } from "../../socle/core/classement.ts";
import type { Tableau } from "../../socle/core/tableau.ts";
import { licence } from "../../socle/core/licence.ts";
import type { MembreDeLEquipe, Sexe } from "./coequipier.ts";
import { forceDuTableau, forcesParTableau } from "./forces-par-tableau.ts";

const RELEVE_LE = new Date("2026-09-01T05:00:00Z");

/**
 * Un membre tel que `listeDeLEquipe` le rend — spec 028. On part de là et non
 * des dépôts : ce fichier teste la bascule d'une liste de personnes vers cinq
 * tableaux, pas la lecture de la base.
 */
function membre(
  numero: string,
  nom: string | null,
  sexe: Sexe,
  classements: readonly Classement[] = [],
): MembreDeLEquipe {
  return {
    licence: licence(numero),
    sexe,
    telephone: "0600000000",
    appel: "0600000000",
    fiche: `https://www.myffbad.fr/joueur/${numero}`,
    nom,
    classements,
    vuLe: nom === null ? null : RELEVE_LE,
  };
}

const simple = (lettre: Classement["lettre"], cpph: number): Classement => ({
  discipline: "simple",
  lettre,
  cpph,
});
const double = (lettre: Classement["lettre"], cpph: number): Classement => ({
  discipline: "double",
  lettre,
  cpph,
});
const mixte = (lettre: Classement["lettre"], cpph: number): Classement => ({
  discipline: "mixte",
  lettre,
  cpph,
});

const noms = (equipe: readonly MembreDeLEquipe[], tableau: Tableau) =>
  forceDuTableau(equipe, tableau).alignables.map(({ nom }) => nom);

describe("les forces par tableau", () => {
  it("range les alignables du plus fort au plus faible, à la cote", () => {
    const equipe = [
      membre("01111111", "Bruno FAIBLE", "M", [simple("P10", 512)]),
      membre("02222222", "Alice FORTE", "F", [simple("D8", 1204)]),
      membre("03333333", "Carl FORT", "M", [simple("D8", 1198)]),
    ];

    assert.deepEqual(noms(equipe, "SH"), ["Carl FORT", "Bruno FAIBLE"]);
    assert.deepEqual(noms(equipe, "SD"), ["Alice FORTE"]);
  });

  it("n'ouvre un tableau qu'au sexe qui y joue", () => {
    // Une femme n'est pas « écartée du DH faute de classement » : elle n'y joue
    // pas. La nommer là serait un reproche adressé à la mauvaise personne.
    const equipe = [
      membre("01111111", "Alice DUPONT", "F", [double("D9", 900)]),
      membre("02222222", "Simon RENOULT", "M", [double("D8", 1311)]),
    ];

    const doubleHommes = forceDuTableau(equipe, "DH");
    assert.deepEqual(noms(equipe, "DH"), ["Simon RENOULT"]);
    assert.deepEqual(doubleHommes.ecartes, [], "aucune femme écartée du double hommes");
    assert.deepEqual(noms(equipe, "DD"), ["Alice DUPONT"]);
  });

  it("prend les deux sexes en mixte, et compte les places séparément", () => {
    const troisHommes = [
      membre("01111111", "Un HOMME", "M", [mixte("D9", 1007)]),
      membre("02222222", "Deux HOMME", "M", [mixte("D9", 1005)]),
      membre("03333333", "Trois HOMME", "M", [mixte("D9", 1003)]),
    ];

    const mixteDeTroisHommes = forceDuTableau(troisHommes, "MX");
    assert.equal(mixteDeTroisHommes.alignables.length, 3, "trois joueurs éligibles");
    assert.deepEqual(
      mixteDeTroisHommes.manques,
      [{ sexe: "F", nombre: 1 }],
      "et le tableau reste infaisable : un mixte demande un de chaque",
    );

    const avecUneFemme = forceDuTableau(
      [...troisHommes, membre("04444444", "Une FEMME", "F", [mixte("P10", 700)])],
      "MX",
    );
    assert.deepEqual(avecUneFemme.manques, []);
  });

  it("compte le manque, sans jamais l'estimer", () => {
    // Deux faits par tableau et rien d'autre : l'effectif permet-il de le
    // remplir, et combien de joueurs sont éligibles. Pas de verdict de niveau,
    // qui demanderait un seuil — et 001 a déjà refusé les seuils.
    const equipe = [
      membre("01111111", "Alice DUPONT", "F", [double("D9", 900), simple("D9", 880)]),
      membre("02222222", "Simon RENOULT", "M", [double("D8", 1311)]),
    ];

    const parTableau = new Map(
      forcesParTableau(equipe).map((force) => [force.tableau, force.manques]),
    );

    assert.deepEqual(parTableau.get("SD"), [], "une femme classée en simple suffit au SD");
    assert.deepEqual(parTableau.get("SH"), [{ sexe: "M", nombre: 2 }], "aucun homme en simple");
    assert.deepEqual(parTableau.get("DH"), [{ sexe: "M", nombre: 1 }], "un homme sur les deux");
    assert.deepEqual(parTableau.get("DD"), [{ sexe: "F", nombre: 1 }], "une femme sur les deux");
  });

  it("ne cumule pas les cinq listes : un joueur figure partout où il est éligible", () => {
    // C'est le pire défaut possible pour un écran censé montrer des manques :
    // lire les cinq pages côte à côte surestimerait la profondeur. Le plafond
    // de matchs par joueur relève de 011.
    const equipe = [
      membre("01111111", "Simon RENOULT", "M", [
        simple("D9", 936),
        double("D8", 1311),
        mixte("D9", 1007),
      ]),
    ];

    const presences = forcesParTableau(equipe).filter((force) => force.alignables.length === 1);

    assert.deepEqual(
      presences.map(({ tableau }) => tableau),
      ["SH", "DH", "MX"],
      "le même homme est alignable sur ses trois disciplines",
    );
  });

  it("écarte de l'ordre le joueur sans classement, et le nomme à part", () => {
    // En début de saison, un joueur sans classement est presque toujours une
    // licence fausse, pas un joueur faible : le ranger dernier ferait
    // disparaître l'anomalie qu'on veut voir.
    const equipe = [
      membre("01111111", "Simon RENOULT", "M", [simple("D9", 936)]),
      membre("02222222", null, "M"),
      membre("03333333", "Carl NEUF", "M", [double("P12", 300)]),
    ];

    const simpleHommes = forceDuTableau(equipe, "SH");

    assert.deepEqual(
      simpleHommes.alignables.map(({ nom }) => nom),
      ["Simon RENOULT"],
    );
    assert.deepEqual(
      simpleHommes.ecartes.map(({ nom, motif }) => [nom, motif]),
      [
        ["Carl NEUF", "discipline-absente"],
        [null, "jamais-releve"],
      ],
      "relevé mais jamais classé en simple, ou pas relevé du tout — ce n'est pas la même chose",
    );
    assert.deepEqual(
      simpleHommes.manques,
      [{ sexe: "M", nombre: 1 }],
      "les écartés ne comblent aucune place",
    );
  });

  it("affiche la cote et la lettre telles qu'elles ont été lues", () => {
    // Aucune conversion, dans aucun sens : la table d'équivalence a été
    // envisagée puis écartée, et 001 refuse d'inventer une valeur fédérale.
    const [joueur] = forceDuTableau(
      [membre("01111111", "Simon RENOULT", "M", [double("D8", 1311)])],
      "DH",
    ).alignables;

    assert.equal(joueur?.lettre, "D8");
    assert.equal(joueur?.cpph, 1311);
  });

  it("départage deux joueurs à la même cote par le tri de l'équipe", () => {
    // Un ordre arbitraire et stable vaut mieux qu'un ordre qui change à chaque
    // rendu de page.
    const equipe = [
      membre("01111111", "Zoé ZULU", "F", [simple("D8", 1204)]),
      membre("02222222", "Alice ALPHA", "F", [simple("D8", 1204)]),
    ];

    assert.deepEqual(noms(equipe, "SD"), ["Alice ALPHA", "Zoé ZULU"]);
  });

  it("porte la date du dernier relevé des joueurs concernés", () => {
    const veille = new Date("2026-08-25T05:00:00Z");
    const ancien = {
      ...membre("01111111", "Vieux RELEVE", "M", [simple("D9", 900)]),
      vuLe: veille,
    };
    const recent = membre("02222222", "Frais RELEVE", "M", [simple("D9", 910)]);

    assert.deepEqual(forceDuTableau([ancien, recent], "SH").releveLe, RELEVE_LE);
    assert.equal(forceDuTableau([membre("03333333", null, "M")], "SH").releveLe, null);
  });

  it("rend les cinq tableaux même sans équipe, et les dit tous vides", () => {
    const cinq = forcesParTableau([]);

    assert.deepEqual(
      cinq.map(({ tableau, intitule, matchs }) => [tableau, intitule, matchs]),
      [
        ["SH", "Simple hommes", 2],
        ["SD", "Simple dames", 1],
        ["DH", "Double hommes", 1],
        ["DD", "Double dames", 1],
        ["MX", "Double mixte", 1],
      ],
      "six matchs sur cinq tableaux, dans l'ordre de la feuille de match",
    );
    assert.deepEqual(
      cinq.flatMap(({ manques }) => manques),
      [
        { sexe: "M", nombre: 2 },
        { sexe: "F", nombre: 1 },
        { sexe: "M", nombre: 2 },
        { sexe: "F", nombre: 2 },
        { sexe: "M", nombre: 1 },
        { sexe: "F", nombre: 1 },
      ],
      "neuf places, toutes à pourvoir",
    );
  });
});
