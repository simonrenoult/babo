import type { Compte, DepotCompte } from "../../core/authentification.ts";
import { licence } from "../../core/licence.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = { licence: string; hache: string; pose_le: string };

/** Adaptateur SQLite du port `DepotCompte` — specs 017 et 021. */
export function depotCompteSqlite(base: BaseSqlite): DepotCompte {
  const lecture = base.prepare("select licence, hache, pose_le from compte where id = 1");
  const ecriture = base.prepare(
    `insert into compte (id, licence, hache, pose_le) values (1, ?, ?, ?)
     on conflict (id) do update set
       licence = excluded.licence, hache = excluded.hache, pose_le = excluded.pose_le`,
  );

  return {
    lire(): Compte | null {
      const ligne = lecture.get() as Ligne | undefined;
      if (ligne === undefined) return null;
      return {
        licence: licence(ligne.licence),
        hache: ligne.hache,
        poseLe: new Date(ligne.pose_le),
      };
    },

    poser: (compte) =>
      void ecriture.run(compte.licence, compte.hache, compte.poseLe.toISOString()),
  };
}
