import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { ouvrirLaPersistance } from "../../socle/infrastructure/base/persistance.ts";
import type { CalendrierDInterclub, Rencontre } from "../core/calendrier.ts";
import { depotCalendrierSqlite } from "./depot-calendrier-sqlite.ts";

const BAP = { nom: "Bad’ à Paname 5", code: "75-BAP-5" };
const RCF = { nom: "Racing Club de France 4", code: "75-RCF-4" };

const rencontre = (id: number, debut: Date): Rencontre => ({
  id,
  journee: id,
  debut,
  lieu: "Gymnase Alice Milliat, 75014 PARIS",
  domicile: BAP,
  exterieur: RCF,
});

const calendrier = (rencontres: readonly Rencontre[]): CalendrierDInterclub => ({
  url: "https://icbad.ffbad.org/competition/2601367/tableau/19107",
  equipe: BAP,
  competition: "ICD75 D3 Mixte",
  groupe: "Groupe B",
  importeLe: new Date(2026, 8, 30, 10, 0),
  rencontres,
});

describe("le calendrier d'interclub, en base", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let depot: ReturnType<typeof depotCalendrierSqlite>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-calendrier-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
    depot = depotCalendrierSqlite(persistance.base);
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("n'a rien avant le premier import", () => {
    assert.equal(depot.lire(), null);
  });

  it("relit le calendrier tel qu'il a été écrit, rencontres par date", () => {
    const tard = rencontre(2, new Date(2027, 1, 6, 20, 0));
    const tot = rencontre(1, new Date(2026, 10, 3, 20, 30));
    depot.remplacer(calendrier([tard, tot]));

    assert.deepEqual(depot.lire(), calendrier([tot, tard]));
  });

  it("remplace tout au réimport : une rencontre retirée ne survit pas", () => {
    const deplacee = rencontre(1, new Date(2026, 10, 10, 20, 30));
    depot.remplacer(calendrier([deplacee]));

    assert.deepEqual(depot.lire()?.rencontres, [deplacee]);
  });
});
