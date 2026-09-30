import type { CalendrierDInterclub, Rencontre } from "../core/calendrier.ts";
import { sigleDe } from "../core/calendrier.ts";

/**
 * Le calendrier d'interclub, porté dans un agenda : en fichier iCalendar pour
 * l'importer d'un bloc, en lien Google Agenda pour une rencontre à la fois.
 *
 * Pas d'abonnement par URL : l'adresse est derrière la porte (021), et un
 * agenda qui s'abonne n'a pas de session. Un import se refait quand le comité
 * déplace une rencontre, comme l'import du calendrier lui-même.
 */

/**
 * La durée d'une rencontre. icbad ne publie que l'heure de début ; le sondage
 * annonce « 20h-22h30 », soit deux heures et demie.
 */
const DUREE_MS = 150 * 60 * 1000;

export type Evenement = {
  /** Stable d'un import à l'autre : c'est lui qui fait qu'un agenda remplace l'événement plutôt que de le doubler. */
  readonly uid: string;
  readonly titre: string;
  readonly debut: Date;
  readonly fin: Date;
  readonly lieu: string;
  readonly description: string;
  readonly url: string;
};

/** « J02 · BAD18-5 – CPS10-5 » : le recevant d'abord, comme sur la feuille. */
export function evenementDe(rencontre: Rencontre, calendrier: CalendrierDInterclub): Evenement {
  const journee = `J${String(rencontre.journee).padStart(2, "0")}`;
  const url = `https://icbad.ffbad.org/rencontre/${rencontre.id}`;
  return {
    uid: `rencontre-${rencontre.id}@babo`,
    titre: `${journee} · ${sigleDe(rencontre.domicile)} – ${sigleDe(rencontre.exterieur)}`,
    debut: rencontre.debut,
    fin: new Date(rencontre.debut.getTime() + DUREE_MS),
    lieu: rencontre.lieu,
    description: `${calendrier.competition}, ${calendrier.groupe}\n${rencontre.domicile.nom} reçoit ${rencontre.exterieur.nom}\n${url}`,
    url,
  };
}

/** Le calendrier entier en iCalendar (RFC 5545), heures en UTC. */
export function enIcs(calendrier: CalendrierDInterclub, maintenant: Date): string {
  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Babo//Capitanat//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${texte(`${calendrier.equipe.nom} — ${calendrier.competition}`)}`,
    ...calendrier.rencontres.flatMap((rencontre) => {
      const evenement = evenementDe(rencontre, calendrier);
      return [
        "BEGIN:VEVENT",
        `UID:${evenement.uid}`,
        `DTSTAMP:${horodatage(maintenant)}`,
        `DTSTART:${horodatage(evenement.debut)}`,
        `DTEND:${horodatage(evenement.fin)}`,
        `SUMMARY:${texte(evenement.titre)}`,
        `LOCATION:${texte(evenement.lieu)}`,
        `DESCRIPTION:${texte(evenement.description)}`,
        `URL:${evenement.url}`,
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ];
  return lignes.map(plier).join("\r\n") + "\r\n";
}

/** Le formulaire de création d'événement de Google Agenda, prérempli. */
export function lienGoogle(evenement: Evenement): string {
  const parametres = new URLSearchParams({
    action: "TEMPLATE",
    text: evenement.titre,
    dates: `${horodatage(evenement.debut)}/${horodatage(evenement.fin)}`,
    location: evenement.lieu,
    details: evenement.description,
  });
  return `https://calendar.google.com/calendar/render?${parametres.toString()}`;
}

/** « 20261114T190000Z » */
function horodatage(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Un texte iCalendar : barre oblique inverse, point-virgule, virgule et saut de ligne échappés. */
function texte(valeur: string): string {
  return valeur.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Une ligne de plus de 75 octets se replie, la suite commençant par une
 * espace. Octets et non caractères : un « é » en compte deux, et le couper en
 * son milieu corromprait le fichier.
 */
function plier(ligne: string): string {
  const morceaux: string[] = [];
  let courant = "";
  for (const caractere of ligne) {
    const limite = morceaux.length === 0 ? 75 : 74;
    if (Buffer.byteLength(courant + caractere) > limite) {
      morceaux.push(courant);
      courant = "";
    }
    courant += caractere;
  }
  morceaux.push(courant);
  return morceaux.join("\r\n ");
}
