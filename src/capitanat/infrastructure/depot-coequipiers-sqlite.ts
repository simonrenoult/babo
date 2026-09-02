import type { BaseSqlite } from "../../socle/infrastructure/base/connexion.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { Coequipier, DepotCoequipiers, Sexe } from "../core/coequipier.ts";

type Ligne = { licence: string; sexe: string; telephone: string };

/**
 * Adaptateur SQLite du port `DepotCoequipiers` — specs 005 et 017.
 *
 * Il est dans `capitanat/infrastructure` et non dans la persistance du socle :
 * `Coequipier` est une notion de feature, et le socle ne connaît aucune
 * feature (022). C'est `main.ts`, point de composition, qui lui passe la base
 * — la même base, la seule, celle que 017 exige.
 */
export function depotCoequipiersSqlite(base: BaseSqlite): DepotCoequipiers {
  const licencesActuelles = base.prepare("select licence from coequipier");
  const oublierLesClassements = base.prepare("delete from classement where licence = ?");
  const viderLEquipe = base.prepare("delete from coequipier");
  const ajouter = base.prepare(
    "insert into coequipier (licence, sexe, telephone) values (?, ?, ?)",
  );
  // Par licence croissante : arbitraire, mais stable et sans code. Les
  // licences sont des chaînes de chiffres de même longueur en pratique, donc
  // l'ordre du texte est celui du nombre. 028 le remplacera par le nom.
  const toutes = base.prepare("select licence, sexe, telephone from coequipier order by licence");

  const remplacer = base.transaction((coequipiers: readonly Coequipier[]) => {
    const gardees = new Set<string>(coequipiers.map(({ licence }) => licence));

    // Le partant emporte ses relevés de classement. Ce sont les données de
    // quelqu'un qui ne joue plus ici : les garder « au cas où » est
    // exactement ce qui rendrait une fuite impardonnable (021). Le cache
    // d'acquisition de 028 se supprimera ici même, à côté.
    for (const { licence } of licencesActuelles.all() as Ligne[]) {
      if (!gardees.has(licence)) oublierLesClassements.run(licence);
    }

    viderLEquipe.run();
    for (const { licence, sexe, telephone } of coequipiers) {
      ajouter.run(licence, sexe, telephone);
    }
  });

  return {
    remplacer(coequipiers: readonly Coequipier[]): void {
      remplacer(coequipiers);
    },

    tous(): readonly Coequipier[] {
      return (toutes.all() as Ligne[]).map((ligne) => ({
        licence: ligne.licence as Licence,
        sexe: ligne.sexe as Sexe,
        telephone: ligne.telephone,
      }));
    },
  };
}
