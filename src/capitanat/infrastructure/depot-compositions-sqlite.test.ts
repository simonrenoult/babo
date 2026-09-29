import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { licence } from "../../socle/core/licence.ts";
import { ouvrirLaPersistance } from "../../socle/infrastructure/base/persistance.ts";
import { depotCompositionsSqlite } from "./depot-compositions-sqlite.ts";

describe("les compositions, en base", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let depot: ReturnType<typeof depotCompositionsSqlite>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-compositions-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
    depot = depotCompositionsSqlite(persistance.base);
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("relit une composition, journée par journée", () => {
    depot.enregistrer(1, new Map([["SH1", licence("07194591")]]));
    depot.enregistrer(2, new Map([["SD", licence("00000002")]]));

    assert.deepEqual(depot.lire(1), new Map([["SH1", "07194591"]]));
    assert.deepEqual(depot.journeesComposees(), new Set([1, 2]));
  });

  it("remplace la composition entière : une place vidée ne survit pas", () => {
    depot.enregistrer(1, new Map([["SH2", licence("07194591")]]));

    assert.deepEqual(depot.lire(1), new Map([["SH2", "07194591"]]));
  });

  it("rend toutes les compositions, par journée", () => {
    assert.deepEqual(
      depot.toutes(),
      new Map([
        [1, new Map([["SH2", "07194591"]])],
        [2, new Map([["SD", "00000002"]])],
      ]),
    );
  });

  it("efface la journée quand toutes les places sont vidées", () => {
    depot.enregistrer(2, new Map());

    assert.deepEqual(depot.journeesComposees(), new Set([1]));
  });
});
