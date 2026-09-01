import type { Source } from "./source.ts";
import type { DepotCaptures } from "./capture.ts";
import type { DepotBuilds } from "./build.ts";
import type { Horloge } from "./horloge.ts";
import type { Issue } from "./rapport-execution.ts";
import type { JetonMyffbad } from "./jeton-myffbad.ts";
import { jetonValide } from "./jeton-myffbad.ts";

/**
 * L'accès aux sites fédéraux — spec 015.
 *
 * Un seul port sortant, volontairement pauvre : une URL, une session, une
 * réponse. Ni myffbad ni badnet n'expose d'API documentée, donc le socle
 * n'offre rien de plus qu'un navigateur sans écran — ce qui se sait de chaque
 * site vit dans son module d'acquisition, pas ici.
 *
 * Les deux sources sont acquises séparément et n'ont aucun type en commun
 * au-delà de celui-ci : c'est ce qui permet qu'une panne de l'une n'arrête pas
 * l'autre, et qu'un changement de page n'en casse qu'une.
 */
export type Requete = {
  readonly url: string;
  /** Cookie de session, ou `null` pour une page publique. */
  readonly jeton: string | null;
  readonly methode?: "GET" | "POST";
  readonly corps?: string;
  /**
   * En-têtes propres à l'appel. Le socle ne sait pas ce qu'ils veulent dire —
   * c'est le module de la source qui les compose, parce que lui seul connaît
   * la mécanique de son site.
   */
  readonly entetes?: Readonly<Record<string, string>>;
};

export type Reponse = {
  /** L'URL réellement atteinte : c'est elle qui trahit une redirection vers la page de connexion. */
  readonly url: string;
  readonly statutHttp: number;
  readonly contenu: string;
  /**
   * Les cookies posés par la réponse. C'est par là qu'une connexion rend le
   * jeton : sans eux, s'authentifier ne servirait à rien.
   */
  readonly cookies: readonly string[];
};

/** Port : `infrastructure` en fournit l'adaptateur `fetch`. */
export type ClientHttp = {
  recuperer(requete: Requete): Promise<Reponse>;
};

/**
 * La session est tombée : le scraper s'arrête et attend une
 * réauthentification depuis l'interface (spec 015).
 *
 * C'est une panne attendue, pas un bug : le jeton dure un mois, et tant que la
 * connexion n'est pas automatisée personne ne peut le renouveler à la place de
 * l'humain — définitivement pour badnet, dont la 2FA ferme la porte.
 */
export class SessionMorte extends Error {
  readonly source: Source;
  readonly url: string;

  constructor(source: Source, url: string) {
    super(
      `Session ${source} tombée : ${url} a répondu la page de connexion. En enregistrer une nouvelle depuis /sources.`,
    );
    this.name = "SessionMorte";
    this.source = source;
    this.url = url;
  }
}

/**
 * L'identifiant d'action ne correspond plus à rien — spec 015.
 *
 * Les Server Actions de myffbad sont désignées par un hash de construction :
 * il change quand le site redéploie le code de l'action. La panne est franche
 * — `404 Server action not found` — donc jamais confondue avec une absence de
 * données. Elle ne se répare pas comme une session morte : c'est un
 * identifiant à relever de nouveau, pas un cookie à recoller.
 */
export class ActionIntrouvable extends Error {
  readonly source: Source;

  constructor(source: Source, url: string) {
    super(
      `Action ${source} introuvable sur ${url} : l'identifiant a péri avec le déploiement. En relever un nouveau depuis le navigateur.`,
    );
    this.name = "ActionIntrouvable";
    this.source = source;
  }
}

/**
 * Garde-fou contre la boucle : une passe qui dépasse son plafond s'arrête.
 *
 * Le risque de bannissement est assumé pour un passage par jour (015), pas
 * pour une pagination qui ne s'arrête jamais. Le plafond transforme un bug de
 * boucle en échec consigné plutôt qu'en compte fermé.
 */
export class PlafondAtteint extends Error {
  readonly plafond: number;

  constructor(plafond: number) {
    super(
      `Plafond de ${plafond} requêtes atteint sur cette passe : elle s'arrête sans finir. Un scraper qui boucle vaut un compte banni.`,
    );
    this.name = "PlafondAtteint";
    this.plafond = plafond;
  }
}

/**
 * Archive chaque réponse avant que quiconque l'analyse — spec 019.
 *
 * Décorateur et non option du client : l'archivage doit être impossible à
 * oublier, y compris pour la page d'erreur ou le mur de connexion, qui sont
 * justement celles qu'on voudra relire après coup. Un parseur devenu aveugle
 * se corrige alors en rejouant les captures, sans retoucher au réseau.
 */
export function enArchivant(
  client: ClientHttp,
  options: {
    readonly source: Source;
    readonly captures: DepotCaptures;
    readonly horloge: Horloge;
  },
): ClientHttp {
  const { source, captures, horloge } = options;

  return {
    async recuperer(requete: Requete): Promise<Reponse> {
      const reponse = await client.recuperer(requete);
      captures.archiver({
        source,
        url: reponse.url,
        statutHttp: reponse.statutHttp,
        contenu: reponse.contenu,
        captureeLe: horloge.maintenant(),
      });
      return reponse;
    },
  };
}

/**
 * Consigne le déploiement que chaque réponse annonce — spec 015.
 *
 * Décorateur, pour la même raison que l'archivage : ce qui doit être vu à
 * chaque requête ne doit dépendre d'aucun appelant. La source qui n'annonce
 * rien traverse sans frais.
 */
export function enObservantLeBuild(
  client: ClientHttp,
  options: {
    readonly module: ModuleDAcquisition;
    readonly builds: DepotBuilds;
    readonly horloge: Horloge;
  },
): ClientHttp {
  const { module, builds, horloge } = options;
  if (module.buildDeLaReponse === undefined) return client;
  const lire = module.buildDeLaReponse.bind(module);

  return {
    async recuperer(requete: Requete): Promise<Reponse> {
      const reponse = await client.recuperer(requete);
      const build = lire(reponse);
      if (build !== null) builds.observer(module.source, build, horloge.maintenant());
      return reponse;
    },
  };
}

/**
 * Les identifiants d'action ont-ils été relevés sous un autre déploiement ?
 *
 * Réponse volontairement prudente : un build neuf ne périme pas forcément les
 * identifiants — seul le redéploiement de l'action elle-même le fait. Ceci
 * signale un risque, pas une panne ; la panne, elle, est franche et porte un
 * nom (`ActionIntrouvable`).
 */
export function actionsPeutEtrePerimees(
  module: ModuleDAcquisition,
  buildCourant: string | null,
): boolean {
  return (
    module.buildDesActions !== undefined &&
    buildCourant !== null &&
    buildCourant !== module.buildDesActions
  );
}

/** Compte les requêtes d'une passe et l'arrête au plafond. Une instance par passe. */
export function sousPlafond(client: ClientHttp, plafond: number): ClientHttp {
  let consommees = 0;

  return {
    recuperer(requete: Requete): Promise<Reponse> {
      if (consommees >= plafond) throw new PlafondAtteint(plafond);
      consommees += 1;
      return client.recuperer(requete);
    },
  };
}

/**
 * Ce que l'écran des sources affiche d'une source — specs 015 et 019.
 *
 * L'ancienneté y figure même quand la donnée est périmée : une page qui se
 * tait sur la fraîcheur laisse croire qu'un classement d'il y a trois semaines
 * est celui d'aujourd'hui.
 */
export type EtatDeLaSource = {
  readonly source: Source;
  readonly session: "absente" | "expiree" | "valide";
  /** La source sait-elle aller chercher sa session seule, ici et maintenant ? */
  readonly autonome: boolean;
  /** Quand la session a été enregistrée. C'est ce qui répond à « en ai-je déjà une ? ». */
  readonly enregistreeLe: Date | null;
  readonly expireLe: Date | null;
  /** Jours restants, arrondis au jour entamé. `null` sans session vivante. */
  readonly joursRestants: number | null;
  readonly derniereAcquisition: Date | null;
  readonly derniereIssue: Issue | null;
};

const UN_JOUR = 24 * 60 * 60 * 1000;

export function etatDeLaSource(
  source: Source,
  jeton: JetonMyffbad | null,
  derniere: { readonly termineLe: Date; readonly issue: Issue } | null,
  maintenant: Date,
  autonome = false,
): EtatDeLaSource {
  const vivante = jetonValide(jeton, maintenant);

  return {
    source,
    autonome,
    session: jeton === null ? "absente" : vivante ? "valide" : "expiree",
    enregistreeLe: jeton?.obtenuLe ?? null,
    expireLe: jeton?.expireLe ?? null,
    joursRestants:
      vivante && jeton !== null
        ? Math.ceil((jeton.expireLe.getTime() - maintenant.getTime()) / UN_JOUR)
        : null,
    derniereAcquisition: derniere?.termineLe ?? null,
    derniereIssue: derniere?.issue ?? null,
  };
}

/**
 * Une requête que la sonde d'accès va jouer pour prouver que la source répond
 * — spec 015.
 *
 * Une requête et non une URL : myffbad ne rend ses données que par appels de
 * fonctions serveur, et une sonde qui ne saurait que visiter des pages
 * prouverait l'accès sans prouver l'acquisition.
 */
export type PageSondee = {
  readonly intitule: string;
  readonly requete: Requete;
  /**
   * Combien d'objets la source a réellement rendus, quand le module sait les
   * compter — spec 019.
   *
   * Une taille en octets ne prouve rien : une session morte rend `200` et une
   * liste vide, et myffbad le fait précisément ainsi. Seul un décompte
   * distingue « la page a répondu » de « la page a répondu quelque chose », et
   * c'est cette différence que `issueDuVolume` transforme en panne.
   */
  extraire?(reponse: Reponse): number;
};

/**
 * Ce que le socle sait d'un site fédéral — un module par site, spec 015.
 *
 * « Le parsing de chaque site vit dans un module unique » : le reste de
 * l'application ne connaît que ce type, jamais une URL ni une balise. Le mur
 * de connexion en fait partie, parce qu'il ne se reconnaît pas de la même
 * façon des deux côtés — myffbad redirige, badnet sert sa page de connexion
 * sous l'URL demandée.
 */
export type ModuleDAcquisition = {
  readonly source: Source;
  /** Fonction du jeton : les appels sous session en dépendent pour se composer. */
  pagesDeLaSonde(jeton: string | null): readonly PageSondee[];
  murDeConnexion(reponse: Reponse): boolean;
  /**
   * Le déploiement que la réponse annonce, quand la source en annonce un.
   *
   * myffbad met son `buildId` dans chaque charge. C'est ce qui permet de voir
   * venir la péremption des identifiants d'action, au lieu de la subir.
   */
  buildDeLaReponse?(reponse: Reponse): string | null;
  /**
   * Le déploiement sous lequel les identifiants d'action ont été relevés. Le
   * comparer au build courant dit s'ils risquent d'avoir péri.
   */
  readonly buildDesActions?: string;
  /**
   * De quoi s'authentifier seul, quand la source le permet — spec 015.
   *
   * Présent pour myffbad, qui ne demande que licence et mot de passe ; absent
   * pour badnet, dont la 2FA impose un humain. C'est cette absence qui dit
   * pourquoi l'écran des sources ne disparaîtra pas.
   */
  readonly connexion?: {
    requete(motDePasse: string): Requete;
    jetonDepuisLesCookies(cookies: readonly string[]): string | null;
  };
  /**
   * L'échéance que le jeton porte lui-même, quand la source en donne une.
   *
   * Sans elle il faut la deviner à la pose, et la deviner c'est mentir : une
   * session récupérée trois semaines plus tôt serait annoncée valide un mois
   * de plus, alors qu'elle meurt dans neuf jours. L'écran afficherait une
   * fraîcheur fausse, et c'est précisément ce que 019 refuse.
   */
  expirationDuJeton?(valeur: string): Date | null;
};

/** Un mois, vérifié (spec 015) — le repli quand le jeton ne dit rien de lui-même. */
export const DUREE_DE_SESSION_PAR_DEFAUT = 30 * 24 * 60 * 60 * 1000;

export function echeanceDeLaSession(
  module: ModuleDAcquisition,
  valeur: string,
  poseLe: Date,
): Date {
  return (
    module.expirationDuJeton?.(valeur) ??
    new Date(poseLe.getTime() + DUREE_DE_SESSION_PAR_DEFAUT)
  );
}

/**
 * Récupère une page et refuse le mur de connexion.
 *
 * Sans ce refus, une session morte ne produirait pas une panne mais un
 * succès vide : la page de connexion s'analyse sans erreur et rend zéro match.
 * C'est le mode de panne que 019 nomme, et il se ferme ici.
 */
export async function recupererSousSession(
  client: ClientHttp,
  module: ModuleDAcquisition,
  page: PageSondee,
): Promise<Reponse> {
  const reponse = await client.recuperer(page.requete);

  if (reponse.statutHttp === 404 && reponse.contenu.includes("Server action not found")) {
    throw new ActionIntrouvable(module.source, reponse.url);
  }
  if (module.murDeConnexion(reponse)) throw new SessionMorte(module.source, reponse.url);
  return reponse;
}
