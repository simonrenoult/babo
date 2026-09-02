import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { ouvrirLaPersistance } from "./persistance.ts";

/**
 * Les deux dépôts de 018, contre la vraie base.
 *
 * Le cœur se teste avec des doublures en mémoire ; ici on vérifie ce que ces
 * doublures imitent, et surtout l'index d'unicité — c'est lui, et rien d'autre,
 * qui tient la promesse « ni perdre un rappel, ni le renvoyer ».
 */
const VENDREDI = new Date(2026, 8, 4, 1, 0);
const MERCREDI = new Date(2026, 8, 2, 12, 0);

describe("les dépôts de l'ordonnancement", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-ordonnancement-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("ne connaît aucun réglage tant qu'aucune tâche n'est amorcée", () => {
    assert.equal(persistance.reglages.lire("acquisition:myffbad"), null);
    assert.deepEqual(persistance.reglages.tous(), []);
  });

  it("relit une cadence hebdomadaire telle qu'elle a été écrite", () => {
    persistance.reglages.enregistrer({
      tache: "acquisition:myffbad",
      cadence: { nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 },
      graceMinutes: 2880,
      active: true,
    });

    assert.deepEqual(persistance.reglages.lire("acquisition:myffbad"), {
      tache: "acquisition:myffbad",
      cadence: { nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 },
      graceMinutes: 2880,
      active: true,
    });
  });

  it("ne recouvre pas un réglage existant avec une valeur de départ", () => {
    persistance.reglages.poserSiAbsent({
      tache: "acquisition:myffbad",
      cadence: { nature: "quotidienne", heure: 23, minute: 59 },
      graceMinutes: 1,
      active: false,
    });

    assert.equal(persistance.reglages.lire("acquisition:myffbad")?.graceMinutes, 2880);
  });

  it("écrase, en revanche, quand c'est l'écran qui règle", () => {
    persistance.reglages.enregistrer({
      tache: "acquisition:myffbad",
      cadence: { nature: "quotidienne", heure: 6, minute: 30 },
      graceMinutes: 720,
      active: false,
    });

    const relu = persistance.reglages.lire("acquisition:myffbad");
    assert.deepEqual(relu?.cadence, { nature: "quotidienne", heure: 6, minute: 30 });
    assert.equal(relu?.active, false);
  });

  it("inscrit une échéance, et rend la même à la réinscription", () => {
    const premiere = persistance.echeances.inscrire("acquisition:myffbad", VENDREDI, MERCREDI);
    const seconde = persistance.echeances.inscrire("acquisition:myffbad", VENDREDI, MERCREDI);

    assert.equal(premiere.id, seconde.id, "un redémarrage ne doit pas dupliquer l'occurrence");
    assert.equal(premiere.tentatives, 0);
    assert.deepEqual(premiere.prochaineTentativeLe, VENDREDI);
  });

  it("ne rend due que ce dont l'heure est passée", () => {
    assert.deepEqual(persistance.echeances.dues(new Date(2026, 8, 3, 23, 0)), []);
    assert.equal(persistance.echeances.dues(VENDREDI).length, 1);
  });

  it("reporte une tentative sans perdre l'heure prévue", () => {
    const echeance = persistance.echeances.prochaine("acquisition:myffbad");
    assert.ok(echeance);
    persistance.echeances.reporter(echeance.id, 1, new Date(2026, 8, 4, 2, 0));

    const relue = persistance.echeances.prochaine("acquisition:myffbad");
    assert.equal(relue?.tentatives, 1);
    assert.deepEqual(relue?.prevueLe, VENDREDI, "l'heure prévue est la clé, elle ne bouge pas");
    assert.deepEqual(relue?.prochaineTentativeLe, new Date(2026, 8, 4, 2, 0));
    assert.deepEqual(persistance.echeances.dues(new Date(2026, 8, 4, 1, 30)), []);
  });

  it("close, elle n'est plus ni due ni prochaine — et se réinscrit sans revivre", () => {
    const echeance = persistance.echeances.prochaine("acquisition:myffbad");
    assert.ok(echeance);
    persistance.echeances.clore(echeance.id, "faite", new Date(2026, 8, 4, 2, 5));

    assert.equal(persistance.echeances.prochaine("acquisition:myffbad"), null);
    assert.deepEqual(persistance.echeances.dues(new Date(2026, 8, 5, 0, 0)), []);

    // Le cœur de la promesse : réinscrire l'occurrence déjà faite ne la
    // ressuscite pas. C'est ce qui empêche un redémarrage de renvoyer un rappel.
    const reinscrite = persistance.echeances.inscrire("acquisition:myffbad", VENDREDI, MERCREDI);
    assert.equal(reinscrite.etat, "faite");
    assert.deepEqual(persistance.echeances.dues(new Date(2026, 8, 5, 0, 0)), []);
  });

  it("annule ce qui n'a pas encore tourné, et le compte", () => {
    persistance.echeances.inscrire("acquisition:badnet", new Date(2026, 8, 6, 1, 0), MERCREDI);
    persistance.echeances.inscrire("acquisition:badnet", new Date(2026, 8, 7, 1, 0), MERCREDI);

    assert.equal(persistance.echeances.annuler("acquisition:badnet", MERCREDI), 2);
    assert.equal(persistance.echeances.prochaine("acquisition:badnet"), null);
    assert.equal(persistance.echeances.annuler("acquisition:badnet", MERCREDI), 0);
  });
});
