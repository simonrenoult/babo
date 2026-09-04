import type { Cadence } from "./ordonnancement.ts";

/**
 * L'ancienneté d'une donnée, telle que les pages métier la disent — spec 019.
 *
 * « L'application sert indéfiniment une donnée figée » : c'est le reproche
 * central de 019, et il vise l'écran autant que le scraper. `/sources` disait
 * déjà l'ancienneté de chaque source, mais c'est l'écran d'exploitation — celui
 * de qui sait déjà où regarder. Le lecteur d'un classement figé, lui, ne voyait
 * qu'une date, sans jamais savoir si elle était anormale.
 *
 * **Jamais une ancienneté globale.** Les scrapings tombent indépendamment : une
 * seule mention pour toute l'application dirait « périmé » à des pages dont la
 * source va très bien.
 *
 * Le seuil n'est pas une constante nouvelle : c'est la cadence de la tâche qui
 * alimente la page, et elle est déjà en base (018). Une passe hebdomadaire dont
 * la dernière donnée a plus de sept jours a manqué son tour, et c'est tout ce
 * qu'il y a à savoir.
 */
export type Fraicheur = {
  readonly vuLe: Date | null;
  /** Vrai quand la donnée a dépassé la période de sa propre cadence. */
  readonly perimee: boolean;
  /** La période attendue, en jours. `null` pour une cadence sans récurrence. */
  readonly periodeEnJours: number | null;
  /** L'âge de la donnée en jours entiers, `null` si elle n'a jamais été relevée. */
  readonly ageEnJours: number | null;
};

const JOUR = 24 * 60 * 60_000;

/**
 * Combien de temps s'écoule entre deux passages.
 *
 * `null` pour une cadence ponctuelle : ses échéances sont inscrites une par une
 * par l'appelant (018), il n'y a donc pas de rythme à comparer.
 */
export function periodeEnJours(cadence: Cadence): number | null {
  if (cadence.nature === "quotidienne") return 1;
  if (cadence.nature === "hebdomadaire") return 7;
  return null;
}

export function fraicheur(
  vuLe: Date | null,
  cadence: Cadence,
  maintenant: Date,
): Fraicheur {
  const periode = periodeEnJours(cadence);
  const age = vuLe === null ? null : (maintenant.getTime() - vuLe.getTime()) / JOUR;

  return {
    vuLe,
    // Jamais relevée n'est pas périmée : c'est un autre message, et les pages
    // le disent déjà en toutes lettres plutôt que d'afficher un tableau de
    // tirets (001, 028). Confondre les deux ferait passer une mise en service
    // pour une panne.
    perimee: age !== null && periode !== null && age > periode,
    periodeEnJours: periode,
    ageEnJours: age === null ? null : Math.floor(age),
  };
}
