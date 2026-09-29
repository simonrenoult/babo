import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { licence } from "../../socle/core/licence.ts";
import { ouvrirLaPersistance } from "../../socle/infrastructure/base/persistance.ts";
import type { Reponse, Sondage } from "../core/disponibilite.ts";
import { depotDisponibilitesSqlite } from "./depot-disponibilites-sqlite.ts";

const SIMON = licence("07194591");

const sondage = (
  journees: readonly number[],
  repondants: readonly [string, string | null, readonly [number, Reponse][]][],
): Sondage => ({
  journees: journees.map((journee) => ({ journee, date: "2026-11-05" })),
  repondants: repondants.map(([nom, remarque, reponses]) => ({ nom, remarque, reponses: new Map(reponses) })),
});

describe("les disponibilités, en base", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let depot: ReturnType<typeof depotDisponibilitesSqlite>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-disponibilites-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
    depot = depotDisponibilitesSqlite(persistance.base);
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("relit un sondage tel qu'il a été écrit", () => {
    depot.enregistrer(
      sondage(
        [1, 2],
        [
          ["Simon", null, [[1, "oui"], [2, "si-besoin"]]],
          ["Madoche", "blessée", [[1, "non"]]],
        ],
      ),
    );

    assert.deepEqual(depot.repondants(), [
      { nom: "Madoche", remarque: "blessée", licence: null },
      { nom: "Simon", remarque: null, licence: null },
    ]);
    assert.deepEqual(depot.reponses(), [
      { nom: "Madoche", journee: 1, reponse: "non" },
      { nom: "Simon", journee: 1, reponse: "oui" },
      { nom: "Simon", journee: 2, reponse: "si-besoin" },
    ]);
  });

  it("garde le rattachement d'un nom d'un import à l'autre", () => {
    depot.rattacher("Simon", SIMON);
    depot.enregistrer(sondage([3], [["Simon", null, [[3, "oui"]]]]));

    assert.equal(depot.repondants().find(({ nom }) => nom === "Simon")?.licence, SIMON);
  });

  it("ajoute les journées d'un nouveau sondage sans toucher aux autres", () => {
    assert.deepEqual(
      depot.reponses().map(({ nom, journee }) => `${nom} J${journee}`),
      ["Madoche J1", "Simon J1", "Simon J2", "Simon J3"],
    );
  });

  it("remplace entièrement les journées qu'un sondage réimporté couvre", () => {
    depot.enregistrer(sondage([1, 2], [["Simon", null, [[1, "non"]]]]));

    assert.deepEqual(
      depot.reponses().map(({ nom, journee, reponse }) => `${nom} J${journee} ${reponse}`),
      ["Simon J1 non", "Simon J3 oui"],
    );
    assert.deepEqual(
      depot.repondants().map(({ nom }) => nom),
      ["Simon"],
      "Madoche, sans réponse ni rattachement, n'est plus qu'une ligne vide : elle part",
    );
  });
});
