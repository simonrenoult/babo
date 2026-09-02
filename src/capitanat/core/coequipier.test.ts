import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Classement, DepotClassements, ReleveDeClassement } from "../../socle/core/classement.ts";
import type { DepotIdentites, Identite } from "../../socle/core/identite.ts";
import type { Licence } from "../../socle/core/licence.ts";
import { licence } from "../../socle/core/licence.ts";
import type { Coequipier, DepotCoequipiers } from "./coequipier.ts";
import { listeDeLEquipe } from "./coequipier.ts";

const RELEVE_LE = new Date("2026-09-01T05:00:00Z");

function depot(coequipiers: readonly Coequipier[]): DepotCoequipiers {
  return { remplacer: () => {}, tous: () => coequipiers };
}

function identites(connues: readonly Identite[] = []): DepotIdentites {
  const cache = new Map(connues.map((identite) => [String(identite.licence), identite]));
  return { enregistrer: () => {}, lire: (licenceLue) => cache.get(String(licenceLue)) ?? null };
}

function classements(
  releves: ReadonlyMap<string, readonly Classement[]> = new Map(),
): DepotClassements {
  return {
    relever: () => {},
    derniers: (licenceLue): readonly ReleveDeClassement[] =>
      (releves.get(String(licenceLue)) ?? []).map((classement) => ({
        ...classement,
        licence: licenceLue,
        apparuLe: RELEVE_LE,
        vuLe: RELEVE_LE,
      })),
  };
}

function equipeDe(
  coequipiers: readonly Coequipier[],
  options: {
    readonly identites?: readonly Identite[];
    readonly classements?: ReadonlyMap<string, readonly Classement[]>;
  } = {},
) {
  return listeDeLEquipe(
    depot(coequipiers),
    identites(options.identites),
    classements(options.classements),
  );
}

const MOI: Coequipier = { licence: licence("07194591"), sexe: "M", telephone: "06 12 34 56 78" };
const ELLE: Coequipier = { licence: licence("02345678"), sexe: "F", telephone: "0612345679" };

describe("la liste de l'équipe", () => {
  it("rend un lien d'appel et un lien vers la fiche fédérale", () => {
    // C'est l'objet de 005 : relier le tableur du club à la fiche myffbad, et
    // rendre le numéro cliquable depuis un téléphone.
    const [membre] = equipeDe([MOI]);

    assert.equal(membre?.telephone, "06 12 34 56 78", "affiché tel qu'il a été saisi");
    assert.equal(membre?.appel, "0612345678", "et composable sans sa mise en forme");
    assert.equal(membre?.fiche, "https://www.myffbad.fr/joueur/07194591");
  });

  it("garde l'indicatif international dans le lien d'appel", () => {
    const [membre] = equipeDe([
      { licence: licence("02345678"), sexe: "F", telephone: "+32 475 12 34 56" },
    ]);

    assert.equal(membre?.appel, "+32475123456");
  });

  it("attache le nom et le classement relevés par la passe", () => {
    const [membre] = equipeDe([MOI], {
      identites: [{ licence: MOI.licence, nom: "Simon RENOULT", personId: 1083591 }],
      classements: new Map([
        [
          String(MOI.licence),
          [
            { discipline: "double", lettre: "D8", cpph: 1311 },
            { discipline: "simple", lettre: "D9", cpph: 936 },
          ] as readonly Classement[],
        ],
      ]),
    });

    assert.equal(membre?.nom, "Simon RENOULT");
    assert.deepEqual(membre?.vuLe, RELEVE_LE);
    assert.deepEqual(
      membre?.classements.map(({ discipline, lettre }) => [discipline, lettre]),
      [
        ["simple", "D9"],
        ["double", "D8"],
      ],
      "dans l'ordre du barème, pas dans celui de la base",
    );
  });

  it("ne montre ni nom ni classement tant qu'aucune passe n'a abouti", () => {
    // Une case vide ne doit jamais pouvoir se lire comme « non classé » (028) :
    // c'est `null` qui le dit à la vue, pas une chaîne vide.
    const [membre] = equipeDe([MOI]);

    assert.equal(membre?.nom, null);
    assert.equal(membre?.vuLe, null);
    assert.deepEqual(membre?.classements, []);
  });

  it("trie sur le nom que myffbad rend, et relègue les non relevés", () => {
    // Prénom puis nom, sans extraction du nom de famille : une heuristique sur
    // des noms propres échoue en silence au premier nom composé (028).
    const inconnu: Coequipier = { licence: licence("01111111"), sexe: "M", telephone: "0600000000" };
    const equipe = equipeDe([MOI, ELLE, inconnu], {
      identites: [
        { licence: MOI.licence, nom: "Simon RENOULT", personId: 1 },
        { licence: ELLE.licence, nom: "Alice DUPONT", personId: 2 },
      ],
    });

    assert.deepEqual(
      equipe.map(({ nom, licence: numero }) => nom ?? numero),
      ["Alice DUPONT", "Simon RENOULT", "01111111"],
    );
  });

  it("rend une liste vide quand rien n'a été importé", () => {
    assert.deepEqual(equipeDe([]), []);
  });
});

/** Le type ne doit pas s'élargir par accident : la vue lit exactement ces champs. */
describe("la forme d'un membre", () => {
  it("porte les champs du CSV, les liens, et ce que la passe a relevé", () => {
    const [membre] = equipeDe([MOI]);

    assert.deepEqual(Object.keys(membre ?? {}).sort(), [
      "appel",
      "classements",
      "fiche",
      "licence",
      "nom",
      "sexe",
      "telephone",
      "vuLe",
    ]);
  });
});

/** Le tri ne doit pas dépendre de l'ordre du dépôt. */
describe("le dépôt", () => {
  it("est lu tel quel, le tri se faisant ici", () => {
    const licences: readonly Licence[] = equipeDe([ELLE, MOI]).map(({ licence: numero }) => numero);

    assert.deepEqual(licences, ["02345678", "07194591"], "à défaut de nom, par licence");
  });
});
