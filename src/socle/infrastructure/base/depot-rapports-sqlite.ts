import type {
  DepotRapports,
  Issue,
  RapportArchive,
  RapportExecution,
} from "../../core/rapport-execution.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = {
  id: number;
  tache: string;
  demarre_le: string;
  termine_le: string;
  issue: string;
  volume_extrait: number | null;
  detail: string | null;
};

/** Adaptateur SQLite du port `DepotRapports` — specs 017 et 019. */
export function depotRapportsSqlite(base: BaseSqlite): DepotRapports {
  const colonnes =
    "id, tache, demarre_le, termine_le, issue, volume_extrait, detail from rapport_execution";
  const insertion = base.prepare(
    `insert into rapport_execution (tache, demarre_le, termine_le, issue, volume_extrait, detail)
     values (?, ?, ?, ?, ?, ?)`,
  );
  const dernierParTache = base.prepare(
    `select ${colonnes} where tache = ? order by demarre_le desc, id desc limit 1`,
  );
  const derniers = base.prepare(
    `select ${colonnes} order by demarre_le desc, id desc limit ?`,
  );
  const depuis = base.prepare(
    `select ${colonnes} where demarre_le >= ? order by demarre_le, id`,
  );

  return {
    consigner(rapport: RapportExecution): RapportArchive {
      const resultat = insertion.run(
        rapport.tache,
        rapport.demarreLe.toISOString(),
        rapport.termineLe.toISOString(),
        rapport.issue,
        rapport.volumeExtrait,
        rapport.detail,
      );
      return { ...rapport, id: Number(resultat.lastInsertRowid) };
    },

    dernierRapport(tache: string): RapportArchive | null {
      const ligne = dernierParTache.get(tache) as Ligne | undefined;
      return ligne === undefined ? null : versRapport(ligne);
    },

    derniers(combien: number): readonly RapportArchive[] {
      return (derniers.all(combien) as Ligne[]).map(versRapport);
    },

    depuis(quand: Date): readonly RapportArchive[] {
      return (depuis.all(quand.toISOString()) as Ligne[]).map(versRapport);
    },
  };
}

function versRapport(ligne: Ligne): RapportArchive {
  return {
    id: ligne.id,
    tache: ligne.tache,
    demarreLe: new Date(ligne.demarre_le),
    termineLe: new Date(ligne.termine_le),
    issue: ligne.issue as Issue,
    volumeExtrait: ligne.volume_extrait,
    detail: ligne.detail,
  };
}
