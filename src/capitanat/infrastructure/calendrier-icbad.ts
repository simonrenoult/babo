import type { EquipeDInterclub, PageDeGroupe, Rencontre } from "../core/calendrier.ts";
import { CalendrierRefuse } from "../core/calendrier.ts";

/**
 * La page d'un groupe d'interclub sur icbad — relevée le 30 septembre 2026.
 *
 * Publique : ni session ni compte, donc rien à renouveler et aucun risque de
 * bannissement. Rendue côté serveur, sans JavaScript : la section « Toutes les
 * rencontres » est un tableau dont chaque journée ouvre par un `<th>J01</th>`,
 * suivi d'une ligne `uk-visible@m` par rencontre — date, lieu, équipe qui
 * reçoit, score, équipe qui se déplace. La même rencontre est répétée en
 * version mobile (`uk-hidden@m`) : on ne lit que la première.
 */
const URL_DE_GROUPE = /^https:\/\/icbad\.ffbad\.org\/competition\/\d+\/tableau\/\d+\/?$/u;
const URL_DE_COMPETITION = /^https:\/\/icbad\.ffbad\.org\/competition\/\d+\/?$/u;

/**
 * L'URL doit désigner la page d'un groupe, et rien d'autre.
 *
 * C'est aussi ce qui empêche le formulaire de faire lire n'importe quelle
 * adresse au serveur. La page de la compétition, elle, ne donne que le jour
 * de chaque rencontre, sans heure ni lieu : on la refuse en disant où cliquer.
 */
export function verifierLURLDuGroupe(saisie: string): string {
  const url = saisie.trim();
  if (URL_DE_GROUPE.test(url)) return url.replace(/\/$/u, "");
  if (URL_DE_COMPETITION.test(url)) {
    throw new CalendrierRefuse(
      "C'est la page de la compétition : elle ne donne ni l'heure ni le lieu. Ouvrir le groupe de l'équipe (« Voir listing, calendrier des rencontres ») et coller cette adresse-là.",
    );
  }
  throw new CalendrierRefuse(
    "L'adresse attendue est celle d'un groupe sur icbad, de la forme https://icbad.ffbad.org/competition/2601367/tableau/19107.",
  );
}

const SAISON = /<option value="(\d{4})"\s*selected>/u;
const COMPETITION = /<a class="item" href="[^"]*\/competition\/\d+">([^<]+)<\/a>/u;
const GROUPE = /<h1>([^<]+)<\/h1>/u;
const SECTION = "Toutes les rencontres";
const JOURNEE_OU_LIGNE =
  /<th colspan="7" class="uk-text-center">J(\d+)<\/th>|<tr class="uk-visible@m clickable-row">([\s\S]*?)<\/tr>/gu;
const CELLULE = /<td[^>]*>([\s\S]*?)<\/td>/gu;
const IDENTIFIANT = /\/rencontre\/(\d+)"/u;
const QUAND = /Le (\d{2})\/(\d{2}) à (\d{2}):(\d{2})/u;
const EQUIPE = /^(.+)\s+\(([^()]+)\)$/u;

export function lireLaPageDeGroupe(html: string): PageDeGroupe {
  const saison = SAISON.exec(html)?.[1];
  const competition = COMPETITION.exec(html)?.[1];
  const groupe = GROUPE.exec(html)?.[1];
  const debut = html.indexOf(SECTION);
  if (saison === undefined || competition === undefined || groupe === undefined || debut === -1) {
    throw new CalendrierRefuse(
      "La page ne ressemble pas à celle d'un groupe icbad : saison, compétition, groupe ou liste des rencontres introuvable. Elle est archivée pour être relue.",
    );
  }

  const rencontres: Rencontre[] = [];
  let journee: number | null = null;
  for (const [, numero, ligne] of html.slice(debut).matchAll(JOURNEE_OU_LIGNE)) {
    if (numero !== undefined) {
      journee = Number(numero);
      continue;
    }
    if (ligne === undefined || journee === null) continue;
    rencontres.push(lireLaRencontre(ligne, journee, Number(saison)));
  }

  return { competition: texte(competition), groupe: texte(groupe), rencontres };
}

function lireLaRencontre(ligne: string, journee: number, saison: number): Rencontre {
  const cellules = [...ligne.matchAll(CELLULE)].map(([, contenu]) => contenu ?? "");
  const [quand = "", lieu = "", domicile = "", , exterieur = ""] = cellules;
  const id = IDENTIFIANT.exec(quand)?.[1];
  const date = QUAND.exec(texte(quand));
  if (id === undefined || date === null) {
    throw new CalendrierRefuse(`Une rencontre de la J${journee} est illisible : identifiant ou date introuvable.`);
  }

  const [, jour, mois, heure, minute] = date;
  // La page ne donne que le jour et le mois. La saison court de septembre à
  // juin : l'automne est l'année de la saison, l'hiver et le printemps la
  // suivante.
  const annee = Number(mois) >= 8 ? saison : saison + 1;

  return {
    id: Number(id),
    journee,
    // Heure locale, comme les journées de 002 : le serveur vit à Paris.
    debut: new Date(`${annee}-${mois}-${jour}T${heure}:${minute}:00`),
    lieu: texte(lieu),
    domicile: equipe(domicile, journee),
    exterieur: equipe(exterieur, journee),
  };
}

function equipe(cellule: string, journee: number): EquipeDInterclub {
  const trouve = EQUIPE.exec(texte(cellule));
  if (trouve === null) {
    throw new CalendrierRefuse(`Une équipe de la J${journee} n'a pas de code : « ${texte(cellule)} ».`);
  }
  return { nom: trouve[1] ?? "", code: trouve[2] ?? "" };
}

/** Le texte d'un fragment : balises retirées, entités décodées, blancs resserrés. */
function texte(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/gu, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/\s+/gu, " ")
    .trim();
}
