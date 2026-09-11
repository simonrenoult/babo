import { Router, text, type Response } from "express";
import type { EtatDeLaSource } from "../core/acquisition.ts";
import type { EtatDuDeploiement } from "../core/build.ts";
import type { EtatDuCourrier, MessageDepose } from "../core/courrier.ts";
import type { RapportArchive } from "../core/rapport-execution.ts";
import type { EtatDeLaTache, JourDeLaSemaine, ReglageDeTache } from "../core/ordonnancement.ts";
import type { ResultatDeSonde } from "../core/sonde.ts";
import type { Source } from "../core/source.ts";
import { estUneSource } from "../core/source.ts";
import { TACHE_BATTEMENT } from "../core/battement.ts";

/**
 * Ce que l'écran des sources a besoin de savoir faire — spec 015.
 *
 * Branché dans `main.ts` : la présentation ne connaît ni la base ni le réseau,
 * seulement ces gestes.
 */
export type AccesAuxSources = {
  etats(): readonly EtatDeLaSource[];
  /** Ce qu'on sait des déploiements des sources — la mesure de 015. */
  deploiements(): readonly EtatDuDeploiement[];
  enregistrer(source: Source, valeur: string): void;
  /**
   * Demande à la source d'aller chercher sa propre session — specs 015 et 027.
   *
   * Rend `code-attendu` quand la source a une 2FA et vient d'envoyer un code :
   * l'écran bascule alors sur son second temps. myffbad, qui n'en a pas, rend
   * toujours `ouverte`.
   */
  connecter(source: Source): Promise<"ouverte" | "code-attendu">;
  /** Le second temps : le code reçu par mail, recopié à la main — spec 027. */
  confirmerLeCode(source: Source, code: string): Promise<void>;
  /** Les sources dont un code est attendu, et depuis quand. */
  codesAttendus(): readonly { readonly source: Source; readonly demandeeLe: Date }[];
  /**
   * Combien d'engagements sont en base — spec 002.
   *
   * Un décompte, et non plus la table : depuis 002 la liste vit sur
   * `/mon-profil`, et c'est la frontière que 030 a posée — `/sources` porte
   * l'exploitation, relancer et diagnostiquer ; la feature porte la donnée.
   * Deux écrans qui affichent la même table finissent par en afficher deux
   * versions.
   */
  engagements(): number;
  oublier(source: Source): void;
  sonder(): Promise<readonly ResultatDeSonde[]>;
  /**
   * Déclenche à la main une tâche ordonnancée — spec 037.
   *
   * La même passe, le même chemin qu'un réveil : grâce court-circuitée,
   * échéance clôturée, suivante inscrite, rapport consigné sous l'identifiant
   * de la tâche. Coup unique, sans réessai.
   */
  executerMaintenant(tache: string): Promise<RapportArchive | null>;
  /**
   * Remplace l'équipe par le contenu d'un CSV — spec 005.
   *
   * Le socle ne sait pas ce qu'est un coéquipier et n'a pas à l'apprendre
   * (022) : il reçoit du texte, rend un décompte ou des motifs de refus, et
   * `main.ts` branche le module `capitanat` derrière. Le geste est ici parce
   * que `/sources` est l'écran d'exploitation, celui de la passe de 001.
   *
   * L'import enchaîne une passe complète (028) : on clique, on voit huit noms.
   * C'est aussi ce qui rend une licence fausse visible tout de suite — bien
   * formée mais erronée, elle rapporte le nom de quelqu'un d'autre, et seul le
   * nom affiché le dit.
   */
  importerLEquipe(csv: string): Promise<ResultatDImport>;
  /**
   * Ce que le planificateur a à faire, et quand — spec 018.
   *
   * L'écran d'exploitation est l'endroit : c'est déjà lui qui porte
   * l'ancienneté des sources et le rapport de la dernière passe, et une
   * cadence ne se lit qu'en regard de ce qu'elle a produit.
   */
  ordonnancement(): readonly EtatDeLaTache[];
  /**
   * Change la fréquence ou la grâce d'une tâche. C'est la raison pour laquelle
   * 018 écarte le cron système : les fréquences sont des données, et se
   * corrigent sans redéploiement.
   */
  reglerLaTache(reglage: ReglageDeTache): void;
  /**
   * L'état du courrier — spec 016. File en attente, derniers messages, et si
   * le SMTP est seulement configuré : sans lui les messages s'empilent sans
   * partir, et rien d'autre que cet écran ne le dirait.
   */
  courrier(): EtatDuCourrier;
  /**
   * L'historique des exécutions — spec 019.
   *
   * Par mail seul, on ne voit que les échecs et jamais la semaine qui s'est
   * bien passée : c'est cette liste qui distingue « rien ne s'est cassé » de
   * « plus rien ne tourne ».
   */
  rapports(): readonly RapportArchive[];
  /**
   * Dépose un mail de test, par le chemin normal.
   *
   * Un bouton qui emprunterait un autre chemin que celui qu'il prétend
   * vérifier pourrait réussir pendant que le vrai chemin est cassé. Sans lui,
   * on découvrirait un mot de passe d'application faux au moment de la
   * première panne — c'est-à-dire au pire moment.
   */
  envoyerUnMailDeTest(): Promise<MessageDepose>;
};

/**
 * Ce que l'écran dit d'un import — spec 005.
 *
 * Tout ou rien : une équipe entièrement remplacée, ou rien d'écrit et la liste
 * des anomalies, chacune avec sa ligne. Pas d'état intermédiaire, donc pas
 * d'import partiel à défaire à la main.
 */
export type ResultatDImport =
  | {
      readonly issue: "importee";
      readonly membres: number;
      /** Le rapport de la passe enchaînée (028). `null` si elle n'a pas pu partir. */
      readonly releve: RapportArchive | null;
    }
  | { readonly issue: "refusee"; readonly motifs: readonly MotifDeRefus[] };

export type MotifDeRefus = {
  /** Ligne du fichier, en-tête comprise. `null` quand c'est le fichier entier. */
  readonly ligne: number | null;
  readonly raison: string;
};

/**
 * L'écran de réauthentification — spec 015.
 *
 * « Quand la session myffbad tombe, le scraper s'arrête, le signale par mail,
 * et attend une réauthentification depuis l'interface. » C'est cet écran.
 *
 * L'écran n'y renouvelle rien : il recopie la session que l'humain est allé
 * chercher dans son navigateur. Pour badnet, c'est définitif — une 2FA garde
 * la porte. Pour myffbad, qui n'en a pas, c'est provisoire : sa connexion est
 * probablement automatisable, et le jour où elle le sera cet écran ne servira
 * plus qu'à dépanner.
 */
export function routeurSources(acces: AccesAuxSources): Router {
  const routeur = Router();

  const ecran = (
    reponse: Response,
    vue: {
      sonde?: readonly ResultatDeSonde[] | null;
      declenchement?: RapportArchive | null;
      equipe?: ResultatDImport | null;
      mailDeTest?: MessageDepose | null;
      connexion?: { readonly source: Source; readonly issue: string } | null;
    },
  ): void => {
    reponse.render("sources", {
      titre: "Sources",
      etats: acces.etats(),
      deploiements: acces.deploiements(),
      taches: acces.ordonnancement(),
      rapports: acces.rapports(),
      // Le battement ne porte pas de bouton : passé au tableau pour que la
      // vue ne reçoive pas la règle en dur (spec 037).
      battement: TACHE_BATTEMENT,
      // Relu après le geste, jamais avant : un mail de test déposé doit
      // apparaître dans la file du même écran que le bouton qui l'a déposé.
      courrier: acces.courrier(),
      sonde: vue.sonde ?? null,
      declenchement: vue.declenchement ?? null,
      equipe: vue.equipe ?? null,
      mailDeTest: vue.mailDeTest ?? null,
      engagementsEnBase: acces.engagements(),
      connexion: vue.connexion ?? null,
      codesAttendus: acces.codesAttendus(),
    });
  };

  routeur.get("/", (_requete, reponse) => ecran(reponse, {}));

  routeur.post("/sonde", (_requete, reponse, suite) => {
    acces
      .sonder()
      .then((sonde) => ecran(reponse, { sonde }))
      .catch(suite);
  });

  /**
   * Le mail de test — spec 016.
   *
   * Il passe par la boîte d'envoi : écrit en base, puis remis tout de suite si
   * le SMTP est configuré. L'écran rend le message tel qu'il est ressorti de la
   * file, donc son état dit ce qui s'est réellement produit.
   */
  routeur.post("/courrier", (_requete, reponse, suite) => {
    acces
      .envoyerUnMailDeTest()
      .then((mailDeTest) => ecran(reponse, { mailDeTest }))
      .catch(suite);
  });

  routeur.post("/ordonnancement/:tache/executer", (_requete, reponse, suite) => {
    const tache = _requete.params.tache;

    // La cible se juge sur le tableau d'ordonnancement, la seule vue que le
    // port expose des tâches déclarées : inconnue → 404, non déclenchable →
    // 400. Un appel direct à la route ne doit jamais faire tourner une passe
    // qui ne devrait pas tourner (spec 037).
    const etat = acces.ordonnancement().find((candidate) => candidate.tache === tache);
    if (etat === undefined) {
      return rendreTacheInconnue(reponse, tache);
    }
    if (tache === TACHE_BATTEMENT) {
      return rendreTacheNonDeclenchable(
        reponse,
        tache,
        "C'est le battement hebdomadaire : son silence est précisément l'information qu'il préserve (019).",
      );
    }
    if (!etat.reglage.active) {
      return rendreTacheNonDeclenchable(reponse, tache, "La tâche est suspendue (case « active » décochée).");
    }
    if (etat.reglage.cadence.nature === "ponctuelle") {
      return rendreTacheNonDeclenchable(
        reponse,
        tache,
        "Une échéance ponctuelle se déclenche à son échéance, pas à la main — un rappel J-1 envoyé à J+2 est pire qu'un rappel manquant (014).",
      );
    }

    acces
      .executerMaintenant(tache)
      .then((declenchement) => ecran(reponse, { declenchement }))
      .catch(suite);
  });

  /**
   * L'import de l'équipe — spec 005.
   *
   * Le corps arrive en `text/csv` par dix lignes de JS, pas en multipart :
   * Express ne sait pas lire le multipart, et ajouter `multer` pour un import
   * annuel de huit lignes irait contre l'exigence qui a fait refuser 300 Mo de
   * navigateur sans écran à 015. Le fichier, lui, n'atterrit jamais sur le
   * serveur — seul son contenu passe.
   *
   * Le plafond est là pour qu'un fichier de dix mille lignes déposé par
   * mégarde soit refusé par la porte, pas par la mémoire.
   */
  routeur.post("/equipe", text({ type: "text/csv", limit: "64kb" }), (requete, reponse, suite) => {
    acces
      .importerLEquipe(typeof requete.body === "string" ? requete.body : "")
      .then((resultat) => {
        // 400 sur un refus : l'écran le dit, et le journal du proxy aussi.
        reponse.status(resultat.issue === "refusee" ? 400 : 200);
        ecran(reponse, { equipe: resultat });
      })
      .catch(suite);
  });

  /**
   * Le réglage d'une tâche — spec 018.
   *
   * Une seule route pour la cadence et pour la grâce : ce sont les deux
   * moitiés d'une même décision, « quand » et « jusqu'à quand ça vaut encore la
   * peine ». Les changer replanifie ce qui n'a pas encore tourné.
   */
  routeur.post("/ordonnancement", (requete, reponse) => {
    const reglage = lireLeReglage(requete.body);
    if (reglage === null) {
      return reponse.status(400).render("erreur", {
        titre: "Réglage refusé",
        message:
          "Cadence incomplète ou hors bornes. L'heure va de 0 à 23, la minute de 0 à 59, le jour de 1 (lundi) à 7 (dimanche), et la grâce est un nombre de minutes positif.",
      });
    }

    acces.reglerLaTache(reglage);
    reponse.redirect("/sources");
  });

  routeur.post("/:source/jeton", (requete, reponse) => {
    const source = requete.params.source;
    if (!estUneSource(source)) return rendreInconnue(reponse, source);

    const valeur = String(requete.body?.["valeur"] ?? "").trim();
    if (valeur === "") {
      return reponse.status(400).render("erreur", {
        titre: "Jeton vide",
        message: "Coller le cookie de session tel que le navigateur l'affiche, en-tête `Cookie` comprise.",
      });
    }

    acces.enregistrer(source, valeur);
    reponse.redirect("/sources");
  });

  /**
   * Le premier temps de la connexion — specs 015 et 027.
   *
   * **On ne redirige jamais, dans un cas comme dans l'autre.** Une redirection
   * muette laisse chercher un champ de code qui n'existe pas, ou croire que
   * rien n'a eu lieu : c'est ce qui s'est produit au premier essai réel, le
   * 4 septembre 2026, quand badnet a ouvert la session sans réclamer de code.
   * L'écran dit désormais laquelle des deux voies a été prise.
   */
  routeur.post("/:source/connexion", (requete, reponse, suite) => {
    const source = requete.params.source;
    if (!estUneSource(source)) return rendreInconnue(reponse, source);

    acces
      .connecter(source)
      .then((issue) => ecran(reponse, { connexion: { source, issue } }))
      .catch(suite);
  });

  /** Le second temps : le code reçu par mail — spec 027. */
  routeur.post("/:source/code", (requete, reponse, suite) => {
    const source = requete.params.source;
    if (!estUneSource(source)) return rendreInconnue(reponse, source);

    const code = String(requete.body?.["code"] ?? "").trim();
    if (code === "") {
      return reponse.status(400).render("erreur", {
        titre: "Code vide",
        message: "Recopier le code de vérification reçu par mail.",
      });
    }

    acces
      .confirmerLeCode(source, code)
      .then(() => reponse.redirect("/sources"))
      .catch(suite);
  });

  routeur.post("/:source/oubli", (requete, reponse) => {
    const source = requete.params.source;
    if (!estUneSource(source)) return rendreInconnue(reponse, source);

    acces.oublier(source);
    reponse.redirect("/sources");
  });

  return routeur;
}

function rendreInconnue(reponse: Response, source: string): void {
  reponse.status(404).render("erreur", {
    titre: "Source inconnue",
    message: `« ${source} » n'est pas une source connue. Babo n'en connaît que deux : myffbad et badnet (spec 015).`,
  });
}

function rendreTacheInconnue(reponse: Response, tache: string): void {
  reponse.status(404).render("erreur", {
    titre: "Tâche inconnue",
    message: `« ${tache} » n'est pas une tâche ordonnancée. Rien n'a été exécuté.`,
  });
}

function rendreTacheNonDeclenchable(reponse: Response, tache: string, raison: string): void {
  reponse.status(400).render("erreur", {
    titre: "Tâche non déclenchable",
    message: `« ${tache} » ne se déclenche pas à la main. ${raison}`,
  });
}

/**
 * Le formulaire de réglage, relu — spec 018.
 *
 * Tout ou rien, comme l'import de 005 : une cadence à moitié valide n'est pas
 * une cadence, et l'écrire ferait tourner une passe à une heure que personne
 * n'a demandée.
 */
function lireLeReglage(corps: unknown): ReglageDeTache | null {
  const champs = (corps ?? {}) as Record<string, unknown>;
  const tache = String(champs["tache"] ?? "").trim();
  const nature = String(champs["nature"] ?? "");
  const grace = entier(champs["grace"], 0, 60 * 24 * 30);
  if (tache === "" || grace === null) return null;

  const active = champs["active"] === "on" || champs["active"] === "true";

  if (nature === "ponctuelle") {
    return { tache, cadence: { nature: "ponctuelle" }, graceMinutes: grace, active };
  }

  const heure = entier(champs["heure"], 0, 23);
  const minute = entier(champs["minute"], 0, 59);
  if (heure === null || minute === null) return null;

  if (nature === "quotidienne") {
    return { tache, cadence: { nature: "quotidienne", heure, minute }, graceMinutes: grace, active };
  }

  if (nature !== "hebdomadaire") return null;
  const jour = entier(champs["jour"], 1, 7);
  if (jour === null) return null;

  return {
    tache,
    cadence: { nature: "hebdomadaire", jour: jour as JourDeLaSemaine, heure, minute },
    graceMinutes: grace,
    active,
  };
}

function entier(valeur: unknown, minimum: number, maximum: number): number | null {
  const nombre = Number(String(valeur ?? "").trim());
  if (!Number.isInteger(nombre) || nombre < minimum || nombre > maximum) return null;
  return nombre;
}
