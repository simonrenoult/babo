import type { Licence } from "./licence.ts";

/**
 * Le classement fédéral d'un joueur — spec 001.
 *
 * Une lettre et un CPPH, par discipline. C'est un fait fédéral et non la
 * représentation d'un module : il n'en existe pas une version vue par
 * `mon-profil` et une autre vue par `capitanat`, donc il descend ici avec
 * `Licence` et `Tableau` (spec 022, amendée par 001). `Joueur`, lui, reste
 * dupliqué.
 */

/**
 * Les trois disciplines de classement, dans l'ordre où la fiche les donne et
 * où la page les affiche — spec 001.
 *
 * **Ce n'est pas `Tableau`.** 001 disait « rattachés à un `Tableau` » avant
 * qu'on ait vu la fiche ; la sonde de 015 l'a montrée, et elle expose
 * `SimpleSubLevel`, `DoubleSubLevel`, `MixteSubLevel` — trois disciplines, pas
 * cinq tableaux. Passer de « simple » à `SH` demanderait le sexe du licencié,
 * que rien ne configure et que la fiche ne donne pas : ce serait inventer là
 * où 001 demande d'afficher ce que la source donne. `Tableau` reste ce qu'il
 * est — le tableau d'une compétition, celui de 004, 010 et 012.
 */
export const DISCIPLINES = ["simple", "double", "mixte"] as const;

export type Discipline = (typeof DISCIPLINES)[number];

/**
 * Le barème fédéral, en valeur fermée — spec 001.
 *
 * Une lettre inattendue fait échouer l'extraction plutôt que d'entrer en base :
 * c'est le seul moyen que le succès vide de 019 se voie. Contrepartie assumée,
 * une évolution légitime du barème casse la passe jusqu'à correction — la
 * capture archivée permet de la corriger hors ligne.
 */
export const LETTRES = [
  "N1",
  "N2",
  "N3",
  "R4",
  "R5",
  "R6",
  "D7",
  "D8",
  "D9",
  "P10",
  "P11",
  "P12",
  "NC",
] as const;

export type Lettre = (typeof LETTRES)[number];

export function estUneLettre(valeur: string): valeur is Lettre {
  return (LETTRES as readonly string[]).includes(valeur);
}

/** Ce que la fiche donne pour une discipline : une lettre et un nombre. */
export type Classement = {
  readonly discipline: Discipline;
  readonly lettre: Lettre;
  readonly cpph: number;
};

/**
 * Un classement tel que la base le garde — spec 001.
 *
 * Une ligne par changement de valeur, jamais une par passe : le classement ne
 * bouge qu'aux publications hebdomadaires qui suivent une compétition jouée,
 * et sans cette règle la passe écrirait cinquante-deux lignes identiques par
 * an et par discipline.
 *
 * D'où les deux dates. `vuLe` est celle de la dernière passe qui a relevé ces
 * valeurs — c'est elle que la page affiche. `apparuLe` est celle du palier :
 * elle n'est affichée par personne aujourd'hui, et s'écrit quand même, parce
 * qu'un historique ne se rattrape pas après coup et que 024 en dépend.
 */
export type ReleveDeClassement = Classement & {
  readonly licence: Licence;
  readonly apparuLe: Date;
  readonly vuLe: Date;
};

/**
 * La fiche n'a pas rendu ce qu'on sait lire — spec 001.
 *
 * Panne franche et non silencieuse : sans elle, une lettre inconnue entrerait
 * en base et la page servirait une donnée fausse avec l'aplomb d'une donnée
 * vraie. La capture est déjà archivée (019) : la correction se fait dessus,
 * sans retoucher au réseau.
 */
export class ClassementIllisible extends Error {
  constructor(detail: string) {
    super(`Classement illisible sur la fiche myffbad : ${detail}`);
    this.name = "ClassementIllisible";
  }
}

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotClassements = {
  /**
   * Consigne ce qu'une passe a relevé. Pour chaque discipline : si la dernière
   * ligne porte déjà cette lettre et ce CPPH, seul `vu_le` bouge ; sinon une
   * ligne s'ajoute, `apparu_le` à la date de la passe.
   */
  relever(licence: Licence, classements: readonly Classement[], vuLe: Date): void;
  /** Le dernier relevé de chaque discipline. Vide tant qu'aucune passe n'a abouti. */
  derniers(licence: Licence): readonly ReleveDeClassement[];
};
