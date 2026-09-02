import type { Horloge } from "./horloge.ts";
import { licence as normaliser, type Licence } from "./licence.ts";

/**
 * La porte — spec 021.
 *
 * Le serveur est joignable depuis internet, et il sert des téléphones de
 * coéquipiers — des gens qui n'ont rien demandé et dont la fuite ne serait pas
 * rattrapable —, plus l'écran de session myffbad, donc un chemin vers un compte
 * fédéral. Rien de tout cela ne doit répondre sans mot de passe.
 *
 * Un seul compte, un jeton signé déposé en cookie, aucune session en base : la
 * vérification est une signature, pas une lecture. C'est la forme la plus
 * simple qui tienne pour un utilisateur unique, et elle évite une table de
 * sessions dont chaque ligne serait la même.
 */

/** Le compte unique. Il n'y a pas d'inscription : il est posé au démarrage. */
export type Compte = {
  readonly licence: Licence;
  /** Le haché, jamais le clair. Sa forme est un détail de l'adaptateur. */
  readonly hache: string;
  readonly poseLe: Date;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotCompte = {
  lire(): Compte | null;
  poser(compte: Compte): void;
};

/**
 * Ce que le jeton transporte.
 *
 * Deux dates et non une, et c'est tout le mécanisme : `expireLe` glisse à
 * chaque visite pour qu'on ne se reconnecte jamais en usage normal ;
 * `connecteLe` ne bouge jamais et plafonne la session. Un cookie volé dont le
 * voleur se sert tous les jours reste donc borné — sans quoi une échéance
 * glissante serait une échéance infinie.
 */
export type ChargeDuJeton = {
  readonly licence: string;
  readonly connecteLe: Date;
  readonly expireLe: Date;
};

/**
 * Port : la signature du jeton. L'adaptateur est un HMAC, mais le cœur ne le
 * sait pas — il sait seulement qu'un jeton illisible ou mal signé rend `null`.
 */
export type SignatureDeJeton = {
  signer(charge: ChargeDuJeton): string;
  lire(jeton: string): ChargeDuJeton | null;
};

/** Port : le hachage du mot de passe. Coûteux à dessein, c'est sa raison d'être. */
export type HachageDeMotDePasse = {
  hacher(clair: string): string;
  verifier(clair: string, hache: string): boolean;
};

const JOUR = 24 * 60 * 60_000;

/** Échéance glissante : repoussée d'autant à chaque visite. */
export const VALIDITE = 30 * JOUR;

/**
 * Plafond absolu depuis la connexion. Au-delà, la ressaisie du mot de passe est
 * obligatoire, quelle que soit l'assiduité des visites. C'est la seule borne
 * qu'un jeton stateless sache opposer à un cookie volé : il ne se révoque pas,
 * et la rotation du secret de signature déconnecte aussi le téléphone.
 */
export const PLAFOND = 90 * JOUR;

/** En dessous, la visite repousse l'échéance. Au-dessus, elle ne réécrit rien. */
const SEUIL_DE_RENOUVELLEMENT = VALIDITE / 2;

export const VERDICTS = ["valide", "expiree", "plafonnee", "absente"] as const;

export type VerdictDeSession = (typeof VERDICTS)[number];

/**
 * Le sort d'un jeton présenté.
 *
 * `absente` couvre le jeton manquant comme le jeton mal signé : de l'extérieur
 * de la porte, les deux sont la même chose, et distinguer « pas de cookie » de
 * « cookie falsifié » ne renseignerait que celui qui falsifie.
 */
export function examiner(charge: ChargeDuJeton | null, maintenant: Date): VerdictDeSession {
  if (charge === null) return "absente";
  if (maintenant.getTime() > charge.connecteLe.getTime() + PLAFOND) return "plafonnee";
  if (maintenant.getTime() > charge.expireLe.getTime()) return "expiree";
  return "valide";
}

/**
 * L'échéance d'un jeton frais ou renouvelé, jamais au-delà du plafond.
 *
 * C'est le clampage qui fait tenir les deux règles ensemble : sans lui, une
 * visite au 89ᵉ jour rendrait un jeton valable jusqu'au 119ᵉ.
 */
export function echeance(connecteLe: Date, maintenant: Date): Date {
  return new Date(
    Math.min(maintenant.getTime() + VALIDITE, connecteLe.getTime() + PLAFOND),
  );
}

/**
 * Faut-il repousser l'échéance ?
 *
 * Pas à chaque requête : réécrire le cookie sur chaque page ne prolongerait
 * rien de plus et ferait du `Set-Cookie` sur chaque réponse, journal du proxy
 * compris. À la moitié de la validité consommée, ce qui laisse quinze jours de
 * marge à qui visite une fois par mois.
 */
export function aRenouveler(charge: ChargeDuJeton, maintenant: Date): boolean {
  const restant = charge.expireLe.getTime() - maintenant.getTime();
  const plafonne = echeance(charge.connecteLe, maintenant).getTime();
  return restant < SEUIL_DE_RENOUVELLEMENT && plafonne > charge.expireLe.getTime();
}

/**
 * Le portier : la limitation des tentatives — spec 021.
 *
 * La licence n'est pas un secret : elle est sur myffbad et dans tous les
 * résultats de tournoi. Toute la sécurité tient donc au seul mot de passe, et
 * un formulaire ouvert suffirait à le travailler indéfiniment.
 *
 * Le compteur est **global**, pas par adresse : il n'y a qu'un compte, et
 * compter par IP se contourne en changeant d'IP. Le prix assumé est qu'un tiers
 * peut m'enfermer dehors en échouant exprès — d'où un verrou plafonné à un
 * quart d'heure, jamais définitif.
 *
 * En mémoire, pas en base : un redémarrage remet le compteur à zéro, mais
 * provoquer des redémarrages n'est pas à la portée de qui frappe à la porte,
 * et une table d'échecs de connexion serait un état de plus à sauvegarder.
 */
export const ECHECS_AVANT_VERROU = 5;
export const VERROU_INITIAL = 60_000;
export const VERROU_MAXIMUM = 15 * 60_000;

export type Portier = {
  /** L'instant jusqu'auquel la porte reste close, ou `null` si elle est ouverte. */
  verrouJusqua(maintenant: Date): Date | null;
  echec(maintenant: Date): void;
  succes(): void;
};

export function creerPortier(): Portier {
  let echecs = 0;
  let jusqua: Date | null = null;

  return {
    verrouJusqua: (maintenant) =>
      jusqua !== null && maintenant.getTime() < jusqua.getTime() ? jusqua : null,

    echec(maintenant: Date): void {
      echecs += 1;
      if (echecs < ECHECS_AVANT_VERROU) return;
      // Une minute, puis deux, puis quatre… plafonnées à un quart d'heure.
      const attente = Math.min(
        VERROU_INITIAL * 2 ** (echecs - ECHECS_AVANT_VERROU),
        VERROU_MAXIMUM,
      );
      jusqua = new Date(maintenant.getTime() + attente);
    },

    succes(): void {
      echecs = 0;
      jusqua = null;
    },
  };
}

export type Connexion =
  | { readonly issue: "ouverte"; readonly jeton: string; readonly expireLe: Date }
  | { readonly issue: "refusee" }
  | { readonly issue: "verrouillee"; readonly jusqua: Date };

export type Authentification = {
  /**
   * Pose ou met à jour le compte d'après la configuration — spec 021.
   *
   * La variable d'environnement fait foi : changer le mot de passe, c'est
   * l'éditer et redémarrer, ce que le service supervisé de 020 rend trivial.
   * Aucun écran de changement, donc aucun chemin de récupération à inventer.
   * Rend `true` si le haché a été (ré)écrit.
   */
  poserLeCompte(licence: Licence, motDePasse: string): boolean;
  connecter(licence: string, motDePasse: string): Connexion;
  /** Examine le jeton présenté et rend, le cas échéant, celui qui le remplace. */
  reconnaitre(jeton: string | null): {
    readonly verdict: VerdictDeSession;
    readonly renouvele: { readonly jeton: string; readonly expireLe: Date } | null;
  };
};

export function creerAuthentification(options: {
  readonly comptes: DepotCompte;
  readonly hachage: HachageDeMotDePasse;
  readonly signature: SignatureDeJeton;
  readonly horloge: Horloge;
  readonly portier?: Portier;
}): Authentification {
  const { comptes, hachage, signature, horloge } = options;
  const portier = options.portier ?? creerPortier();

  return {
    poserLeCompte(licence: Licence, motDePasse: string): boolean {
      const existant = comptes.lire();
      if (existant !== null && existant.licence === licence) {
        if (hachage.verifier(motDePasse, existant.hache)) return false;
      }
      comptes.poser({
        licence,
        hache: hachage.hacher(motDePasse),
        poseLe: horloge.maintenant(),
      });
      return true;
    },

    connecter(saisie: string, motDePasse: string): Connexion {
      const maintenant = horloge.maintenant();
      const verrou = portier.verrouJusqua(maintenant);
      if (verrou !== null) return { issue: "verrouillee", jusqua: verrou };

      // Normalisée comme partout ailleurs (028) : le numéro est stocké sur huit
      // chiffres, et personne ne tape les zéros de tête. Sans ce passage, entrer
      // « 7194591 » avec le bon mot de passe serait refusé sans qu'on comprenne.
      const demandee = formeConnue(saisie);

      const compte = comptes.lire();
      // Le haché est vérifié même quand la licence ne correspond pas : sans
      // cela, le temps de réponse dirait laquelle des deux moitiés est fausse,
      // et la licence n'étant pas un secret, seule la seconde compte.
      const correct = hachage.verifier(motDePasse, compte?.hache ?? "");
      if (compte === null || compte.licence !== demandee || !correct) {
        portier.echec(maintenant);
        return { issue: "refusee" };
      }

      portier.succes();
      const expireLe = echeance(maintenant, maintenant);
      return {
        issue: "ouverte",
        jeton: signature.signer({ licence: compte.licence, connecteLe: maintenant, expireLe }),
        expireLe,
      };
    },

    reconnaitre(jeton: string | null) {
      const maintenant = horloge.maintenant();
      const charge = jeton === null ? null : signature.lire(jeton);
      const verdict = examiner(charge, maintenant);
      if (verdict !== "valide" || charge === null) return { verdict, renouvele: null };
      if (!aRenouveler(charge, maintenant)) return { verdict, renouvele: null };

      const expireLe = echeance(charge.connecteLe, maintenant);
      return {
        verdict,
        renouvele: {
          jeton: signature.signer({ ...charge, expireLe }),
          expireLe,
        },
      };
    },
  };
}

/** La licence saisie, sous sa forme normalisée, ou `null` si ce n'en est pas une. */
function formeConnue(saisie: string): string | null {
  try {
    return normaliser(saisie);
  } catch {
    return null;
  }
}
