import type {
  Discipline,
  DepotClassements,
  Lettre,
  ReleveDeClassement,
} from "../../socle/core/classement.ts";
import { DISCIPLINES } from "../../socle/core/classement.ts";
import type { Licence } from "../../socle/core/licence.ts";

/**
 * Mon classement, tel que la page le montre — spec 001.
 *
 * Le module lit le dépôt et affiche : il ne parle jamais à myffbad, c'est la
 * règle structurelle de 022. Ce que l'acquisition a écrit, il le sert — même
 * périmé, avec sa date, parce qu'une page qui se tait sur la fraîcheur laisse
 * croire qu'un classement d'il y a trois semaines est celui d'aujourd'hui
 * (019).
 */
export type LigneDeClassement = {
  readonly discipline: Discipline;
  readonly lettre: Lettre;
  readonly cpph: number;
};

export type MonClassement = {
  readonly licence: Licence;
  /**
   * La date de la passe qui a relevé ces valeurs — `vu_le`, pas `apparu_le` :
   * la question à laquelle la page répond est « est-ce à jour ? », pas
   * « depuis quand ? ». Le « depuis quand » revient à 024.
   *
   * `null` tant qu'aucune passe n'a abouti, et c'est ce qui fait dire à la
   * page « aucun relevé » plutôt que d'afficher un tableau de tirets, qui se
   * confondrait avec un joueur non classé.
   */
  readonly vuLe: Date | null;
  readonly lignes: readonly LigneDeClassement[];
};

export function monClassement(licence: Licence, depot: DepotClassements): MonClassement {
  const releves = depot.derniers(licence);

  return {
    licence,
    vuLe: laPlusRecente(releves),
    // Dans l'ordre simple, double, mixte — celui de la fiche, celui du barème,
    // et non celui que la base rendrait, qui n'est l'ordre de personne.
    lignes: DISCIPLINES.flatMap((discipline) => {
      const releve = releves.find((candidat) => candidat.discipline === discipline);
      // Une ligne par discipline présente sur la fiche : la discipline jamais
      // jouée ne s'invente pas.
      return releve === undefined
        ? []
        : [{ discipline, lettre: releve.lettre, cpph: releve.cpph }];
    }),
  };
}

/**
 * Les trois disciplines sont relevées dans la même passe, donc portent la même
 * date. On prend la plus récente quand même : c'est vrai par construction, pas
 * garanti par le schéma.
 */
function laPlusRecente(releves: readonly ReleveDeClassement[]): Date | null {
  const dates = releves.map(({ vuLe }) => vuLe.getTime());
  return dates.length === 0 ? null : new Date(Math.max(...dates));
}
