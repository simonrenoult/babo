import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DepotClassements, ReleveDeClassement } from "../../socle/core/classement.ts";
import { licence } from "../../socle/core/licence.ts";
import { monClassement } from "./classement.ts";

const LICENCE = licence("07194591");
const VU_LE = new Date("2026-09-01T05:00:00Z");

function depot(releves: readonly ReleveDeClassement[]): DepotClassements {
  return { relever: () => {}, derniers: () => releves };
}

function releve(
  discipline: ReleveDeClassement["discipline"],
  lettre: ReleveDeClassement["lettre"],
  cpph: number,
): ReleveDeClassement {
  return { licence: LICENCE, discipline, lettre, cpph, apparuLe: new Date("2026-03-05T05:00:00Z"), vuLe: VU_LE };
}

describe("mon classement, tel que la page le montre", () => {
  it("range les disciplines dans l'ordre simple, double, mixte", () => {
    // L'ordre de la fiche et du barème, pas celui que la base rend — qui n'est
    // l'ordre de personne.
    const affiche = monClassement(
      LICENCE,
      depot([releve("mixte", "D9", 1007), releve("simple", "D9", 936), releve("double", "D8", 1311)]),
    );

    assert.deepEqual(affiche.lignes, [
      { discipline: "simple", lettre: "D9", cpph: 936 },
      { discipline: "double", lettre: "D8", cpph: 1311 },
      { discipline: "mixte", lettre: "D9", cpph: 1007 },
    ]);
    assert.deepEqual(affiche.vuLe, VU_LE, "la date de la passe, jamais celle du palier");
  });

  it("n'invente pas la discipline absente de la fiche", () => {
    const affiche = monClassement(LICENCE, depot([releve("simple", "P10", 890)]));

    assert.deepEqual(
      affiche.lignes.map(({ discipline }) => discipline),
      ["simple"],
    );
  });

  it("dit qu'aucune passe n'a abouti plutôt que de servir un tableau vide", () => {
    // Un tableau de tirets se confondrait avec un joueur non classé : la page
    // a besoin de les distinguer, donc `vuLe` reste `null`.
    const affiche = monClassement(LICENCE, depot([]));

    assert.equal(affiche.vuLe, null);
    assert.deepEqual(affiche.lignes, []);
  });
});
