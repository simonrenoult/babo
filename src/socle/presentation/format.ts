import type { Cadence } from "../core/ordonnancement.ts";
import { JOURS } from "../core/ordonnancement.ts";

/**
 * Une heure comme on l'écrit : « 20h », « 20h30 », « 8h05 » — jamais « 20:00 ».
 *
 * Dans le fuseau du serveur, comme le reste des dates de l'interface.
 */
export function heure(date: Date): string {
  const [heures = "", minutes = ""] = date
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .split(":");
  return `${Number(heures)}h${minutes === "00" ? "" : minutes}`;
}

/** « chaque vendredi à 1h », « chaque jour à 5h30 », « au fil de l'eau ». */
export function cadenceLisible(cadence: Cadence): string {
  if (cadence.nature === "ponctuelle") return "au fil de l'eau";
  const aHeure = heure(new Date(2000, 0, 1, cadence.heure, cadence.minute));
  if (cadence.nature === "quotidienne") return `chaque jour à ${aHeure}`;
  return `chaque ${JOURS[cadence.jour]} à ${aHeure}`;
}
