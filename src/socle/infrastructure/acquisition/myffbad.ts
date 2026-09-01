import type { ModuleDAcquisition, PageSondee, Reponse, Requete } from "../../core/acquisition.ts";
import type { Licence } from "../../core/licence.ts";
import { lireLaChargeFlight, ligneQuiPorte } from "./charge-flight.ts";

/**
 * Le module d'acquisition myffbad — spec 015, source du classement et des matchs.
 *
 * **myffbad n'est pas un site HTML.** C'est une application Next.js en
 * composants serveur : les pages arrivent sous forme de charge « flight »
 * poussée dans `self.__next_f`, et aucune API n'apparaît dans les scripts du
 * navigateur — les données sont cherchées côté serveur, hors de portée. Ce que
 * 015 appelle « scraping » sera donc une lecture de cette charge, pas une
 * lecture de balises.
 *
 * La connexion, elle, n'est pas encore automatisée mais devrait pouvoir
 * l'être : contrairement à ce que 015 affirmait, myffbad n'impose pas de 2FA
 * — sa page de connexion ne demande que licence et mot de passe. C'est badnet
 * qui en a une. En attendant, la session s'enregistre à la main depuis l'écran
 * des sources.
 */
const RACINE = "https://www.myffbad.fr";

/**
 * Les pages viennent de la carte du site lue sur l'accueil sous session, pas
 * d'une devinette : sonder au hasard un compte dont le bannissement est un
 * risque assumé (015) coûterait plus cher que d'attendre une session.
 */
export function creerModuleMyffbad(licence: Licence): ModuleDAcquisition {
  return {
    source: "myffbad",

    pagesDeLaSonde: (jeton) => {
      const fiche = `/joueur/${licence}`;
      const joueur = identifiantDuJoueur(jeton);

      return [
        // Redirige vers la connexion sans session : la page qui tranche.
        { intitule: "accueil du licencié", requete: { url: `${RACINE}/`, jeton } },
        // 002 démarrait sur une saisie manuelle faute d'avoir trouvé celle-ci,
        // et 027 l'avait écartée sans l'avoir vue.
        { intitule: "mes inscriptions", requete: { url: `${RACINE}/mes-inscriptions`, jeton } },
        // 015 donne les tournois à badnet seul. Cette page dit le contraire :
        // à trancher avant de maintenir deux sources.
        { intitule: "recherche de tournoi", requete: { url: `${RACINE}/recherche/tournoi`, jeton } },

        // Les deux appels qui portent vraiment la donnée. Visiter la fiche ne
        // prouverait rien : elle arrive vide, ses blocs sont peuplés par ces
        // fonctions serveur — c'est donc elles que la sonde doit exercer.
        ...(joueur === null
          ? []
          : ([
              {
                intitule: "classement (action)",
                requete: appel({
                  action: "classement",
                  page: fiche,
                  arguments: [joueur],
                  jeton,
                }),
                // Un classement, ou rien : le compter à 1 suffit à distinguer
                // la réponse pleine de la réponse vide d'une session morte.
                extraire: (reponse) => (classementDeLaReponse(reponse) === null ? 0 : 1),
              },
              {
                intitule: "résultats (action)",
                requete: appel({
                  action: "resultats",
                  page: fiche,
                  arguments: [{ personId: joueur, season: "$undefined", isHistory: false }],
                  jeton,
                }),
                extraire: (reponse) => resultatsDeLaReponse(reponse).length,
              },
            ] satisfies PageSondee[])),
      ];
    },

    /**
     * myffbad redirige vers `/connexion` : c'est l'URL atteinte qui trahit la
     * session morte, pas le statut, qui reste 200.
     */
    murDeConnexion(reponse: Reponse): boolean {
      return new URL(reponse.url).pathname.startsWith("/connexion");
    },

    buildDeLaReponse,
    buildDesActions: BUILD_DES_ACTIONS,

    connexion: {
      requete: (motDePasse) => connexion(licence, motDePasse),
      jetonDepuisLesCookies,
    },

    expirationDuJeton: expirationDuJwt,
  };
}

/**
 * L'échéance lue dans le jeton lui-même — spec 015.
 *
 * La session myffbad est un JWT dont la charge porte `exp`. C'est la seule
 * date qui fasse foi : le `expires` que le navigateur affiche à côté du cookie
 * est plus court, et la date de collage ne dit rien du tout.
 *
 * Ni signature vérifiée ni contenu exploité — ce serait la clé de myffbad, pas
 * la nôtre. On lit une date, et si quoi que ce soit cloche on rend `null` :
 * l'appelant retombe alors sur la durée par défaut plutôt que de refuser un
 * jeton peut-être bon.
 */
function expirationDuJwt(valeur: string): Date | null {
  const jwt = valeur
    .split(";")
    .map((morceau) => morceau.trim())
    .find((morceau) => morceau.startsWith("jwt="))
    ?.slice("jwt=".length);
  if (jwt === undefined) return null;

  const charge = jwt.split(".")[1];
  if (charge === undefined) return null;

  try {
    const { exp } = JSON.parse(Buffer.from(charge, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    return new Date(exp * 1000);
  } catch {
    return null;
  }
}

/**
 * Les Server Actions de myffbad — spec 015.
 *
 * myffbad ne rend ses données ni en HTML ni par une API : chaque écran appelle
 * une fonction serveur, désignée par un identifiant que Next.js calcule à la
 * construction. Ces identifiants sont donc **datés** : ils changent quand
 * myffbad redéploie le code de l'action.
 *
 * Ils vivent ici, relevés le 1er septembre 2026, et nulle part ailleurs. Quand
 * l'un d'eux périme, le serveur répond `404 Server action not found` — panne
 * franche, jamais une liste vide, donc détectable (voir `ActionIntrouvable`).
 * Le `buildId` que porte chaque réponse permet même de le voir venir.
 */
export const BUILD_DES_ACTIONS = "DQCg8nwBq71o32okRTijN";

export const ACTIONS = {
  connexion: "40960127f718c9144ddd4ae4c5212b5b5581a3951e",
  classement: "407802f1dd81b811b755a938c6142d52f0622e3c0a",
  resultats: "40a81539084c800c578dc3ab71c5203e560f9f3f35",
} as const;

export type Action = keyof typeof ACTIONS;

/**
 * L'appel d'une Server Action, réduit à ce qui compte.
 *
 * Vérifié en rejouant les requêtes du navigateur : `next-router-state-tree`,
 * `Referer`, `Origin` et l'agent sont superflus. Seuls l'identifiant et le
 * corps sérialisé font le travail — un contrat mince, donc peu de surface pour
 * casser.
 */
export function appel(options: {
  readonly action: Action;
  readonly page: string;
  readonly arguments: readonly unknown[];
  readonly jeton: string | null;
}): Requete {
  return {
    url: `${RACINE}${options.page}`,
    jeton: options.jeton,
    methode: "POST",
    corps: JSON.stringify(options.arguments),
    entetes: {
      "next-action": ACTIONS[options.action],
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
    },
  };
}

/**
 * S'authentifier — ce que 015 croyait impossible.
 *
 * myffbad n'impose pas de 2FA : licence et mot de passe suffisent, et
 * `rememberMe` est ce qui décide de la durée du jeton. C'est donc la pièce qui
 * rend l'acquisition myffbad autonome, là où badnet gardera son rituel manuel.
 */
export function connexion(licence: Licence, motDePasse: string): Requete {
  return appel({
    action: "connexion",
    page: "/connexion",
    arguments: [{ licence, password: motDePasse, rememberMe: true }],
    jeton: null,
  });
}

/**
 * Le jeton posé par la réponse, prêt à repartir en en-tête `Cookie`.
 *
 * On ne garde que `jwt` : les autres cookies de myffbad relèvent du bandeau de
 * consentement, et un jeton qu'on ne comprend pas ne se stocke pas.
 */
export function jetonDepuisLesCookies(cookies: readonly string[]): string | null {
  for (const cookie of cookies) {
    const paire = cookie.split(";")[0]?.trim();
    if (paire !== undefined && paire.startsWith("jwt=") && paire.length > "jwt=".length) {
      return paire;
    }
  }
  return null;
}

/**
 * Le déploiement annoncé par la réponse — spec 015.
 *
 * Next.js le pose sous la clé `b` de la ligne d'enveloppe, aussi bien dans une
 * page que dans la réponse d'une Server Action. Le lire à chaque requête donne
 * la fréquence de redéploiement de myffbad, donc la durée de vie attendue des
 * identifiants d'action — la seule fragilité qui reste à mesurer.
 */
function buildDeLaReponse(reponse: Reponse): string | null {
  for (const valeur of lireLaChargeFlight(reponse.contenu).values()) {
    if (typeof valeur !== "object" || valeur === null) continue;
    const build = (valeur as { b?: unknown }).b;
    if (typeof build === "string" && build !== "") return build;
  }
  return null;
}

/**
 * L'identifiant interne du joueur, lu dans le jeton — spec 015.
 *
 * Les Server Actions ne prennent pas la licence mais un `personId` que myffbad
 * n'expose nulle part ailleurs que dans la charge du JWT. Sans session, donc,
 * pas d'appel possible : c'est ce qui distingue les deux moitiés de
 * l'acquisition, la fiche publique et les données du licencié.
 */
export function identifiantDuJoueur(jeton: string | null): number | null {
  if (jeton === null) return null;

  const charge = jeton
    .split(";")
    .map((morceau) => morceau.trim())
    .find((morceau) => morceau.startsWith("jwt="))
    ?.slice("jwt=".length)
    .split(".")[1];
  if (charge === undefined) return null;

  try {
    const { personId } = JSON.parse(Buffer.from(charge, "base64url").toString("utf8")) as {
      personId?: unknown;
    };
    const identifiant = Number(personId);
    return Number.isSafeInteger(identifiant) && identifiant > 0 ? identifiant : null;
  } catch {
    return null;
  }
}

/**
 * Le classement rendu par l'action, ou `null` — spec 015.
 *
 * Cherché par forme et non par numéro de ligne : les identifiants de la charge
 * dépendent de l'ordre de rendu, pas du contenu. C'est aussi ce qui fait la
 * différence entre une réponse pleine et la réponse vide que myffbad rend
 * quand la session est morte — sans erreur, avec un statut 200.
 */
export function classementDeLaReponse(reponse: Reponse): Record<string, unknown> | null {
  return ligneQuiPorte(lireLaChargeFlight(reponse.contenu), [
    "SimpleSubLevel",
    "DoubleSubLevel",
    "MixteSubLevel",
  ]);
}

/** Les résultats rendus par l'action : tournois et interclubs dans la même liste. */
export function resultatsDeLaReponse(reponse: Reponse): readonly Record<string, unknown>[] {
  for (const valeur of lireLaChargeFlight(reponse.contenu).values()) {
    if (!Array.isArray(valeur)) continue;
    const liste = valeur as Record<string, unknown>[];
    if (liste.every((element) => typeof element === "object" && element !== null && "MatchId" in element)) {
      return liste;
    }
  }
  return [];
}
