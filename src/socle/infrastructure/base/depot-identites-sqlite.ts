import type { DepotIdentites, Identite } from "../../core/identite.ts";
import type { Licence } from "../../core/licence.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = { licence: string; person_id: number; nom: string };

/** Adaptateur SQLite du port `DepotIdentites` — specs 028 et 017. */
export function depotIdentitesSqlite(base: BaseSqlite): DepotIdentites {
  // `on conflict` plutôt que « supprimer puis insérer » : une identité qui
  // disparaîtrait une milliseconde ferait retomber la passe sur la fiche.
  const enregistrer = base.prepare(
    `insert into identite (licence, person_id, nom, vu_le) values (?, ?, ?, ?)
     on conflict (licence) do update set person_id = excluded.person_id,
                                         nom = excluded.nom,
                                         vu_le = excluded.vu_le`,
  );
  const lire = base.prepare("select licence, person_id, nom from identite where licence = ?");

  return {
    enregistrer(identite: Identite, vuLe: Date): void {
      enregistrer.run(identite.licence, identite.personId, identite.nom, vuLe.toISOString());
    },

    lire(licence: Licence): Identite | null {
      const ligne = lire.get(licence) as Ligne | undefined;
      return ligne === undefined
        ? null
        : { licence: ligne.licence as Licence, nom: ligne.nom, personId: ligne.person_id };
    },
  };
}
