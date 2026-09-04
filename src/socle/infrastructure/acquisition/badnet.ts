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
export const ENGAGEMENTS = `${RACINE}/competitions`;

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
