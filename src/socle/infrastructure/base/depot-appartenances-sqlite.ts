import type { DepotAppartenances } from "../../core/passe-veilles.ts";
import type { BaseSqlite } from "./connexion.ts";

/**
 * Adaptateur SQLite du port `DepotAppartenances` — specs 017 et 012.
 *
 * **Une sortie se date, elle ne s'efface pas.** Un tournoi que la veille ne
 * voit plus garde sa ligne, avec `sorti_le` : c'est la seule façon de
 * distinguer « annulé » de « hors de mes critères », et c'est ce qui empêche un
 * tournoi qui sort puis rentre de repasser pour nouveau auprès de 013.
 *
 * Un retour efface `sorti_le` sans toucher à `vu_le` : la veille l'a bien vu
 * pour la première fois ce jour-là, et c'est cette date que 013 lit.
 */
export function depotAppartenancesSqlite(base: BaseSqlite): DepotAppartenances {
  const presents = base.prepare(
    "select evenement, sorti_le from veille_tournoi where veille = ?",
  );
  const inscrire = base.prepare(
    `insert into veille_tournoi (veille, evenement, vu_le)
     values (?, ?, ?)
     on conflict (veille, evenement) do update set sorti_le = null`,
  );
  const sortir = base.prepare(
    "update veille_tournoi set sorti_le = ? where veille = ? and evenement = ?",
  );
  const dedans = base.prepare(
    "select evenement from veille_tournoi where veille = ? and sorti_le is null order by evenement",
  );

  const constater = base.transaction(
    (veille: number, evenements: readonly number[], quand: Date) => {
      const connus = new Map(
        (presents.all(veille) as { evenement: number; sorti_le: string | null }[]).map(
          ({ evenement, sorti_le }) => [evenement, sorti_le],
        ),
      );
      const vus = new Set(evenements);
      const horodatage = quand.toISOString();

      // Entré : jamais vu, ou revenu après une sortie. Les deux méritent d'être
      // comptés — le second est le cas qu'une ligne effacée aurait fait passer
      // pour une découverte.
      const entres = evenements.filter(
        (evenement) => !connus.has(evenement) || connus.get(evenement) !== null,
      );
      for (const evenement of evenements) inscrire.run(veille, evenement, horodatage);

      const sortis = [...connus]
        .filter(([evenement, sortiLe]) => sortiLe === null && !vus.has(evenement))
        .map(([evenement]) => evenement);
      for (const evenement of sortis) sortir.run(horodatage, veille, evenement);

      return { entres, sortis };
    },
  );

  return {
    constater: (veille, evenements, quand) => constater(veille, evenements, quand),
    tournoisDe: (veille) =>
      (dedans.all(veille) as { evenement: number }[]).map(({ evenement }) => evenement),
  };
}
