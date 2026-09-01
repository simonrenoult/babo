import type { DepotJetonMyffbad, JetonMyffbad } from "../../core/jeton-myffbad.ts";
import type { Source } from "../../core/source.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = { valeur: string; obtenu_le: string; expire_le: string };

/** Adaptateur SQLite du port `DepotJetonMyffbad` — spec 017. */
export function depotJetonMyffbadSqlite(base: BaseSqlite): DepotJetonMyffbad {
  const lecture = base.prepare(
    "select valeur, obtenu_le, expire_le from jeton_source where source = ?",
  );
  const ecriture = base.prepare(
    `insert into jeton_source (source, valeur, obtenu_le, expire_le) values (?, ?, ?, ?)
     on conflict (source) do update set
       valeur = excluded.valeur, obtenu_le = excluded.obtenu_le, expire_le = excluded.expire_le`,
  );
  const effacement = base.prepare("delete from jeton_source where source = ?");

  return {
    lire(source: Source): JetonMyffbad | null {
      const ligne = lecture.get(source) as Ligne | undefined;
      if (ligne === undefined) return null;
      return {
        valeur: ligne.valeur,
        obtenuLe: new Date(ligne.obtenu_le),
        expireLe: new Date(ligne.expire_le),
      };
    },

    enregistrer(source: Source, jeton: JetonMyffbad): void {
      ecriture.run(
        source,
        jeton.valeur,
        jeton.obtenuLe.toISOString(),
        jeton.expireLe.toISOString(),
      );
    },

    effacer(source: Source): void {
      effacement.run(source);
    },
  };
}
