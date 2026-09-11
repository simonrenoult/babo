import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { ouvrirLaPersistance } from "./persistance.ts";

/**
 * La boîte d'envoi, contre la vraie base — spec 016.
 *
 * Le cœur du courrier se teste avec un dépôt en mémoire ; ici on vérifie ce que
 * cette doublure imite, et surtout le tri de `dus` : c'est lui qui décide de
 * l'ordre dans lequel les alertes partent.
 */
const NEUF_HEURES = new Date(2026, 8, 3, 9, 0);
const NEUF_HEURES_CINQ = new Date(2026, 8, 3, 9, 5);

describe("la boîte d'envoi", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-courrier-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("relit un message tel qu'il a été déposé, texte absent compris", () => {
    const depose = persistance.courrier.deposer(
      { sujet: "[Babo] Tournois", html: "<p>Trois tournois.</p>" },
      NEUF_HEURES,
    );

    assert.equal(depose.etat, "en-attente");
    assert.equal(depose.texte, null);
    assert.equal(depose.tentatives, 0);
    // Dû tout de suite : c'est le dépôt lui-même qui déclenche la première
    // tentative.
    assert.equal(depose.prochaineTentativeLe.getTime(), NEUF_HEURES.getTime());
    assert.deepEqual(persistance.courrier.lire(depose.id), depose);
  });

  it("ne rend dû que ce dont l'heure de tentative est passée", () => {
    const plusTard = persistance.courrier.deposer(
      { sujet: "[Babo] Plus tard", html: "<p>plus tard</p>", texte: "plus tard" },
      NEUF_HEURES,
    );
    persistance.courrier.reporter(plusTard.id, 1, NEUF_HEURES_CINQ, "réseau coupé");

    const dus = persistance.courrier.dus(NEUF_HEURES);

    assert.deepEqual(
      dus.map((message) => message.sujet),
      ["[Babo] Tournois"],
    );
    assert.equal(persistance.courrier.lire(plusTard.id)?.dernierEchec, "réseau coupé");
    assert.equal(persistance.courrier.dus(NEUF_HEURES_CINQ).length, 2);
  });

  it("écrit les tentatives consommées jusque dans l'abandon", () => {
    const depose = persistance.courrier.deposer(
      { sujet: "[Babo] Perdu", html: "<p>perdu</p>" },
      NEUF_HEURES,
    );

    persistance.courrier.abandonner(depose.id, 3, NEUF_HEURES_CINQ, "535 refusé");
    const relu = persistance.courrier.lire(depose.id);

    assert.equal(relu?.etat, "abandonne");
    // Trois pour un message tenté trois fois : un abandon qui laisserait deux
    // ferait mentir l'écran.
    assert.equal(relu?.tentatives, 3);
    assert.equal(relu?.dernierEchec, "535 refusé");
    // Et il ne revient plus jamais dans la file.
    assert.equal(
      persistance.courrier.dus(NEUF_HEURES_CINQ).some((message) => message.id === depose.id),
      false,
    );
  });

  it("sort un message envoyé de la file sans l'effacer de l'historique", () => {
    const depose = persistance.courrier.deposer(
      { sujet: "[Babo] Remis", html: "<p>remis</p>" },
      NEUF_HEURES,
    );
    const enAttenteAvant = persistance.courrier.compterEnAttente();

    persistance.courrier.marquerEnvoye(depose.id, NEUF_HEURES_CINQ);

    assert.equal(persistance.courrier.compterEnAttente(), enAttenteAvant - 1);
    assert.equal(persistance.courrier.lire(depose.id)?.etat, "envoye");
    // Rien n'est purgé : l'historique répond à « est-ce que l'alerte est
    // partie, et que disait-elle ? ».
    assert.equal(
      persistance.courrier.derniers(20).some((message) => message.id === depose.id),
      true,
    );
  });
});
