import type { ModuleDAcquisition, Reponse, Requete } from "../../core/acquisition.ts";

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
};
