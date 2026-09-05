import type { Licence } from "./licence.ts";
import type { Tableau } from "./tableau.ts";

/**
 * Un engagement de tournoi — spec 027.
 *
 * Il vit dans le `socle` et non dans `mon-profil`, pour la raison qui a déjà
 * fait descendre `Classement` (022, amendée par 001) : c'est une passe du socle
 * qui l'écrit, et le socle ne connaît aucune feature. `mon-profil` le lira
 * pour l'afficher (002), sans jamais parler à badnet.
 *
 * Il ne se re-scrape pas au sens de 023 — il vient d'une source —, mais il ne
 * se retrouve pas non plus : une inscription supprimée sur badnet disparaît
 * sans laisser de trace, et c'est bien pourquoi on la garde en base.
 */
export type Engagement = {
  /** L'identifiant badnet du tournoi. C'est la clé : lui seul est stable. */
  readonly evenement: number;
  readonly nom: string;
  readonly date: Date;
  /**
   * Ce que badnet dit de l'inscription — « Inscription payée », « Inscription
   * enregistrée le … ». Du texte, gardé tel quel : personne ne sait encore
   * quelles valeurs cette phrase prend, et en tirer une échelle à trois
   * valeurs serait inventer une taxonomie qui ne correspondrait à rien (002).
   */
  readonly statut: string | null;
  readonly tableaux: readonly TableauEngage[];
};

/**
 * Un tableau sur lequel je suis engagé, et avec qui.
 *
 * La série vient avec : badnet écrit « DH S4 », et l'ignorer perdrait
 * exactement ce qui distingue deux engagements sur le même tableau. Elle est
 * gardée telle quelle, jamais interprétée — c'est la règle de 001 sur les
 * lettres, et elle vaut ici.
 */
export type TableauEngage = {
  readonly tableau: Tableau;
  /** « S4 », ou `null` quand badnet n'en annonce pas. */
  readonly serie: string | null;
  /** Absent sur un simple, et sur un double dont le partenaire n'est pas encore choisi. */
  readonly partenaire: Partenaire | null;
};

export type Partenaire = {
  /** Rendue par badnet à huit chiffres, comme la mienne. `null` si absente. */
  readonly licence: Licence | null;
  readonly nom: string;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotEngagements = {
  /**
   * Remplace l'ensemble des engagements — même règle que l'équipe de 005.
   *
   * Une inscription annulée sur badnet doit disparaître d'ici : garder un
   * tournoi auquel je ne vais plus, c'est reproduire le défaut que cette spec
   * corrige, l'oubli — dans l'autre sens.
   */
  remplacer(engagements: readonly Engagement[], quand: Date): void;
  /** À venir d'abord, par date croissante : c'est l'ordre que 002 affiche. */
  tous(): readonly Engagement[];
  compter(): number;
};

/**
 * Le tableau et sa série, lus sur le libellé de badnet — spec 027.
 *
 * « DH S4 » rend `{ tableau: "DH", serie: "S4" }`. Les libellés hors barème —
 * « Non », « DH S5 - Clt. trop élevé » — ne sont pas des engagements : le
 * premier dit qu'on ne joue pas, le second qu'on ne peut pas.
 */
export function tableauEngage(libelle: string): { tableau: Tableau; serie: string | null } | null {
  const trouve = /^\s*(SH|SD|DH|DD|MX)\s*(S\d+)?\s*$/u.exec(libelle);
  if (trouve === null) return null;
  return { tableau: trouve[1] as Tableau, serie: trouve[2] ?? null };
}

/**
 * Deux engagements se chevauchent-ils ? — préparé pour 002.
 *
 * Sur la seule date que badnet rend : un tournoi par date, pas un intervalle.
 * C'est donc « le même jour », et non « le même week-end » — 002 tranchera si
 * cela ne suffit pas, mais inventer une durée qu'aucune source ne donne serait
 * fabriquer de la donnée.
 */
export function memeJour(un: Engagement, autre: Engagement): boolean {
  return un.date.toDateString() === autre.date.toDateString();
}
