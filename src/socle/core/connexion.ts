import type { ClientHttp, ModuleDAcquisition, Reponse } from "./acquisition.ts";
import { ActionIntrouvable, echeanceDeLaSession } from "./acquisition.ts";
import type { DepotJetonMyffbad, JetonMyffbad } from "./jeton-myffbad.ts";
import type { Horloge } from "./horloge.ts";
import type { Source } from "./source.ts";

/**
 * S'authentifier — specs 015 et 027.
 *
 * C'est la pièce qui sépare une acquisition autonome d'une acquisition qui
 * attend un humain chaque mois. myffbad ne demande que licence et mot de passe :
 * sa connexion tient en un temps, et Bado la fait seul. badnet en réclame deux —
 * identifiants, puis un code reçu par mail —, et 027 les **traverse** plutôt
 * que de les contourner : le code se recopie depuis la boîte mail, une fois par
 * session.
 *
 * 015 écrivait que la 2FA de badnet « ferme la porte définitivement ». Elle ne
 * la ferme qu'à l'automatisation complète. Et l'asymétrie était tenue à
 * l'envers : c'est badnet qui a une 2FA, pas myffbad.
 *
 * Le mot de passe traverse ces fonctions et n'y reste pas : il vient de
 * l'environnement, ne touche jamais la base, et seul le jeton est persisté.
 */
export class ConnexionImpossible extends Error {
  constructor(source: string) {
    super(`La source ${source} ne sait pas se connecter seule : sa session s'enregistre à la main.`);
    this.name = "ConnexionImpossible";
  }
}

export class ConnexionRefusee extends Error {
  constructor(source: string, statutHttp: number) {
    super(
      `Connexion ${source} refusée (statut ${statutHttp}) : aucun jeton dans la réponse. Vérifier les identifiants.`,
    );
    this.name = "ConnexionRefusee";
  }
}

/**
 * Le second temps a été demandé sans que le premier ait eu lieu, ou trop tard.
 *
 * Distincte de `ConnexionRefusee` parce qu'elle se répare autrement :
 * redemander un code, et non vérifier un mot de passe.
 */
export class CodeHorsDelai extends Error {
  constructor(source: string) {
    super(
      `Aucune connexion ${source} en attente de code, ou l'attente a expiré. En redemander un.`,
    );
    this.name = "CodeHorsDelai";
  }
}

const ACTION_ABSENTE = "Server action not found";

/**
 * Dix minutes, et l'attente tombe.
 *
 * Un code de vérification vit quelques minutes ; passé ce délai, laisser
 * l'écran proposer « valider » ferait croire qu'un code d'il y a une heure
 * marchera. Mieux vaut renvoyer au premier temps.
 */
export const DELAI_DU_CODE = 10 * 60_000;

/** Ce que le premier temps a produit, en attendant le code. */
export type ConnexionEnAttente = {
  readonly source: Source;
  /** Les cookies pré-authentifiés du premier temps. */
  readonly cookies: readonly string[];
  /** La réponse du premier temps : le module y relit ce dont il a besoin. */
  readonly reponse: Reponse;
  readonly demandeeLe: Date;
};

export type ResultatDeConnexion =
  | { readonly issue: "ouverte"; readonly jeton: JetonMyffbad }
  | { readonly issue: "code-attendu" };

/**
 * Les connexions en cours de second temps.
 *
 * **En mémoire, pas en base.** L'attente vit dix minutes, et un redémarrage
 * dans cet intervalle veut simplement dire qu'on recommence — ce n'est pas une
 * perte. Surtout, cela garde un cookie à moitié authentifié hors de la base :
 * le seul qu'on y écrit est celui qui marche.
 */
export type Attentes = {
  poser(attente: ConnexionEnAttente): void;
  lire(source: Source, maintenant: Date): ConnexionEnAttente | null;
  oublier(source: Source): void;
  /** Ce que l'écran affiche : y a-t-il un code attendu, et depuis quand. */
  enCours(maintenant: Date): readonly ConnexionEnAttente[];
};

export function creerAttentes(delai = DELAI_DU_CODE): Attentes {
  const parSource = new Map<Source, ConnexionEnAttente>();

  const vivante = (attente: ConnexionEnAttente, maintenant: Date): boolean =>
    maintenant.getTime() - attente.demandeeLe.getTime() <= delai;

  return {
    poser: (attente) => void parSource.set(attente.source, attente),

    lire(source: Source, maintenant: Date): ConnexionEnAttente | null {
      const attente = parSource.get(source);
      if (attente === undefined) return null;
      if (vivante(attente, maintenant)) return attente;
      parSource.delete(source);
      return null;
    },

    oublier: (source) => void parSource.delete(source),

    enCours: (maintenant) =>
      [...parSource.values()].filter((attente) => vivante(attente, maintenant)),
  };
}

/**
 * Le premier temps : présenter les identifiants.
 *
 * Rend `ouverte` quand la réponse porte déjà la session — une 2FA qui ne se
 * déclenche pas, un appareil déjà connu —, et `code-attendu` sinon. Ne pas
 * exiger le code serait refaire, en miroir, l'erreur de 015 sur myffbad :
 * affirmer une 2FA qu'on n'a pas vue.
 */
export async function demanderUneConnexion(options: {
  readonly client: ClientHttp;
  readonly module: ModuleDAcquisition;
  readonly identifiant: string;
  readonly motDePasse: string;
  readonly jetons: DepotJetonMyffbad;
  readonly attentes: Attentes;
  readonly horloge: Horloge;
}): Promise<ResultatDeConnexion> {
  const { client, module, identifiant, motDePasse, attentes, horloge } = options;

  const connexion = module.connexion;
  if (connexion === undefined) throw new ConnexionImpossible(module.source);

  // Le préalable relève l'identifiant d'action sur une page publique. Une
  // requête par connexion, soit une par mois : le prix d'une connexion qui ne
  // casse pas en silence le jour d'un déploiement.
  const action =
    connexion.prealable === undefined
      ? null
      : connexion.prealable.lireLAction(await client.recuperer(connexion.prealable.requete()));

  const reponse = await client.recuperer(
    connexion.requete({ identifiant, motDePasse, action }),
  );
  refuserSiActionAbsente(module.source, reponse);

  // **Le code d'abord, le cookie ensuite.** L'ordre n'est pas indifférent :
  // badnet est en PHP, et PHP pose un `PHPSESSID` dès le premier contact,
  // authentifié ou non. Un cookie présent ne prouve donc rien, alors que le mur
  // du code est un signal positif — la page le porte ou ne le porte pas.
  // Tester le cookie en premier ferait prendre une demande de code pour une
  // session ouverte, et Bado repartirait avec un jeton qui n'ouvre rien.
  if (connexion.deuxiemeTemps?.reclameUnCode(reponse) === true) {
    attentes.poser({
      source: module.source,
      cookies: reponse.cookies,
      reponse,
      demandeeLe: horloge.maintenant(),
    });
    return { issue: "code-attendu" };
  }

  const jeton = jetonDeLaReponse(connexion, reponse);
  if (jeton !== null) {
    attentes.oublier(module.source);
    return { issue: "ouverte", jeton: enregistrer(options, jeton) };
  }

  // Ni code réclamé, ni session : les identifiants sont mauvais. Distinguer ce
  // cas du précédent évite d'attendre un mail qui ne viendra jamais.
  throw new ConnexionRefusee(module.source, reponse.statutHttp);
}



/** Le second temps : présenter le code reçu par mail. */
export async function confirmerParLeCode(options: {
  readonly client: ClientHttp;
  readonly module: ModuleDAcquisition;
  readonly code: string;
  readonly jetons: DepotJetonMyffbad;
  readonly attentes: Attentes;
  readonly horloge: Horloge;
}): Promise<JetonMyffbad> {
  const { client, module, code, attentes, horloge } = options;

  const connexion = module.connexion;
  const deuxiemeTemps = connexion?.deuxiemeTemps;
  if (connexion === undefined || deuxiemeTemps === undefined) {
    throw new ConnexionImpossible(module.source);
  }

  const attente = attentes.lire(module.source, horloge.maintenant());
  if (attente === null) throw new CodeHorsDelai(module.source);

  const reponse = await client.recuperer(
    deuxiemeTemps.confirmation(code, attente.cookies, attente.reponse),
  );
  refuserSiActionAbsente(module.source, reponse);

  // Le mur du code encore là, c'est un code faux — et le `PHPSESSID` qui
  // l'accompagne n'est toujours pas une session. Même raison qu'au premier
  // temps, et même ordre.
  if (deuxiemeTemps.reclameUnCode(reponse)) {
    throw new ConnexionRefusee(module.source, reponse.statutHttp);
  }

  const valeur = jetonDeLaReponse(connexion, reponse);
  if (valeur === null) throw new ConnexionRefusee(module.source, reponse.statutHttp);

  // L'attente n'a plus lieu d'être : la garder laisserait un cookie
  // pré-authentifié en mémoire bien après qu'il ne serve plus.
  attentes.oublier(module.source);
  return enregistrer(options, valeur);
}

/**
 * La connexion en un temps de 015, conservée telle quelle pour myffbad.
 *
 * Elle passe par le chemin ci-dessus et refuse ce qui réclame un code : un
 * appelant qui croit se connecter en un temps ne doit pas repartir avec une
 * promesse tenue à moitié.
 */
export async function seConnecter(options: {
  readonly client: ClientHttp;
  readonly module: ModuleDAcquisition;
  readonly identifiant: string;
  readonly motDePasse: string;
  readonly jetons: DepotJetonMyffbad;
  readonly attentes: Attentes;
  readonly horloge: Horloge;
}): Promise<JetonMyffbad> {
  const resultat = await demanderUneConnexion(options);
  if (resultat.issue === "code-attendu") {
    throw new ConnexionImpossible(options.module.source);
  }
  return resultat.jeton;
}

function jetonDeLaReponse(
  connexion: NonNullable<ModuleDAcquisition["connexion"]>,
  reponse: Reponse,
): string | null {
  return connexion.jetonDepuisLesCookies(reponse.cookies);
}

/**
 * Distinguer les deux pannes ici, et non chez l'appelant : elles se réparent
 * différemment, et les confondre enverrait recoller un cookie là où il faut
 * relever un identifiant.
 */
function refuserSiActionAbsente(source: Source, reponse: Reponse): void {
  if (reponse.statutHttp === 404 && reponse.contenu.includes(ACTION_ABSENTE)) {
    throw new ActionIntrouvable(source, reponse.url);
  }
}

function enregistrer(
  options: {
    readonly module: ModuleDAcquisition;
    readonly jetons: DepotJetonMyffbad;
    readonly horloge: Horloge;
  },
  valeur: string,
): JetonMyffbad {
  const { module, jetons, horloge } = options;
  const obtenuLe = horloge.maintenant();
  const jeton: JetonMyffbad = {
    valeur,
    obtenuLe,
    expireLe: echeanceDeLaSession(module, valeur, obtenuLe),
  };
  jetons.enregistrer(module.source, jeton);
  return jeton;
}
