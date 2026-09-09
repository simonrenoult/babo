import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import type { TournoiDeLaRecherche } from "../../core/tournoi.ts";
import { ouvrirLaPersistance } from "./persistance.ts";

/**
 * Ce qu'une veille voit, contre la vraie base — spec 012.
 *
 * La promesse que ces tests tiennent : **sortir n'est pas disparaître**. Avec
 * une requête par veille, l'absence a deux sens — le tournoi est annulé, ou il
 * ne répond plus aux critères de celle-ci — et seule une appartenance datée les
 * distingue.
 *
 * Les veilles s'insèrent ici en SQL brut, et non par le dépôt de la feature :
 * le socle ne connaît aucune feature, et le lint d'architecture le vérifie
 * (022). Il connaît la table — sa migration la crée — sans connaître la notion
 * qui la remplit, et c'est exactement la frontière que 012 a voulue.
 */
const MAINTENANT = new Date(2026, 8, 9, 5, 15);
const PLUS_TARD = new Date(2026, 8, 10, 5, 15);

const trouve = (evenement: number): TournoiDeLaRecherche => ({
  evenement,
  nom: `Tournoi ${evenement}`,
  latitude: 48.9,
  longitude: 2.3,
  dateLimite: null,
  familles: "D, P, NC",
  categories: "Seniors",
});

describe("ce qu'une veille voit, en base", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let veille: number;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-appartenances-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  beforeEach(() => {
    persistance.base.exec("delete from veille; delete from tournoi");
    veille = poserUneVeille("DH avec Louis");
    persistance.tournois.enregistrerDepuisLaRecherche(
      [trouve(50750), trouve(50898), trouve(51245)],
      MAINTENANT,
    );
  });

  /** Le minimum que la table exige : le reste appartient à la feature. */
  function poserUneVeille(nom: string): number {
    const { lastInsertRowid } = persistance.base
      .prepare(
        `insert into veille (nom, active, latitude, longitude, rayon_km, fenetre_jours,
                             tableaux, series, categories, ouvertes, creee_le)
         values (?, 1, 48.8534, 2.3488, 50, 90, 'DH', 'D8', '', 1, ?)`,
      )
      .run(nom, MAINTENANT.toISOString());
    return Number(lastInsertRowid);
  }

  it("compte pour entrées ce qu'elle n'avait jamais vu", () => {
    const { entres, sortis } = persistance.appartenances.constater(
      veille,
      [50750, 50898],
      MAINTENANT,
    );

    assert.deepEqual(entres, [50750, 50898]);
    assert.deepEqual(sortis, []);
    assert.deepEqual(persistance.appartenances.tournoisDe(veille), [50750, 50898]);
  });

  it("date la sortie au lieu d'effacer la ligne", () => {
    persistance.appartenances.constater(veille, [50750, 50898], MAINTENANT);
    const { sortis } = persistance.appartenances.constater(veille, [50750], PLUS_TARD);

    assert.deepEqual(sortis, [50898]);
    assert.deepEqual(persistance.appartenances.tournoisDe(veille), [50750], "sorti de la vue");

    const ligne = persistance.base
      .prepare("select vu_le, sorti_le from veille_tournoi where veille = ? and evenement = 50898")
      .get(veille) as { vu_le: string; sorti_le: string | null };
    assert.equal(ligne.sorti_le, PLUS_TARD.toISOString(), "la ligne reste, datée");
    assert.equal(ligne.vu_le, MAINTENANT.toISOString(), "la première vue ne bouge pas");
  });

  it("ne redevient jamais une découverte quand il revient", () => {
    // Le cas qu'une ligne effacée aurait fait passer pour neuf : 013 promet de
    // ne jamais alerter deux fois pour le même tournoi.
    persistance.appartenances.constater(veille, [50750], MAINTENANT);
    persistance.appartenances.constater(veille, [], PLUS_TARD);
    persistance.appartenances.constater(veille, [50750], PLUS_TARD);

    const ligne = persistance.base
      .prepare("select vu_le, sorti_le from veille_tournoi where veille = ? and evenement = 50750")
      .get(veille) as { vu_le: string; sorti_le: string | null };

    assert.equal(ligne.sorti_le, null, "il est de nouveau dedans");
    assert.equal(ligne.vu_le, MAINTENANT.toISOString(), "mais vu pour la première fois hier");
  });

  it("emporte ses appartenances quand la veille est supprimée", () => {
    // C'est le prix assumé d'une suppression, et la raison pour laquelle on
    // suspend plutôt qu'on ne supprime : recréée, la veille réalerterait sur
    // tout ce qu'elle connaissait.
    persistance.appartenances.constater(veille, [50750, 50898], MAINTENANT);
    persistance.base.prepare("delete from veille where id = ?").run(veille);

    const restantes = persistance.base
      .prepare("select count(*) as nombre from veille_tournoi where veille = ?")
      .get(veille) as { nombre: number };
    assert.equal(restantes.nombre, 0);
  });

  it("ne mélange pas deux veilles qui voient le même tournoi", () => {
    // Le tournoi n'existe qu'une fois dans l'index ; c'est l'appartenance qui
    // est propre à chacune.
    const autre = poserUneVeille("En région");

    persistance.appartenances.constater(veille, [50750, 50898], MAINTENANT);
    persistance.appartenances.constater(autre, [50898], MAINTENANT);

    assert.deepEqual(persistance.appartenances.tournoisDe(veille), [50750, 50898]);
    assert.deepEqual(persistance.appartenances.tournoisDe(autre), [50898]);
    const tournois = persistance.base.prepare("select count(*) as nombre from tournoi").get() as {
      nombre: number;
    };
    assert.equal(tournois.nombre, 3, "un tournoi, une ligne, quelles que soient les veilles");
  });

  it("garde les deux moitiés de la ligne : la recherche n'efface pas la fiche", () => {
    // Deux sources, deux moitiés du même tournoi. Sans cette séparation, le
    // premier relevé de fiche remettrait à blanc la date limite sur laquelle la
    // veille filtre, et le tournoi disparaîtrait d'elle sans que rien ne le dise.
    persistance.tournois.enregistrerLaFiche(
      {
        evenement: 50750,
        gymnase: "Armand Silvestre",
        adresse: "188 Rue Armand Silvestre 92400 Courbevoie",
        ville: "Courbevoie",
        journees: [new Date(2026, 9, 24, 12)],
        tableaux: ["DH", "MX"],
        series: ["D8", "D9"],
      },
      PLUS_TARD,
    );
    persistance.tournois.enregistrerDepuisLaRecherche(
      [{ ...trouve(50750), dateLimite: new Date(2026, 9, 1, 12) }],
      PLUS_TARD,
    );

    const tournoi = persistance.tournois.parEvenement([50750]).get(50750);

    assert.equal(tournoi?.ville, "Courbevoie", "la recherche n'a pas effacé la fiche");
    assert.deepEqual(tournoi?.tableaux, ["DH", "MX"]);
    assert.equal(tournoi?.dateLimite?.getMonth(), 9, "la fiche n'a pas effacé la recherche");
    assert.equal(tournoi?.ficheRelevee, true);
    assert.deepEqual(persistance.tournois.sansFiche(), [50898, 51245]);
  });
});
