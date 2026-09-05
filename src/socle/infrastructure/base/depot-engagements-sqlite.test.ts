import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { Engagement } from "../../core/engagement.ts";
import { licence } from "../../core/licence.ts";
import { ouvrirLaPersistance } from "./persistance.ts";

/** Les engagements contre la vraie base — spec 027. */
const MAINTENANT = new Date(2026, 8, 5, 5, 0);

const VILLENEUVE: Engagement = {
  evenement: 50750,
  nom: "TOURNOI DE DOUBLES DE VILLENEUVE 2026",
  date: new Date(2026, 9, 24, 12),
  statut: "Inscription payée",
  tableaux: [
    { tableau: "DH", serie: "S4", partenaire: { licence: licence("06571233"), nom: "MARTIN Claire" } },
    { tableau: "MX", serie: "S3", partenaire: null },
  ],
};

const PRINTEMPS: Engagement = {
  evenement: 50902,
  nom: "OPEN DE PRINTEMPS",
  date: new Date(2026, 10, 7, 12),
  statut: null,
  tableaux: [{ tableau: "SH", serie: null, partenaire: null }],
};

describe("les engagements, en base", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-engagements-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("relit un engagement avec ses tableaux et son partenaire", () => {
    persistance.engagements.remplacer([VILLENEUVE], MAINTENANT);

    const [relu] = persistance.engagements.tous();
    assert.equal(relu?.nom, VILLENEUVE.nom);
    assert.equal(relu?.statut, "Inscription payée");
    assert.deepEqual(relu?.date, VILLENEUVE.date);
    assert.deepEqual(relu?.tableaux, [
      { tableau: "DH", serie: "S4", partenaire: { licence: "06571233", nom: "MARTIN Claire" } },
      // Un tableau sans partenaire reste un engagement : la paire n'est pas
      // encore formée, ce n'est pas la même chose que ne pas jouer.
      { tableau: "MX", serie: "S3", partenaire: null },
    ]);
  });

  it("rend les engagements par date croissante, l'ordre que 002 affiche", () => {
    persistance.engagements.remplacer([PRINTEMPS, VILLENEUVE], MAINTENANT);

    assert.deepEqual(
      persistance.engagements.tous().map(({ evenement }) => evenement),
      [50750, 50902],
    );
  });

  /**
   * Une inscription annulée sur badnet doit disparaître d'ici : garder un
   * tournoi où je ne vais plus reproduirait l'oubli que 027 corrige, dans
   * l'autre sens.
   */
  it("remplace l'ensemble, tableaux compris", () => {
    persistance.engagements.remplacer([VILLENEUVE, PRINTEMPS], MAINTENANT);
    persistance.engagements.remplacer([PRINTEMPS], MAINTENANT);

    assert.equal(persistance.engagements.compter(), 1);
    const restants = persistance.base
      .prepare("select count(*) as total from engagement_tableau")
      .get() as { total: number };
    assert.equal(restants.total, 1, "les tableaux du partant s'en vont avec lui");
  });

  it("accepte un engagement sans statut ni série", () => {
    persistance.engagements.remplacer([PRINTEMPS], MAINTENANT);

    const [relu] = persistance.engagements.tous();
    assert.equal(relu?.statut, null);
    assert.deepEqual(relu?.tableaux, [{ tableau: "SH", serie: null, partenaire: null }]);
  });
});
