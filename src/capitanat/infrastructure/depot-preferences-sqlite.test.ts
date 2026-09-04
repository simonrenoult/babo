import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { licence } from "../../socle/core/licence.ts";
import { ouvrirLaPersistance } from "../../socle/infrastructure/base/persistance.ts";
import type { Coequipier } from "../core/coequipier.ts";
import { PaireRefusee } from "../core/paires.ts";
import { depotCoequipiersSqlite } from "./depot-coequipiers-sqlite.ts";
import { depotPreferencesSqlite } from "./depot-preferences-sqlite.ts";

/**
 * Les paires et les marques contre la vraie base — spec 030.
 *
 * Le cœur se teste sur des listes ; ici on vérifie ce que la base garantit et
 * que rien d'autre ne peut garantir : l'unicité d'une paire quel que soit
 * l'ordre de saisie, et le départ des paires avec le joueur qui s'en va.
 */
const ANNE = licence("00000001");
const BRUNO = licence("00000002");
const CLARA = licence("00000003");

const coequipier = (numero: string, sexe: "F" | "M"): Coequipier => ({
  licence: licence(numero),
  sexe,
  telephone: "0600000000",
});

const MAINTENANT = new Date(2026, 8, 4, 10, 0);

describe("les préférences du capitaine, en base", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let preferences: ReturnType<typeof depotPreferencesSqlite>;
  let coequipiers: ReturnType<typeof depotCoequipiersSqlite>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-paires-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
    preferences = depotPreferencesSqlite(persistance.base);
    coequipiers = depotCoequipiersSqlite(persistance.base);
    coequipiers.remplacer([
      coequipier("00000001", "F"),
      coequipier("00000002", "M"),
      coequipier("00000003", "F"),
    ]);
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("relit une paire telle qu'elle a été saisie, non privilégiée", () => {
    const saisie = preferences.saisirUnePaire([ANNE, BRUNO], MAINTENANT);

    assert.deepEqual(saisie.licences, [ANNE, BRUNO]);
    assert.equal(saisie.privilegiee, false);
    assert.deepEqual(preferences.paires(), [saisie]);
  });

  /**
   * « Dupont avec Martin » et « Martin avec Dupont » sont la même décision, et
   * c'est l'index d'unicité qui le tient — pas la politesse de l'appelant.
   */
  it("refuse la même paire saisie dans l'autre sens", () => {
    assert.throws(() => preferences.saisirUnePaire([BRUNO, ANNE], MAINTENANT), PaireRefusee);
    assert.equal(preferences.paires().length, 1);
  });

  it("pose et retire la marque d'une paire", () => {
    const [paire] = preferences.paires();

    preferences.privilegierLaPaire(paire!.id, true);
    assert.equal(preferences.paires()[0]?.privilegiee, true);

    preferences.privilegierLaPaire(paire!.id, false);
    assert.equal(preferences.paires()[0]?.privilegiee, false);
  });

  /**
   * L'écran poste la valeur voulue, jamais « l'inverse de ce qui est écrit » :
   * un double envoi du même formulaire ne doit pas faire clignoter la marque.
   */
  it("marque un joueur deux fois sans le démarquer", () => {
    preferences.marquerLeJoueur(BRUNO, "DH", true, MAINTENANT);
    preferences.marquerLeJoueur(BRUNO, "DH", true, MAINTENANT);

    assert.deepEqual(preferences.marquesDeJoueurs(), [{ licence: BRUNO, tableau: "DH" }]);
  });

  it("garde les marques d'un même joueur séparées par tableau", () => {
    preferences.marquerLeJoueur(BRUNO, "MX", true, MAINTENANT);
    preferences.marquerLeJoueur(BRUNO, "DH", false, MAINTENANT);

    assert.deepEqual(preferences.marquesDeJoueurs(), [{ licence: BRUNO, tableau: "MX" }]);
  });

  it("oublie une paire sur demande", () => {
    const paire = preferences.saisirUnePaire([ANNE, CLARA], MAINTENANT);

    preferences.oublierLaPaire(paire.id);

    assert.equal(
      preferences.paires().some(({ id }) => id === paire.id),
      false,
    );
  });

  /**
   * L'import de 005 remplace la liste entière. Les paires et les marques du
   * partant s'en vont avec lui, pour la raison déjà écrite : ne rien garder
   * « au cas où » de quelqu'un qui ne joue plus ici. Une paire, en plus, désigne
   * deux personnes — en garder une moitié orpheline n'aurait aucun sens.
   */
  it("perd les paires et les marques du joueur que l'import fait partir", () => {
    preferences.saisirUnePaire([BRUNO, CLARA], MAINTENANT);
    preferences.marquerLeJoueur(CLARA, "DD", true, MAINTENANT);
    assert.equal(preferences.paires().length, 2);

    // Clara n'est plus dans le fichier.
    coequipiers.remplacer([coequipier("00000001", "F"), coequipier("00000002", "M")]);

    assert.deepEqual(
      preferences.paires().map(({ licences }) => licences),
      [[ANNE, BRUNO]],
    );
    assert.deepEqual(
      preferences.marquesDeJoueurs().filter(({ licence: l }) => l === CLARA),
      [],
    );
  });
});
