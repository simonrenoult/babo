import type { ModuleDAcquisition, PageSondee, Reponse, Requete } from "../../core/acquisition.ts";
import type { Classement, Discipline, Lettre } from "../../core/classement.ts";
import { ClassementIllisible, DISCIPLINES, estUneLettre } from "../../core/classement.ts";
import type { Identite } from "../../core/identite.ts";
import { IdentiteIllisible } from "../../core/identite.ts";
import type { Licence } from "../../core/licence.ts";
import { licence as versLicence } from "../../core/licence.ts";
import { lireLaChargeFlight, objetQuiPorte } from "./charge-flight.ts";

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

        // La fiche publique, sans cookie : c'est la moitié anonyme de
        // l'acquisition, celle que 028 a établie. Elle ne porte pas le
        // classement — aucun `SubLevel` — mais elle porte le nom et le
        // `personId`, donc elle ouvre la chaîne.
        {
          intitule: "fiche publique",
          requete: { url: `${RACINE}${fiche}`, jeton: null },
          extraire: (reponse) => (identiteDeLaReponse(reponse) === null ? 0 : 1),
        },

        // Les deux appels qui portent vraiment la donnée. Visiter la fiche ne
        // suffit pas : ses blocs de classement et de résultats sont peuplés
        // par ces fonctions serveur — c'est donc elles que la sonde exerce.
        //
        // L'identifiant vient encore du jeton faute de chaînage dans la sonde,
        // qui ne joue qu'une liste de requêtes connues d'avance ; l'appel, lui,
        // part sans cookie pour le classement, parce que c'est ainsi que la
        // passe de 028 le joue et que sonder autrement ne prouverait rien.
        ...(joueur === null
          ? []
          : ([
              {
                intitule: "classement (action, anonyme)",
                requete: requeteDuClassement(licence, joueur),
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
      // L'identifiant est ignoré : la connexion myffbad est construite avec
      // ma licence, celle du module. Ni deuxième temps ni préalable — myffbad
      // n'a pas de 2FA, et ses actions sont relevées ailleurs (015).
      requete: ({ motDePasse }) => connexion(licence, motDePasse),
      jetonDepuisLesCookies,
    },

    identite: {
      requete: (licenceVisee) => ({ url: `${RACINE}/joueur/${licenceVisee}`, jeton: null }),
      lire: (reponse, licenceVisee) => identiteDuJoueur(reponse, licenceVisee),
    },

    classement: {
      // Sans cookie, et sur la fiche du joueur visé — jamais la mienne : le
      // module est construit avec ma licence pour la connexion et la sonde,
      // mais la passe de 028 le promène sur toute l'équipe.
      requete: (licenceVisee, personId) => requeteDuClassement(licenceVisee, personId),
      lire: (reponse) => classementDuJoueur(reponse),
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
 * Ils vivent ici, relevés le 29 septembre 2026, et nulle part ailleurs. Quand
 * l'un d'eux périme, le serveur répond `404 Server action not found` — panne
 * franche, jamais une liste vide, donc détectable (voir `ActionIntrouvable`).
 * Le `buildId` que porte chaque réponse permet même de le voir venir.
 */
export const BUILD_DES_ACTIONS = "9H-mdx8rUCm0Yx7RbXwqb";

export const ACTIONS = {
  connexion: "404027a3acdeccf7af10522b3c0ef83c50db1a555d",
  classement: "402130d79e01a1af99d4a0a294276979e5077b0fb0",
  resultats: "4012eab2b427a67e7920e51a6eedae9b34735ded64",
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
 * L'appel qui rend le classement d'un joueur — specs 001 et 028.
 *
 * Un seul endroit, parce que la sonde et la passe doivent jouer exactement la
 * même requête : une sonde qui prouverait autre chose que ce qui tourne ne
 * prouverait rien. Et pas de jeton — voir `identiteDuJoueur`.
 */
function requeteDuClassement(licence: Licence, personId: number): Requete {
  return appel({
    action: "classement",
    page: `/joueur/${licence}`,
    arguments: [personId],
    jeton: null,
  });
}

/**
 * L'identifiant interne du joueur, lu dans le jeton — spec 015, dépassée par 028.
 *
 * Les Server Actions ne prennent pas la licence mais un `personId`. On l'a cru
 * réservé au JWT, et 015 en a tiré que le classement exigeait une session : la
 * fiche publique le porte aussi (028), et c'est elle qui l'apporte désormais.
 * Ceci ne sert plus qu'à la sonde, qui joue une liste de requêtes connues
 * d'avance et ne peut donc pas enchaîner la fiche puis l'action.
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
  return objetQuiPorte(lireLaChargeFlight(reponse.contenu), [
    "SimpleSubLevel",
    "DoubleSubLevel",
    "MixteSubLevel",
  ]);
}

/**
 * Le bloc d'identité de la fiche, ou `null` — spec 028.
 *
 * Cherché par forme, comme le classement, mais plus profond : myffbad le rend
 * à l'intérieur de l'élément React qui l'affiche. Les trois clés retenues sont
 * celles qui font l'identité — un bloc qui les porte toutes les trois n'est pas
 * un autre bloc.
 */
export function identiteDeLaReponse(reponse: Reponse): Record<string, unknown> | null {
  return objetQuiPorte(lireLaChargeFlight(reponse.contenu), ["personId", "fullName", "licence"]);
}

/**
 * Qui est derrière une licence — spec 028, deuxième parseur de production.
 *
 * Trois refus, et le troisième est le seul qui compte vraiment :
 *
 * - pas de bloc d'identité : la fiche n'est pas celle qu'on croit, ou myffbad a
 *   déplacé son bloc. Panne franche, comme pour le classement (019) ;
 * - un `personId` ou un nom vide : idem, on ne devine pas ;
 * - **une licence qui n'est pas celle demandée** : là, ce n'est plus un parseur
 *   qui se trompe, c'est une identité qu'on s'apprête à rattacher au mauvais
 *   numéro. Une licence bien formée mais erronée rapporte le nom et le
 *   classement de quelqu'un d'autre, et rien d'autre que ce contrôle ne le dit
 *   avant que la page ne l'affiche.
 */
export function identiteDuJoueur(reponse: Reponse, licence: Licence): Identite {
  const bloc = identiteDeLaReponse(reponse);
  if (bloc === null) {
    throw new IdentiteIllisible(`aucun bloc d'identité sur la fiche de ${licence}`);
  }

  const personId = Number(bloc["personId"]);
  if (!Number.isSafeInteger(personId) || personId <= 0) {
    throw new IdentiteIllisible(`« ${String(bloc["personId"])} » n'est pas un personId (${licence})`);
  }

  const nom = typeof bloc["fullName"] === "string" ? bloc["fullName"].trim() : "";
  if (nom === "") {
    throw new IdentiteIllisible(`la fiche de ${licence} ne porte pas de nom`);
  }

  // Comparée après normalisation des deux côtés : myffbad écrit les licences
  // sur huit chiffres, mais ce contrôle doit porter sur la personne, pas sur
  // une convention d'écriture (028).
  const rendue = normalisee(String(bloc["licence"] ?? ""));
  if (rendue !== licence) {
    throw new IdentiteIllisible(
      `la fiche demandée pour ${licence} a répondu pour ${rendue || "personne"} — le relevé s'arrête là plutôt que d'attribuer ${nom} à ${licence}`,
    );
  }

  return { licence, nom, personId };
}

/** La licence rendue par la fiche, ou la chaîne brute si elle n'en est pas une. */
function normalisee(valeur: string): string {
  try {
    return versLicence(valeur);
  } catch {
    return valeur;
  }
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

/**
 * Les clés que la fiche emploie pour chaque discipline — spec 001.
 *
 * Relevées sur la capture du 1er septembre 2026, pas devinées : la fiche donne
 * trois disciplines, `Simple`, `Double` et `Mixte`, et non les cinq tableaux
 * d'une compétition. Le préfixe est explicite plutôt que calculé, pour que le
 * jour où myffbad renomme une clé, la correction tienne dans cette table.
 */
const PREFIXE: Readonly<Record<Discipline, string>> = {
  simple: "Simple",
  double: "Double",
  mixte: "Mixte",
};

/**
 * Le classement, discipline par discipline — spec 001, premier parseur de
 * production.
 *
 * Deux refus, et ils ne sont pas les mêmes :
 *
 * - la discipline absente de la fiche est **omise**, pas inventée. C'est le
 *   tableau jamais joué, et 001 demande d'afficher ce que la source donne ;
 * - la discipline présente mais illisible **fait échouer la passe**. Une
 *   lettre hors barème ou un CPPH qui n'est pas un nombre est le seul signe
 *   qu'on ait qu'on ne lit plus la bonne chose : la laisser passer servirait
 *   une donnée fausse avec l'aplomb d'une donnée vraie (019).
 */
export function classementDuJoueur(reponse: Reponse): readonly Classement[] {
  const fiche = classementDeLaReponse(reponse);
  if (fiche === null) return [];

  return DISCIPLINES.flatMap((discipline) => {
    const lettre = fiche[`${PREFIXE[discipline]}SubLevel`];
    if (lettre === null || lettre === undefined || lettre === "") return [];

    return [
      {
        discipline,
        lettre: lettreLisible(discipline, lettre),
        cpph: cpphLisible(discipline, fiche[`${PREFIXE[discipline]}Rate`]),
      },
    ];
  });
}

function lettreLisible(discipline: Discipline, valeur: unknown): Lettre {
  if (typeof valeur !== "string" || !estUneLettre(valeur)) {
    throw new ClassementIllisible(`« ${String(valeur)} » n'est pas une lettre du barème (${discipline})`);
  }
  return valeur;
}

/** myffbad rend le CPPH en chaîne — « 936.00 ». C'est un nombre, il le devient ici. */
function cpphLisible(discipline: Discipline, valeur: unknown): number {
  const nombre = typeof valeur === "string" || typeof valeur === "number" ? Number(valeur) : NaN;
  if (!Number.isFinite(nombre)) {
    throw new ClassementIllisible(`« ${String(valeur)} » n'est pas un CPPH (${discipline})`);
  }
  return nombre;
}
