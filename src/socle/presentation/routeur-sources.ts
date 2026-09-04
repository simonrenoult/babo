import { Router, text, type Response } from "express";
import type { EtatDeLaSource } from "../core/acquisition.ts";
import type { EtatDuDeploiement } from "../core/build.ts";
import type { EtatDuCourrier, MessageDepose } from "../core/courrier.ts";
import type { RapportArchive } from "../core/rapport-execution.ts";
import type { EtatDeLaTache, JourDeLaSemaine, ReglageDeTache } from "../core/ordonnancement.ts";
import type { ResultatDeSonde } from "../core/sonde.ts";
import type { Source } from "../core/source.ts";
import { estUneSource } from "../core/source.ts";

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
   * Demande à la source d'aller chercher sa propre session. Absente de la
   * liste rendue par `etats` quand la source ne sait pas faire, ou quand le
   * mot de passe n'est pas configuré.
   */
  connecter(source: Source): Promise<void>;
  oublier(source: Source): void;
  sonder(): Promise<readonly ResultatDeSonde[]>;
  /**
   * Lance la passe qui relève noms et classements — specs 001 et 028.
   *
   * Une seule passe, pour moi et pour l'équipe : nous sommes tous dans la même
   * liste, et deux passes auraient produit deux dates affichées.
   *
   * Ici et non sur `/mon-profil` : 001 écarte le bouton « rafraîchir
   * maintenant », qui mettrait le plafond d'un passage par jour entre les
   * mains de l'utilisateur. Celui-ci est sur l'écran d'exploitation, il sert à
   * constater une passe réelle à la mise en service. Depuis
   * [[018__ordonnancement]], le planificateur déclenche la même passe chaque
   * vendredi à 1 h : ce bouton ne sert plus qu'au dépannage.
   */
  relever(): Promise<RapportArchive>;
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
      passe?: RapportArchive | null;
      equipe?: ResultatDImport | null;
      mailDeTest?: MessageDepose | null;
    },
  ): void => {
    reponse.render("sources", {
      titre: "Sources",
      etats: acces.etats(),
      deploiements: acces.deploiements(),
      taches: acces.ordonnancement(),
      // Relu après le geste, jamais avant : un mail de test déposé doit
      // apparaître dans la file du même écran que le bouton qui l'a déposé.
      courrier: acces.courrier(),
      sonde: vue.sonde ?? null,
      passe: vue.passe ?? null,
      equipe: vue.equipe ?? null,
      mailDeTest: vue.mailDeTest ?? null,
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

  routeur.post("/classement", (_requete, reponse, suite) => {
    acces
      .relever()
      .then((passe) => ecran(reponse, { passe }))
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

  routeur.post("/:source/connexion", (requete, reponse, suite) => {
    const source = requete.params.source;
    if (!estUneSource(source)) return rendreInconnue(reponse, source);

    acces
      .connecter(source)
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
    message: `« ${source} » n'est pas une source connue. Bado n'en connaît que deux : myffbad et badnet (spec 015).`,
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
