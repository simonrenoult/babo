import type { DepotEcheances, Echeance, EtatDEcheance } from "../../core/ordonnancement.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = {
  id: number;
  tache: string;
  prevue_le: string;
  tentatives: number;
  prochaine_tentative_le: string;
  etat: string;
};

/** Adaptateur SQLite du port `DepotEcheances` — specs 017 et 018. */
export function depotEcheancesSqlite(base: BaseSqlite): DepotEcheances {
  const colonnes = "id, tache, prevue_le, tentatives, prochaine_tentative_le, etat from echeance";

  // `do nothing` sur l'index (tache, prevue_le), puis relecture : réinscrire la
  // même occurrence rend celle qui existe déjà, quel que soit son état. C'est
  // ce qui empêche un redémarrage de renvoyer un rappel déjà envoyé.
  const insertion = base.prepare(
    `insert into echeance (tache, prevue_le, tentatives, prochaine_tentative_le, etat, creee_le)
     values (?, ?, 0, ?, 'en-attente', ?)
     on conflict (tache, prevue_le) do nothing`,
  );
  const parOccurrence = base.prepare(`select ${colonnes} where tache = ? and prevue_le = ?`);
  const dues = base.prepare(
    `select ${colonnes} where etat = 'en-attente' and prochaine_tentative_le <= ?
     order by prevue_le, id`,
  );
  const prochaine = base.prepare(
    `select ${colonnes} where tache = ? and etat = 'en-attente' order by prevue_le, id limit 1`,
  );
  const report = base.prepare(
    "update echeance set tentatives = ?, prochaine_tentative_le = ? where id = ?",
  );
  const cloture = base.prepare("update echeance set etat = ?, close_le = ? where id = ?");
  const annulation = base.prepare(
    "update echeance set etat = 'abandonnee', close_le = ? where tache = ? and etat = 'en-attente'",
  );

  return {
    inscrire(tache: string, prevueLe: Date, maintenant: Date): Echeance {
      const quand = prevueLe.toISOString();
      insertion.run(tache, quand, quand, maintenant.toISOString());
      const ligne = parOccurrence.get(tache, quand) as Ligne | undefined;
      if (ligne === undefined) throw new Error(`Échéance introuvable après inscription : ${tache}`);
      return versEcheance(ligne);
    },

    dues: (maintenant) => (dues.all(maintenant.toISOString()) as Ligne[]).map(versEcheance),

    prochaine(tache: string): Echeance | null {
      const ligne = prochaine.get(tache) as Ligne | undefined;
      return ligne === undefined ? null : versEcheance(ligne);
    },

    reporter: (id, tentatives, prochaineTentativeLe) =>
      void report.run(tentatives, prochaineTentativeLe.toISOString(), id),

    clore: (id, etat, quand) => void cloture.run(etat, quand.toISOString(), id),

    annuler: (tache, quand) => Number(annulation.run(quand.toISOString(), tache).changes),
  };
}

function versEcheance(ligne: Ligne): Echeance {
  return {
    id: ligne.id,
    tache: ligne.tache,
    prevueLe: new Date(ligne.prevue_le),
    tentatives: ligne.tentatives,
    prochaineTentativeLe: new Date(ligne.prochaine_tentative_le),
    etat: ligne.etat as EtatDEcheance,
  };
}
