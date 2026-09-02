import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { licence } from "../../core/licence.ts";
import { ouvrirLaPersistance } from "./persistance.ts";
import { depotIdentitesSqlite } from "./depot-identites-sqlite.ts";

const MOI = licence("07194591");
const RELEVE_LE = new Date("2026-09-01T05:00:00Z");

describe("le cache d'identités", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let depot: ReturnType<typeof depotIdentitesSqlite>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-identites-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
    depot = depotIdentitesSqlite(persistance.base);
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("ne connaît personne tant qu'aucune passe n'a lu de fiche", () => {
    assert.equal(depot.lire(MOI), null);
  });

  it("garde le nom et l'identifiant interne, et les rend tels quels", () => {
    depot.enregistrer({ licence: MOI, nom: "Simon RENOULT", personId: 1083591 }, RELEVE_LE);

    assert.deepEqual(depot.lire(MOI), { licence: MOI, nom: "Simon RENOULT", personId: 1083591 });
  });

  it("met à jour en place plutôt que d'empiler un historique", () => {
    // Au contraire du classement, personne n'a l'usage des valeurs passées d'un
    // nom — et un `personId` périmé ne doit pas pouvoir être relu (028).
    depot.enregistrer({ licence: MOI, nom: "Simon RENOULT-MARTIN", personId: 42 }, RELEVE_LE);

    assert.deepEqual(depot.lire(MOI), {
      licence: MOI,
      nom: "Simon RENOULT-MARTIN",
      personId: 42,
    });
    const compte = persistance.base.prepare("select count(*) as n from identite").get() as {
      n: number;
    };
    assert.equal(compte.n, 1, "une seule ligne par licence");
  });

  it("survit à un redémarrage", () => {
    const apres = depotIdentitesSqlite(persistance.base);

    assert.equal(apres.lire(MOI)?.personId, 42);
  });

  it("refuse en base ce que le parseur refuse déjà", () => {
    // Ceinture et bretelles : la contrainte SQL ne remplace pas le contrôle du
    // parseur, elle garantit qu'aucun autre chemin ne pourra le contourner.
    for (const invalide of [
      { licence: licence("02345678"), nom: "", personId: 7 },
      { licence: licence("02345678"), nom: "Alice DUPONT", personId: 0 },
    ]) {
      assert.throws(() => depot.enregistrer(invalide, RELEVE_LE));
    }
  });
});
