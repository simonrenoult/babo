import type { BaseSqlite } from "../../socle/infrastructure/base/connexion.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { Composition, DepotCompositions } from "../core/composition.ts";

type Ligne = { poste: string; licence: string };

/**
 * Adaptateur SQLite du port `DepotCompositions` — spec 011.
 *
 * Dans `capitanat/infrastructure`, pour la raison de 005 : le socle ne connaît
 * aucune feature (022), et c'est `main.ts` qui passe la base.
 */
export function depotCompositionsSqlite(base: BaseSqlite): DepotCompositions {
  const places = base.prepare("select poste, licence from composition where journee = ?");
  const vider = base.prepare("delete from composition where journee = ?");
  const placer = base.prepare("insert into composition (journee, poste, licence) values (?, ?, ?)");
  const journees = base.prepare("select distinct journee from composition");
  const toutesLesPlaces = base.prepare("select journee, poste, licence from composition order by journee");

  const enregistrer = base.transaction((journee: number, composition: Composition) => {
    vider.run(journee);
    for (const [poste, licence] of composition) placer.run(journee, poste, licence);
  });

  return {
    lire: (journee) =>
      new Map((places.all(journee) as Ligne[]).map(({ poste, licence }) => [poste, licence as Licence])),
    enregistrer: (journee, composition) => void enregistrer(journee, composition),
    journeesComposees: () =>
      new Set((journees.all() as { journee: number }[]).map(({ journee }) => journee)),
    toutes: () => {
      const parJournee = new Map<number, Map<string, Licence>>();
      for (const { journee, poste, licence } of toutesLesPlaces.all() as (Ligne & { journee: number })[]) {
        parJournee.set(journee, (parJournee.get(journee) ?? new Map()).set(poste, licence as Licence));
      }
      return parJournee;
    },
  };
}
