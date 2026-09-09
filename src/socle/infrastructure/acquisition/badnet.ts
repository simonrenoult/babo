import type { ModuleDAcquisition, Reponse, Requete } from "../../core/acquisition.ts";
import type { Engagement, TableauEngage } from "../../core/engagement.ts";
import type { TournoiEngage } from "../../core/passe-engagements.ts";
import { tableauEngage } from "../../core/engagement.ts";
import type { Licence } from "../../core/licence.ts";

/**
 * Le module d'acquisition badnet — spec 015, source des tournois.
 *
 * **badnet a deux visages, et 027 a raison d'exiger qu'ils restent séparés.**
 * Sous session, `/competitions` porte mes engagements, derrière une 2FA. Mais
 * la recherche de tournois, elle, est publique : un seul POST, sans cookie,
 * sans compte, donc sans risque de bannissement. C'est ce qui en fait la
 * source la plus robuste du projet — rien à reconduire, rien à surveiller.
 *
 * Le site est piloté par « iclick » : tout passe par `/index.php`, l'action
 * étant désignée par `ic_a`. Cet identifiant dépend du déploiement, comme ceux
 * de myffbad — mais contrairement à eux il se **redécouvre sans navigateur**,
 * en rejouant deux appels publics : l'accueil, puis son onglet « Tournois »,
 * dont le formulaire porte l'identifiant de recherche.
 */
const RACINE = "https://badnet.fr";
const ROUTEUR = `${RACINE}/index.php`;

/** Relevé le 1er septembre 2026 sur l'onglet « Tournois » de l'accueil. */
export const ACTION_RECHERCHE = "78032b44baaa5e0ee59389b30e2ebdae";

/** `type_event=70` : les compétitions individuelles, par opposition aux interclubs. */
const TOURNOIS_INDIVIDUELS = "70";

/**
 * Les critères que le formulaire public accepte — spec 012.
 *
 * Volontairement partiel : ce que la sonde a besoin d'exercer. Le formulaire
 * en propose bien d'autres — département, ligue, catégories d'âge,
 * disciplines, familles de classement — et ils s'ajouteront quand 012 dira
 * lesquels comptent.
 */
export type CriteresDeRecherche = {
  /** Centre de la recherche, en « longitude;latitude » — c'est la forme qu'attend badnet. */
  readonly autourDe: { readonly longitude: number; readonly latitude: number };
  readonly rayonKm: number;
  /** À venir seulement : sans quoi la recherche remonte les tournois passés. */
  readonly aVenir: boolean;
};

export function rechercheDeTournois(criteres: CriteresDeRecherche): Requete {
  const { autourDe, rayonKm, aVenir } = criteres;
  const champs = new URLSearchParams({
    ic_a: ACTION_RECHERCHE,
    ic_ajax: "1",
    ic_t: "search_results",
    type_event: TOURNOIS_INDIVIDUELS,
    city: `${autourDe.longitude};${autourDe.latitude}`,
    rayon: String(rayonKm),
  });
  if (aVenir) champs.set("coming", "1");

  return {
    url: ROUTEUR,
    // Anonyme, et c'est tout l'intérêt : cette requête n'engage aucun compte.
    jeton: null,
    methode: "POST",
    corps: champs.toString(),
    entetes: {
      "content-type": "application/x-www-form-urlencoded",
      "x-requested-with": "XMLHttpRequest",
    },
  };
}

/**
 * Un tournoi tel que badnet le publie sur sa carte.
 *
 * La réponse est un fragment HTML, mais on ne lit pas les cartes : elles
 * embarquent la liste complète en JSON, destinée à la carte, dans
 * `div.b-markers[data-markers]`. C'est la seule forme qui porte les
 * coordonnées du gymnase — donc la distance — et la seule qui ne dépende pas
 * de la mise en page.
 */
export type TournoiPublie = {
  readonly id: number;
  readonly nom: string;
  readonly lieu: string;
  readonly classements: string;
  readonly categories: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly url: string;
  /** Libellés tels quels : badnet les rend en français, parfois en HTML. */
  readonly dateLibellee: string;
  readonly echeanceLibellee: string;
};

const MARQUEURS = /data-markers="([^"]*)"/;

export function tournoisDeLaRecherche(reponse: Reponse): readonly TournoiPublie[] {
  const trouve = MARQUEURS.exec(reponse.contenu);
  if (trouve === null) return [];

  try {
    const brut = JSON.parse(dechapper(trouve[1] ?? "")) as readonly Record<string, unknown>[];
    return brut.map(versTournoi);
  } catch {
    // Un fragment illisible n'est pas une liste vide : le rapport d'exécution
    // le verra comme un volume nul là où la veille en donnait (spec 019).
    return [];
  }
}

function versTournoi(brut: Record<string, unknown>): TournoiPublie {
  return {
    id: Number(brut["id"]),
    nom: String(brut["name"] ?? ""),
    lieu: String(brut["place"] ?? ""),
    classements: String(brut["clt"] ?? ""),
    categories: String(brut["catages"] ?? "").trim(),
    latitude: Number(brut["lat"]),
    longitude: Number(brut["lng"]),
    url: String(brut["url"] ?? ""),
    dateLibellee: String(brut["date"] ?? ""),
    echeanceLibellee: String(brut["deadline"] ?? ""),
  };
}

/** Les entités HTML de l'attribut, et elles seules : le contenu est du JSON. */
function dechapper(valeur: string): string {
  return valeur
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** Paris, faute de mieux : 012 dira d'où la veille part réellement. */
const PARIS = { longitude: 2.3488, latitude: 48.8534 };

/**
 * Comment badnet sert ses pages — spec 027.
 *
 * **Toute page est une coquille.** `GET <url>` rend la barre de navigation, les
 * menus, et une ancre `id="default_page"` qui porte l'identifiant de l'action
 * chargeant le contenu réel. Un POST sur `/index.php` avec cet identifiant rend
 * le fragment.
 *
 * C'est ce motif, découvert le 4 septembre 2026 en comparant deux coquilles,
 * qui dispense d'écrire le moindre identifiant en dur : ils changent avec le
 * déploiement, et ils sont toujours à relever sur la page qu'on demande.
 *
 * **Vrai de l'application authentifiée, faux du site public** — 002 l'a appris
 * le 5 septembre : la coquille publique n'a pas de `default_page`, elle porte
 * son action dans `data-inside_page`. Voir `actionInterneDeLaPage`.
 */
const ACTION_DE_LA_PAGE = /id="default_page"[^>]*data-ic_a='([a-f0-9]+)'/;

export function actionDeLaPage(reponse: Reponse): string | null {
  return ACTION_DE_LA_PAGE.exec(reponse.contenu)?.[1] ?? null;
}

/** L'appel qui rend le contenu d'une page, une fois son action relevée. */
export function contenuDeLaPage(action: string, jeton: string, cible = "wrapper"): Requete {
  return appelIclick(action, jeton, { ic_t: cible });
}

/**
 * La fiche d'un tournoi se charge en deux temps de plus.
 *
 * Le fragment de `/joueur/tournoi` ne porte pas la fiche : il porte un
 * `autoload` qui la réclame, avec l'identifiant du tournoi et ma licence. Sans
 * ce second appel, badnet répond pour `eventid: -1` — un tournoi qui n'existe
 * pas.
 */
const ACTION_DAUTOLOAD = /autoload\(\{[^)]*\\"action\\":\\"([a-f0-9]+)\\"/;

export function actionDeLaFiche(reponse: Reponse): string | null {
  return ACTION_DAUTOLOAD.exec(reponse.contenu)?.[1] ?? null;
}

export function ficheDuTournoi(
  action: string,
  jeton: string,
  evenement: number,
  licence: Licence,
): Requete {
  return appelIclick(action, jeton, {
    ic_t: "targetEvent",
    eventid: String(evenement),
    license: licence,
    assolineregiid: "-1",
  });
}

function appelIclick(action: string, jeton: string, champs: Record<string, string>): Requete {
  return {
    url: ROUTEUR,
    jeton,
    methode: "POST",
    corps: new URLSearchParams({ ic_a: action, ic_ajax: "1", ...champs }).toString(),
    entetes: {
      "content-type": "application/x-www-form-urlencoded",
      "x-requested-with": "XMLHttpRequest",
    },
  };
}

/**
 * Les tournois de la carte « Mes tournois » — spec 027.
 *
 * **Cette carte seulement.** `/competitions` en porte trois : « Tournois
 * organisés » (ceux que le club met en place), « Mes tournois », et « Tournois
 * nationaux ». Les deux autres ne sont pas des engagements, et les avaler
 * ferait apparaître dans mon agenda des tournois où je ne joue pas.
 *
 * La date se lit sur `data-sort`, en ISO, et non sur le texte affiché en
 * `24-10-2026` : la même valeur, mais dans l'ordre que badnet a déjà choisi
 * pour trier — et sans ambiguïté sur le jour et le mois.
 */
export function tournoisEngages(reponse: Reponse): readonly TournoiEngage[] {
  const carte = carteDesTournois(reponse.contenu, "Mes tournois");
  if (carte === null) return [];

  const tournois: TournoiEngage[] = [];
  for (const ligne of carte.matchAll(/<tr[^>]*>(.*?)<\/tr>/gsu)) {
    const corps = ligne[1] ?? "";
    const evenement = /eventid=(\d+)/.exec(corps)?.[1];
    const date = /data-sort="(\d{4}-\d{2}-\d{2})"/.exec(corps)?.[1];
    const nom = /<a [^>]*eventid=\d+[^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*([^<]+)/.exec(corps)?.[1];
    if (evenement === undefined || date === undefined || nom === undefined) continue;

    tournois.push({
      evenement: Number(evenement),
      nom: nom.trim(),
      // Midi plutôt que minuit : une date de tournoi n'a pas d'heure, et
      // minuit local bascule de jour au moindre décalage à l'affichage.
      date: new Date(`${date}T12:00:00`),
    });
  }
  return tournois;
}

/**
 * Le bloc d'une carte, reconnu par son titre.
 *
 * Découpé sur les titres plutôt que sur la structure : `card-body` s'imbrique,
 * et compter les balises fermantes à la main sur du HTML est le genre de
 * parseur qui casse au premier changement de mise en page.
 *
 * Le titre est cherché **dans le balisage du titre**, jamais dans le document
 * entier : chercher « Mes tournois » n'importe où le trouve dans un
 * commentaire, dans une infobulle, dans le nom d'un tournoi — et découpe alors
 * la mauvaise carte. Le défaut est arrivé au premier test.
 */
function carteDesTournois(contenu: string, titre: string): string | null {
  const cartes = [...contenu.matchAll(/card-title[^>]*>(.*?)<\/h6>/gsu)];

  for (const [rang, carte] of cartes.entries()) {
    if (sansBalises(carte[1] ?? "") !== titre) continue;
    const debut = (carte.index ?? 0) + carte[0].length;
    const suivante = cartes[rang + 1]?.index;
    return contenu.slice(debut, suivante);
  }
  return null;
}

function sansBalises(fragment: string): string {
  return fragment.replaceAll(/<[^>]*>/gu, " ").replaceAll(/\s+/gu, " ").trim();
}

/**
 * Ma fiche d'inscription à un tournoi — spec 027.
 *
 * **Les tableaux se lisent sur le formulaire de modification, pas sur le
 * résumé.** Le résumé dit « Oui (tableaux cachés par l'organisateur) » dès que
 * celui-ci les masque, ce qui est le cas courant ; le formulaire, lui, porte
 * toujours ma propre inscription, puisque c'est avec lui que je la changerais.
 *
 * Le partenaire vient du couple `partnaird` / `ac_partnaird` — la licence et le
 * nom —, et son équivalent en mixte. Absents sur un simple, absents aussi tant
 * que la paire n'est pas formée.
 */
export function engagementDuTournoi(
  reponse: Reponse,
  tournoi: TournoiEngage,
): Engagement {
  const contenu = reponse.contenu;

  const tableaux = [
    tableauChoisi(contenu, "drawsid", null),
    tableauChoisi(contenu, "drawdid", "d"),
    tableauChoisi(contenu, "drawmid", "m"),
  ].filter((choisi): choisi is TableauEngage => choisi !== null);

  return { ...tournoi, statut: statutDeLInscription(contenu), tableaux };
}

/**
 * L'option sélectionnée d'un des trois choix — simple, double, mixte.
 *
 * `Non` et « Clt. trop élevé » ne sont pas des engagements : le premier dit
 * qu'on ne joue pas, le second qu'on ne peut pas. `tableauEngage` les écarte
 * en refusant tout libellé qui n'est pas un tableau suivi d'une série.
 */
function tableauChoisi(
  contenu: string,
  champ: string,
  suffixeDuPartenaire: "d" | "m" | null,
): TableauEngage | null {
  const bloc = new RegExp(`<select[^>]*name="${champ}"(.*?)</select>`, "su").exec(contenu)?.[1];
  if (bloc === undefined) return null;

  const libelle = /<option[^>]*selected[^>]*>([^<]*)/u.exec(bloc)?.[1];
  const lu = libelle === undefined ? null : tableauEngage(libelle);
  if (lu === null) return null;

  return { ...lu, partenaire: suffixeDuPartenaire === null ? null : partenaire(contenu, suffixeDuPartenaire) };
}

function partenaire(contenu: string, suffixe: "d" | "m"): Engagement["tableaux"][number]["partenaire"] {
  const nom = valeurDuChamp(contenu, `ac_partnair${suffixe}`);
  if (nom === null || nom === "") return null;
  const licence = valeurDuChamp(contenu, `partnair${suffixe}`);
  return { licence: licence === null || licence === "" ? null : (licence as Licence), nom };
}

function valeurDuChamp(contenu: string, nom: string): string | null {
  const trouve = new RegExp(`name="${nom}"[^>]*value="([^"]*)"`, "u").exec(contenu)?.[1];
  // Déchappé : un nom de partenaire porte des apostrophes et des accents, que
  // badnet écrit en entités dans un attribut.
  return trouve === undefined ? null : dechapper(trouve);
}

/**
 * La dernière phrase que badnet dit de l'inscription.
 *
 * La dernière et non la première : la fiche les empile — envoyée, enregistrée,
 * payée —, et c'est l'état courant qui intéresse, pas l'historique.
 */
function statutDeLInscription(contenu: string): string | null {
  const phrases = [...contenu.matchAll(/Inscription (?:envoyée|enregistrée|payée)[^<]{0,40}/gu)];
  return phrases.at(-1)?.[0].trim() ?? null;
}

/**
 * L'autre visage — spec 027.
 *
 * `/competitions` porte mes engagements, derrière une connexion et une 2FA.
 * La page sert le mur tant qu'on n'est pas entré, et c'est ce même mur qui
 * porte l'identifiant d'action de la connexion : on le relève donc là, à
 * chaque tentative, plutôt que de l'écrire en dur comme celui de la recherche.
 *
 * Une action écrite en dur qui périme casse la recherche, et le rapport du
 * lendemain le dit. Une action de connexion qui périme, elle, laisse la session
 * mourir sans que rien ne la renouvelle : personne ne verrait la panne avant
 * que la donnée n'ait un mois.
 */
export const COMPETITIONS = `${RACINE}/competitions`;

/** Rétrocompatibilité du premier temps : le bouton de `/sources` la vise. */
export const ENGAGEMENTS = COMPETITIONS;

/** La fiche d'un tournoi, celle que chaque ligne de la liste désigne. */
export function ficheDunTournoiUrl(evenement: number): string {
  return `${RACINE}/joueur/tournoi?eventid=${evenement}`;
}

/**
 * La fiche **publique** d'un tournoi — spec 002.
 *
 * `/tournoi/public?eventid=…`, l'adresse que la recherche publie dans son JSON,
 * ne rend qu'une coquille vide : c'est une URL d'affichage, pas une page. La
 * fiche est sur `/tournoi/public/informations`, et il a fallu lire la requête
 * réelle d'un navigateur pour le voir — le premier relevé, lancé sur la
 * mauvaise adresse, a rapporté 8 Ko de vitrine et rien d'autre.
 *
 * C'est d'elle que vient la ville, absente de `/competitions`, et avec elle les
 * journées réelles du tournoi que la face sous session ignore.
 */
export function fichePubliqueUrl(evenement: number): string {
  return `${RACINE}/tournoi/public/informations?eventid=${evenement}`;
}

/**
 * L'action que porte la coquille **publique** — spec 002.
 *
 * L'équivalent du `default_page` de l'application authentifiée, sous un autre
 * nom : le site public la pose en `data-inside_page`, sur un `div` de `#main`.
 * La relever plutôt que l'écrire en dur suit la règle de 027 — ces
 * identifiants changent avec le déploiement, et celui-ci doit casser
 * bruyamment le jour où il périme, pas se taire.
 */
const ACTION_INTERNE = /data-inside_page="([a-f0-9]+)"/;

export function actionInterneDeLaPage(reponse: Reponse): string | null {
  return ACTION_INTERNE.exec(reponse.contenu)?.[1] ?? null;
}

/**
 * L'action de l'**enveloppe** de la page tournoi — spec 036.
 *
 * La coquille publique porte deux actions sur le même `div` de `#main` :
 * `data-inside_page` charge l'onglet « Présentation », `data-ic_a` charge
 * l'enveloppe — le bandeau du tournoi, avec son titre, sa ville, ses dates et
 * ses dates d'inscription. 002 n'exploitait que la première, et se privait de
 * la seule source qui réponde quand l'organisateur n'a pas saisi de gymnase.
 *
 * On la relève **sur ce div-là**, et non sur le premier `data-ic_a` venu : la
 * barre de navigation en porte un par entrée de menu, et le premier du document
 * est celui de l'accueil.
 */
const DIV_DU_CONTENU = /<div\b[^>]*\bdata-inside_page="[a-f0-9]+"[^>]*>/su;
const ACTION_DE_L_ENVELOPPE = /data-ic_a="([a-f0-9]+)"/u;

export function actionDeLEnveloppe(reponse: Reponse): string | null {
  const div = DIV_DU_CONTENU.exec(reponse.contenu)?.[0];
  if (div === undefined) return null;
  return ACTION_DE_L_ENVELOPPE.exec(div)?.[1] ?? null;
}

/**
 * Les cookies anonymes du site public : la session PHP et le jeton anti-CSRF.
 *
 * badnet pose les deux dès le premier contact, sans qu'on soit connecté, et
 * refuse le POST sans eux. Ce n'est pas « passer sous session » au sens de
 * 015 : aucun compte n'est engagé, ils sont obtenus à l'instant et jetés avec
 * la fiche — c'est ce qui garde cette chaîne hors du risque de bannissement.
 */
export function cookiesAnonymes(cookies: readonly string[]): string | null {
  const presents = ["PHPSESSID", "ic_csrf"].flatMap((nom) => {
    const valeur = valeurDuCookie(cookies, nom);
    return valeur === null ? [] : [`${nom}=${valeur}`];
  });
  return presents.length === 0 ? null : presents.join("; ");
}

/** Le jeton anti-CSRF, que badnet veut **aussi** dans le corps du POST. */
export function jetonCsrf(cookies: readonly string[]): string | null {
  return valeurDuCookie(cookies, "ic_csrf");
}

function valeurDuCookie(cookies: readonly string[], nom: string): string | null {
  for (const cookie of cookies) {
    const trouve = new RegExp(`(?:^|;\\s*)${nom}=([^;]+)`).exec(cookie);
    if (trouve?.[1] !== undefined) return trouve[1];
  }
  return null;
}

/**
 * L'appel qui rend la fiche publique, une fois l'action relevée.
 *
 * `mustache=1` parce que la coquille le réclame (`data-mustache="1"`), et
 * `eventid` parce que rien d'autre ne dit de quel tournoi il s'agit — la
 * coquille, elle, ne le porte nulle part.
 */
export function contenuPublicDuTournoi(options: {
  readonly action: string;
  readonly evenement: number;
  readonly csrf: string;
  readonly cookies: string;
}): Requete {
  return {
    url: ROUTEUR,
    jeton: options.cookies,
    methode: "POST",
    corps: new URLSearchParams({
      ic_a: options.action,
      mustache: "1",
      ic_ajax: "1",
      ic_language: "fr",
      eventid: String(options.evenement),
      ic_csrf: options.csrf,
    }).toString(),
    entetes: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
    },
  };
}

/**
 * L'en-tête du tournoi, lu sur l'enveloppe — spec 036.
 *
 * **La source la plus sûre de la ville et des dates.** Le bouton « ajouter à
 * mon agenda » embarque tout en JSON dans `data-datedata` :
 *
 * ```json
 * {"name":"…","startDate":"2026-11-14","endDate":"2026-11-15","location":"Chambly"}
 * ```
 *
 * Trois raisons de le préférer à la carte « Gymnases » que 002 lisait : il est
 * là même quand aucun gymnase n'est saisi — sept tournois sur neuf relevés le
 * 9 septembre 2026 —, ses dates sont en ISO plutôt qu'en libellé français, et
 * sa ville est nommée au lieu d'être devinée derrière un code postal.
 *
 * `location` peut être vide : c'est une donnée absente, pas une page changée.
 * L'attribut absent, lui, est une page changée — et cela doit s'entendre.
 */
export type EnTeteDuTournoi = {
  /** La ville telle que badnet la nomme, `null` quand il ne la nomme pas. */
  readonly ville: string | null;
  /**
   * Les journées du tournoi, bornes comprises.
   *
   * L'enveloppe ne donne qu'un intervalle ; la carte « Gymnases », quand elle
   * existe, donne le détail jour par jour. C'est elle qui prime — un tournoi
   * peut sauter un jour au milieu de son intervalle, et l'énumération le
   * dirait à tort.
   */
  readonly journees: readonly Date[];
};

const DATEDATA = /data-datedata="([^"]*)"/u;

/** Un tournoi ne dure pas un mois : au-delà, la date lue est fausse. */
const JOURNEES_MAXIMUM = 31;

export function enTeteDuTournoi(reponse: Reponse): EnTeteDuTournoi | null {
  const brut = DATEDATA.exec(reponse.contenu)?.[1];
  if (brut === undefined) return null;

  let charge: Record<string, unknown>;
  try {
    charge = JSON.parse(dechapper(brut)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const ville = String(charge["location"] ?? "").trim();
  return {
    ville: ville === "" ? null : ville,
    journees: journeesDeLIntervalle(String(charge["startDate"] ?? ""), String(charge["endDate"] ?? "")),
  };
}

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/u;

function journeesDeLIntervalle(debut: string, fin: string): readonly Date[] {
  if (!JOUR_ISO.test(debut)) return [];
  const premier = new Date(`${debut}T12:00:00`);
  const dernier = JOUR_ISO.test(fin) ? new Date(`${fin}T12:00:00`) : premier;
  if (Number.isNaN(premier.getTime()) || dernier < premier) return [];

  const jours: Date[] = [];
  for (let jour = premier; jour <= dernier && jours.length < JOURNEES_MAXIMUM; ) {
    jours.push(jour);
    const suivant = new Date(jour);
    suivant.setDate(suivant.getDate() + 1);
    jour = suivant;
  }
  return jours;
}

/**
 * Le lieu d'un tournoi, lu sur la carte « Gymnases » — spec 002.
 *
 * Le bloc `div.places` porte le nom de la salle dans son `h3`, et son adresse
 * dans le lien vers la carte. La ville se lit **derrière le code postal** :
 * c'est la seule découpe fiable d'une adresse française saisie à la main, où le
 * nom de rue peut contenir n'importe quoi, chiffres compris.
 *
 * Le premier gymnase, et c'est assumé : un tournoi peut en occuper deux, mais
 * la page répond à « où vais-je ce week-end », pas à « dans quelle salle joue
 * mon tableau » — celle-là n'est connue qu'au tirage.
 */
export type LieuDuTournoi = {
  readonly gymnase: string;
  readonly adresse: string;
  readonly ville: string;
};

/**
 * Le bloc des gymnases, **borné** — spec 036.
 *
 * 002 le fermait sur la première `</table>` venue. Quand l'organisateur n'a
 * rien saisi il n'y en a aucune dans le bloc : selon ce qui suit, la capture ne
 * matchait pas du tout ou courait jusqu'à une table étrangère — et la passe
 * échouait sur un tournoi parfaitement normal. Le bloc se ferme donc sur la
 * section suivante, « Avis », et sur la fin du fragment à défaut.
 */
const BLOC_DES_LIEUX = /<div class="places">(.*?)(?=<div class="reviews"|$)/su;

/** Ce que badnet écrit à la place d'un gymnase. Un signal, pas une absence. */
const AUCUN_GYMNASE = /Aucun gymnase renseigné/u;
const PREMIER_GYMNASE = /<h3>\s*([^<]+?)\s*<span>\s*<a [^>]*>\s*([^<]+?)\s*<span/su;
const VILLE = /\b\d{5}\s+(.+?)\s*$/u;

export function lieuDuTournoi(reponse: Reponse): LieuDuTournoi | null {
  const bloc = BLOC_DES_LIEUX.exec(reponse.contenu)?.[1];
  if (bloc === undefined || AUCUN_GYMNASE.test(bloc)) return null;

  const trouve = PREMIER_GYMNASE.exec(bloc);
  const gymnase = trouve?.[1]?.replaceAll(/\s+/gu, " ").trim();
  const adresse = trouve?.[2]?.replaceAll(/\s+/gu, " ").trim();
  if (gymnase === undefined || adresse === undefined) return null;

  // Une adresse sans code postal n'est pas une adresse dont on sait tirer une
  // ville : mieux vaut n'en afficher aucune que le dernier mot d'une rue. La
  // page sait déjà dire « lieu non relevé ».
  const ville = VILLE.exec(adresse)?.[1];
  if (ville === undefined) return null;

  return { gymnase, adresse, ville };
}

/**
 * Les journées du tournoi, lues sur le tableau du gymnase — spec 002.
 *
 * **La face publique rend l'intervalle que `/competitions` refuse.** Une ligne
 * par jour joué, en ISO : « samedi 24 » et « dimanche 25 » deviennent deux
 * dates, et la page peut écrire « du 24 au 25 octobre » au lieu d'une date
 * unique qui perdrait la moitié du week-end.
 *
 * Dédoublonnées et triées : deux gymnases le même jour font deux lignes, et
 * c'est le même jour de tournoi.
 */
const JOURNEE = /<td class="center">(\d{4}-\d{2}-\d{2})<\/td>/gu;

export function journeesDuTournoi(reponse: Reponse): readonly Date[] {
  const bloc = BLOC_DES_LIEUX.exec(reponse.contenu)?.[1] ?? "";
  const jours = [...new Set([...bloc.matchAll(JOURNEE)].map((trouve) => trouve[1]))];

  // Midi, comme 027 l'écrit déjà en base : une date de tournoi n'a pas d'heure,
  // et minuit local bascule de jour au moindre décalage à l'affichage.
  return jours.sort().map((jour) => new Date(`${jour}T12:00:00`));
}

/** L'action portée par le formulaire de connexion, en champ caché. */
const ACTION_DU_FORMULAIRE = /name="ic_a"\s+type="hidden"\s+value="([a-f0-9]+)"/;

export function actionDeConnexion(reponse: Reponse): string | null {
  return ACTION_DU_FORMULAIRE.exec(reponse.contenu)?.[1] ?? null;
}

/**
 * Le champ que badnet présente quand il attend le code envoyé par mail.
 *
 * Reconnu sur le `name` du champ plutôt que sur une phrase : un texte
 * d'interface se réécrit plus souvent qu'un nom de champ, et c'est déjà le
 * choix fait pour le mur de connexion.
 */
const CHAMP_DU_CODE = /name="(code|otp|token|validation)"/i;

export const moduleBadnet: ModuleDAcquisition = {
  source: "badnet",

  // Un seul appel, et il est public : une panne ici est une panne de badnet,
  // jamais une session tombée. L'autre visage — `/competitions`, mes
  // engagements derrière la 2FA — appartient à la spec 027 et à elle seule :
  // le sonder sans identifiants ne ferait qu'échouer tous les jours, et un
  // rapport qui échoue toujours ne signale plus rien.
  pagesDeLaSonde: () => [
    {
      intitule: "recherche publique de tournois",
      requete: rechercheDeTournois({ autourDe: PARIS, rayonKm: 25, aVenir: true }),
      extraire: (reponse) => tournoisDeLaRecherche(reponse).length,
    },
  ],

  /**
   * Le formulaire de connexion badnet, reconnu à ses deux champs. Marqueur
   * choisi sur la structure du formulaire plutôt que sur un texte d'accueil :
   * une phrase se réécrit plus souvent qu'un `name`.
   */
  murDeConnexion(reponse: Reponse): boolean {
    return /name="login"/.test(reponse.contenu) && /name="pwd"/.test(reponse.contenu);
  },

  /**
   * La connexion en deux temps — spec 027.
   *
   * L'identifiant est ma licence à huit chiffres, zéros de tête compris : c'est
   * ce que badnet attend, et `BABO_LICENCE` la porte déjà sous cette forme
   * depuis la migration `006__licences_a_huit_chiffres`. Une seconde variable
   * qui devrait toujours valoir la première serait une occasion de les
   * désaccorder.
   *
   * `remember` est envoyée : chaque expiration coûte un aller-retour dans une
   * boîte mail et une saisie à la main, et c'est précisément le geste que 015
   * cherchait à supprimer. Le jeton vit dans une base chiffrée, qu'il dure un
   * jour ou trois mois.
   */
  connexion: {
    prealable: {
      requete: () => ({ url: ENGAGEMENTS, jeton: null }),
      lireLAction: actionDeConnexion,
    },

    requete: ({ identifiant, motDePasse, action }) => ({
      url: ROUTEUR,
      jeton: null,
      methode: "POST",
      corps: new URLSearchParams({
        ic_a: action ?? "",
        ic_ajax: "1",
        login: identifiant,
        pwd: motDePasse,
        remember: "1",
      }).toString(),
      entetes: {
        "content-type": "application/x-www-form-urlencoded",
        "x-requested-with": "XMLHttpRequest",
      },
    }),

    jetonDepuisLesCookies,

    deuxiemeTemps: {
      // Le mur du code n'est pas celui de la connexion : les deux portent des
      // champs différents, et les confondre ferait redemander un mot de passe
      // là où il faut recopier six chiffres.
      reclameUnCode: (reponse) => CHAMP_DU_CODE.test(reponse.contenu),

      confirmation: (code, cookies, reponse) => ({
        url: ROUTEUR,
        // Les cookies pré-authentifiés du premier temps : sans eux, badnet ne
        // sait pas de quelle tentative ce code est la suite.
        jeton: cookies.join("; "),
        methode: "POST",
        corps: new URLSearchParams({
          ic_a: actionDeConnexion(reponse) ?? "",
          ic_ajax: "1",
          [nomDuChampDuCode(reponse)]: code,
        }).toString(),
        entetes: {
          "content-type": "application/x-www-form-urlencoded",
          "x-requested-with": "XMLHttpRequest",
        },
      }),
    },
  },
};

/**
 * Le nom exact du champ, relu sur la page plutôt que supposé.
 *
 * On ne sait pas encore comment badnet nomme ce champ — personne n'a vu la
 * page —, d'où la reconnaissance sur plusieurs noms possibles. Le premier
 * relevé réel tranchera, et cette fonction se réduira à une constante.
 */
function nomDuChampDuCode(reponse: Reponse): string {
  return CHAMP_DU_CODE.exec(reponse.contenu)?.[1] ?? "code";
}

/**
 * Le cookie de session badnet, extrait de ce que la réponse a posé.
 *
 * Reconnu par son nom PHP standard, `PHPSESSID`, que le mur de connexion
 * confirme — badnet est une application PHP. Rendu sous la forme d'un en-tête
 * `Cookie` complet, celle que `jeton_source` garde et que les requêtes
 * présentent telle quelle.
 */
function jetonDepuisLesCookies(cookies: readonly string[]): string | null {
  const session = cookies
    .map((cookie) => /(^|;\s*)(PHPSESSID=[^;]+)/.exec(cookie)?.[2])
    .find((valeur) => valeur !== undefined);
  return session ?? null;
}
