import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { CleDeChiffrementInvalide, ouvrirLaBase } from "./connexion.ts";
import { migrer } from "./migrateur.ts";
import { ouvrirLaPersistance } from "./persistance.ts";
import { licence } from "../../core/licence.ts";
import type { ReleveDeClassement } from "../../core/classement.ts";

const CLE = "clé-de-test-*-avec-une-'quote";

describe("la base unique du socle", () => {
  let dossier: string;
  let chemin: string;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-"));
    chemin = join(dossier, "sous-dossier", "babo.db");
  });

  after(() => rmSync(dossier, { recursive: true, force: true }));

  it("crée son fichier, dossier compris, et applique ses migrations", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    assert.deepEqual(persistance.migrationsAppliquees, [
      "001__socle.sql",
      "002__build_source.sql",
      "003__classement.sql",
    ]);
    persistance.fermer();
  });

  it("ne rejoue pas une migration déjà appliquée", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    assert.deepEqual(persistance.migrationsAppliquees, []);
    persistance.fermer();
  });

  it("fait survivre le jeton myffbad à un redémarrage", () => {
    // C'est la raison d'être immédiate de la base : sans elle, chaque
    // redémarrage coûte une réauthentification 2FA manuelle (specs 015, 017).
    const obtenuLe = new Date("2026-09-01T08:00:00.000Z");
    const expireLe = new Date("2026-10-01T08:00:00.000Z");

    const avant = ouvrirLaPersistance({ chemin, cle: CLE });
    avant.jetonMyffbad.enregistrer("myffbad", { valeur: "jeton-abc", obtenuLe, expireLe });
    avant.fermer();

    const apres = ouvrirLaPersistance({ chemin, cle: CLE });
    assert.deepEqual(apres.jetonMyffbad.lire("myffbad"), {
      valeur: "jeton-abc",
      obtenuLe,
      expireLe,
    });
    apres.fermer();
  });

  it("ne garde qu'un jeton en cours par source, et sait l'effacer", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    const jeton = {
      valeur: "jeton-def",
      obtenuLe: new Date("2026-09-02T08:00:00.000Z"),
      expireLe: new Date("2026-10-02T08:00:00.000Z"),
    };

    persistance.jetonMyffbad.enregistrer("myffbad", jeton);
    assert.equal(persistance.jetonMyffbad.lire("myffbad")?.valeur, "jeton-def");
    assert.equal(persistance.jetonMyffbad.lire("badnet"), null);

    persistance.jetonMyffbad.effacer("myffbad");
    assert.equal(persistance.jetonMyffbad.lire("myffbad"), null);
    persistance.fermer();
  });

  it("archive les captures et les rend au parseur, de la plus récente à la plus ancienne", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    const capture = (url: string, captureeLe: string) => ({
      source: "badnet" as const,
      url,
      statutHttp: 200,
      contenu: `<html>${url}</html>`,
      captureeLe: new Date(captureeLe),
    });

    const ancienne = persistance.captures.archiver(capture("/tournois?p=1", "2026-08-30T06:00:00Z"));
    persistance.captures.archiver(capture("/tournois?p=2", "2026-08-31T06:00:00Z"));

    const dernieres = persistance.captures.dernieres("badnet", 5);
    assert.deepEqual(
      dernieres.map((capture) => capture.url),
      ["/tournois?p=2", "/tournois?p=1"],
    );
    assert.equal(persistance.captures.parIdentifiant(ancienne.id)?.contenu, ancienne.contenu);
    assert.equal(persistance.captures.dernieres("myffbad", 5).length, 0);
    assert.equal(persistance.captures.compter(), 2);
    persistance.fermer();
  });

  it("consigne les rapports d'exécution et retrouve le dernier par tâche", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    persistance.rapports.consigner({
      tache: "scraping-badnet",
      demarreLe: new Date("2026-08-30T06:00:00Z"),
      termineLe: new Date("2026-08-30T06:00:04Z"),
      issue: "succes",
      volumeExtrait: 143,
      detail: null,
    });
    persistance.rapports.consigner({
      tache: "scraping-badnet",
      demarreLe: new Date("2026-08-31T06:00:00Z"),
      termineLe: new Date("2026-08-31T06:00:01Z"),
      issue: "vide",
      volumeExtrait: 0,
      detail: "aucun tournoi extrait de la page",
    });

    const dernier = persistance.rapports.dernierRapport("scraping-badnet");
    assert.equal(dernier?.issue, "vide");
    assert.equal(dernier?.volumeExtrait, 0);
    assert.equal(persistance.rapports.dernierRapport("scraping-myffbad"), null);
    assert.equal(persistance.rapports.derniers(10).length, 2);
    persistance.fermer();
  });

  it("annonce une taille, celle que le battement hebdomadaire publiera", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    assert.ok(persistance.taille() > 0);
    persistance.fermer();
  });
});

describe("le chiffrement au repos", () => {
  let dossier: string;
  let chemin: string;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-chiffre-"));
    chemin = join(dossier, "babo.db");

    const base = ouvrirLaBase({ chemin, cle: CLE });
    migrer(base);
    base
      .prepare("insert into capture (source, url, statut_http, contenu, capturee_le) values (?, ?, ?, ?, ?)")
      .run("myffbad", "/mon-compte", 200, "0612345678", new Date().toISOString());
    base.close();
  });

  after(() => rmSync(dossier, { recursive: true, force: true }));

  it("ne laisse pas les coordonnées d'un coéquipier lisibles dans le fichier", () => {
    // C'est ce fichier qu'on recopie pour sauvegarder (spec 023) : en clair, la
    // copie volée livre l'annuaire de l'équipe.
    const octets = readFileSync(chemin);
    assert.equal(octets.includes(Buffer.from("0612345678")), false);
    assert.notEqual(octets.subarray(0, 15).toString("latin1"), "SQLite format 3");
  });

  it("refuse de s'ouvrir avec une autre clé, sans toucher au fichier", () => {
    const avant = readFileSync(chemin);
    assert.throws(() => ouvrirLaBase({ chemin, cle: "mauvaise-clé" }), CleDeChiffrementInvalide);
    assert.deepEqual(readFileSync(chemin), avant);
  });

  it("se rouvre avec la bonne clé", () => {
    const base = ouvrirLaBase({ chemin, cle: CLE });
    const compte = base.prepare("select count(*) as total from capture").get() as { total: number };
    assert.equal(compte.total, 1);
    base.close();
  });
});

describe("les déploiements observés", () => {
  const dossier = mkdtempSync(join(tmpdir(), "babo-builds-"));
  const chemin = join(dossier, "babo.db");

  after(() => rmSync(dossier, { recursive: true, force: true }));

  it("compte les builds, pas les passes", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    const lundi = new Date("2026-09-01T06:00:00Z");
    const mardi = new Date("2026-09-02T06:00:00Z");
    const mercredi = new Date("2026-09-03T06:00:00Z");

    assert.equal(persistance.builds.observer("myffbad", "BUILD-A", lundi), true);
    assert.equal(
      persistance.builds.observer("myffbad", "BUILD-A", mardi),
      false,
      "revoir le même build n'est pas un déploiement",
    );
    assert.equal(persistance.builds.observer("myffbad", "BUILD-B", mercredi), true);

    assert.equal(persistance.builds.historique("myffbad").length, 2);
    assert.partialDeepStrictEqual(persistance.builds.courant("myffbad"), {
      build: "BUILD-B",
      vuLaPremiereFois: mercredi,
    });

    // La première vue du build A tient : c'est elle qui date le déploiement.
    const [, ancien] = persistance.builds.historique("myffbad");
    assert.deepEqual(ancien?.vuLaPremiereFois, lundi);
    assert.deepEqual(ancien?.vuLaDerniereFois, mardi);

    assert.deepEqual(persistance.builds.historique("badnet"), [], "chaque source la sienne");
    persistance.fermer();
  });
});

describe("le classement relevé", () => {
  const dossier = mkdtempSync(join(tmpdir(), "babo-classement-"));
  const chemin = join(dossier, "babo.db");

  after(() => rmSync(dossier, { recursive: true, force: true }));

  it("garde une ligne par changement de classement, jamais une par passe", () => {
    // Le classement ne bouge qu'à la publication mensuelle : une passe
    // quotidienne écrirait trois cent cinquante lignes identiques par an
    // (spec 001). Seule `vu_le` bouge tant que la valeur tient.
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    const licenceMienne = licence("07194591");
    const lundi = new Date("2026-09-01T05:00:00Z");
    const mardi = new Date("2026-09-02T05:00:00Z");
    const octobre = new Date("2026-10-01T05:00:00Z");

    persistance.classements.relever(
      licenceMienne,
      [
        { discipline: "simple", lettre: "D9", cpph: 936 },
        { discipline: "double", lettre: "D8", cpph: 1311 },
      ],
      lundi,
    );
    persistance.classements.relever(
      licenceMienne,
      [
        { discipline: "simple", lettre: "D9", cpph: 936 },
        { discipline: "double", lettre: "D8", cpph: 1311 },
      ],
      mardi,
    );

    // L'ordre du dépôt n'engage rien — c'est `mon-profil` qui range les
    // disciplines pour l'affichage. On interroge donc par discipline.
    const apresMardi = parDiscipline(persistance.classements.derniers(licenceMienne));
    assert.deepEqual(apresMardi["simple"], {
      licence: licenceMienne,
      discipline: "simple",
      lettre: "D9",
      cpph: 936,
      apparuLe: lundi,
      vuLe: mardi,
    });
    assert.deepEqual(apresMardi["double"], {
      licence: licenceMienne,
      discipline: "double",
      lettre: "D8",
      cpph: 1311,
      apparuLe: lundi,
      vuLe: mardi,
    });

    // Publication du CPPH : le simple change de palier, le double ne bouge
    // pas. Une ligne s'ouvre pour l'un, l'autre se contente d'un `vu_le`.
    persistance.classements.relever(
      licenceMienne,
      [
        { discipline: "simple", lettre: "D8", cpph: 1204 },
        { discipline: "double", lettre: "D8", cpph: 1311 },
      ],
      octobre,
    );

    const courants = parDiscipline(persistance.classements.derniers(licenceMienne));
    assert.partialDeepStrictEqual(courants["simple"], {
      lettre: "D8",
      cpph: 1204,
      apparuLe: octobre,
      vuLe: octobre,
    });
    assert.partialDeepStrictEqual(courants["double"], {
      lettre: "D8",
      cpph: 1311,
      apparuLe: lundi,
      vuLe: octobre,
    });

    // Trois lignes en base pour deux disciplines : l'antériorité que 024 lira.
    const total = persistance.base
      .prepare("select count(*) as total from classement")
      .get() as { total: number };
    assert.equal(total.total, 3);

    persistance.fermer();
  });

  it("ne rend le classement de personne d'autre", () => {
    const persistance = ouvrirLaPersistance({ chemin, cle: CLE });
    persistance.classements.relever(
      licence("00000001"),
      [{ discipline: "mixte", lettre: "R6", cpph: 2100 }],
      new Date("2026-09-01T05:00:00Z"),
    );

    assert.deepEqual(persistance.classements.derniers(licence("00000002")), []);
    persistance.fermer();
  });
});

function parDiscipline(
  releves: readonly ReleveDeClassement[],
): Record<string, ReleveDeClassement> {
  return Object.fromEntries(releves.map((releve) => [releve.discipline, releve]));
}
