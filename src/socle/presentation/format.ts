import type { Cadence } from "../core/ordonnancement.ts";
import { heure } from "../core/heure.ts";
import { JOURS } from "../core/ordonnancement.ts";

/** « chaque vendredi à 1h », « chaque jour à 5h30 », « au fil de l'eau ». */
export function cadenceLisible(cadence: Cadence): string {
  if (cadence.nature === "ponctuelle") return "au fil de l'eau";
  const aHeure = heure(new Date(2000, 0, 1, cadence.heure, cadence.minute));
  if (cadence.nature === "quotidienne") return `chaque jour à ${aHeure}`;
  return `chaque ${JOURS[cadence.jour]} à ${aHeure}`;
}
