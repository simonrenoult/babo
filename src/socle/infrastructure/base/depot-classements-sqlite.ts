import type {
  Classement,
  DepotClassements,
  Discipline,
  Lettre,
  ReleveDeClassement,
} from "../../core/classement.ts";
import type { Licence } from "../../core/licence.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = {
  licence: string;
  discipline: string;
  lettre: string;
  cpph: number;
  apparu_le: string;
  vu_le: string;
};

const COLONNES = "licence, discipline, lettre, cpph, apparu_le, vu_le from classement";

/** Adaptateur SQLite du port `DepotClassements` — specs 001 et 017. */
export function depotClassementsSqlite(base: BaseSqlite): DepotClassements {
  // Le palier en cours d'une discipline, et lui seul : c'est à lui qu'on
  // compare pour décider entre toucher `vu_le` et ouvrir une ligne.
  const palierEnCours = base.prepare(
    `select id, lettre, cpph from classement
     where licence = ? and discipline = ? order by id desc limit 1`,
  );
  const toucher = base.prepare("update classement set vu_le = ? where id = ?");
  const ouvrir = base.prepare(
    `insert into classement (licence, discipline, lettre, cpph, apparu_le, vu_le)
     values (?, ?, ?, ?, ?, ?)`,
  );
  // `max(id)` plutôt que `max(apparu_le)` : deux paliers d'une même passe
  // porteraient la même date, et l'ordre d'écriture, lui, ne ment pas.
  const derniersParDiscipline = base.prepare(
    `select ${COLONNES}
     where id in (select max(id) from classement where licence = ? group by discipline)`,
  );

  const relever = base.transaction(
    (licence: Licence, classements: readonly Classement[], vuLe: string) => {
      for (const classement of classements) {
        const palier = palierEnCours.get(licence, classement.discipline) as
          | { id: number; lettre: string; cpph: number }
          | undefined;

        if (palier !== undefined && palier.lettre === classement.lettre && palier.cpph === classement.cpph) {
          toucher.run(vuLe, palier.id);
        } else {
          ouvrir.run(licence, classement.discipline, classement.lettre, classement.cpph, vuLe, vuLe);
        }
      }
    },
  );

  return {
    relever(licence: Licence, classements: readonly Classement[], vuLe: Date): void {
      relever(licence, classements, vuLe.toISOString());
    },

    derniers(licence: Licence): readonly ReleveDeClassement[] {
      return (derniersParDiscipline.all(licence) as Ligne[]).map(versReleve);
    },
  };
}

function versReleve(ligne: Ligne): ReleveDeClassement {
  return {
    licence: ligne.licence as Licence,
    discipline: ligne.discipline as Discipline,
    lettre: ligne.lettre as Lettre,
    cpph: ligne.cpph,
    apparuLe: new Date(ligne.apparu_le),
    vuLe: new Date(ligne.vu_le),
  };
}
