/**
 * Une heure comme on l'écrit : « 20h », « 20h30 », « 8h05 » — jamais « 20:00 ».
 *
 * Dans le fuseau du serveur, comme le reste des dates de l'interface. Au cœur
 * plutôt qu'en présentation : un texte que le cœur compose — l'annonce d'une
 * composition (038) — l'écrit comme les pages.
 */
export function heure(date: Date): string {
  const [heures = "", minutes = ""] = date
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .split(":");
  return `${Number(heures)}h${minutes === "00" ? "" : minutes}`;
}
