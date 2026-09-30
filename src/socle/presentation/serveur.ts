import express, { type Express, type Router } from "express";
import type { Configuration } from "../core/configuration.ts";
import { CHEMIN_DES_PARAMETRES, routeurSources, type AccesAuxSources } from "./routeur-sources.ts";
import { garde, routeurConnexion } from "./routeur-connexion.ts";
import type { Authentification } from "../core/authentification.ts";
import type { EtatDeLaSource } from "../core/acquisition.ts";
import { heure } from "./format.ts";

/**
 * Un module de feature branché sur l'interface.
 *
 * Le socle ne connaît aucune feature (spec 022) : il sait seulement monter ce
 * qu'on lui donne. C'est `main.ts`, hors des modules, qui décide lesquelles.
 */
export type ModuleWeb = {
  readonly intitule: string;
  readonly chemin: string;
  readonly routeur: Router;
  /** Dossier des vues du module, ajouté aux racines connues du moteur. */
  readonly vues: string;
  /**
   * Ce que le module montre sur l'accueil : une vue partielle à lui, et ce
   * qu'elle affiche. L'accueil ne sait pas ce qu'il y a dedans — il pose une
   * tuile par module et lui laisse la parole, comme le menu lui laisse son
   * intitulé (022). Absent : le module n'a rien à dire d'un coup d'œil.
   */
  readonly apercu?: () => Apercu;
};

export type Apercu = {
  /** Le nom d'une vue du module, rendue dans la tuile. */
  readonly vue: string;
  readonly donnees: Readonly<Record<string, unknown>>;
};

export type EtatDuSocle = {
  readonly tailleDeLaBase: number;
  readonly captures: number;
};

const DOSSIER_VUES = new URL("vues/", import.meta.url).pathname;

/**
 * Construit l'application Express — spec 020.
 *
 * Rendu côté serveur, pas de client riche ni d'API publique : l'interface
 * affiche des tableaux, saisit des critères et rafraîchit l'auth myffbad.
 */
export function creerApplication(options: {
  readonly configuration: Configuration;
  readonly modules: readonly ModuleWeb[];
  readonly etatDuSocle: () => EtatDuSocle;
  readonly sources: AccesAuxSources;
  /** La porte — spec 021. Sans elle, rien de tout cela ne doit être joignable. */
  readonly authentification: Authentification;
}): Express {
  const { configuration, modules, etatDuSocle, sources, authentification } = options;
  const application = express();
  application.disable("x-powered-by");

  // TLS est terminé en amont : c'est le proxy qui rend le `Secure` du cookie
  // de 021 tenable, et lui qui porte l'adresse réelle du client.
  application.set("trust proxy", configuration.derriereUnProxy);

  application.set("view engine", "ejs");
  application.set("views", [DOSSIER_VUES, ...modules.map((module) => module.vues)]);
  // Le format de l'heure, le même pour toutes les vues, modules compris.
  application.locals["heure"] = heure;
  application.locals["modules"] = modules.map(({ intitule, chemin }) => ({ intitule, chemin }));
  const apercus = modules.filter((module) => module.apercu !== undefined);

  application.use(express.urlencoded({ extended: false }));

  // Usage strictement personnel : le `noindex` ne ferme rien par lui-même
  // (c'est le rôle de 021), mais il évite l'indexation (spec 015).
  application.use((requete, reponse, suite) => {
    reponse.setHeader("X-Robots-Tag", "noindex, nofollow");
    // Le menu marque l'entrée où l'on se trouve : il lit le chemin ici plutôt
    // que chaque routeur ne le lui passe.
    reponse.locals["chemin"] = requete.path;
    suite();
  });

  // La feuille de style et le script, seules choses servies avant le garde :
  // la page de connexion en a besoin, et ils ne disent rien de ce qu'il y a
  // derrière. Deux fichiers nommés, pas un dossier statique, pour que ce qui
  // répond sans jeton reste une liste qu'on relit d'un coup d'œil (021).
  // `no-cache` : revalidés à chaque page d'un 304, jamais périmés après un
  // déploiement.
  for (const fichier of ["babo.css", "babo.js"]) {
    application.get(`/${fichier}`, (_requete, reponse) => {
      reponse.sendFile(new URL(`statique/${fichier}`, import.meta.url).pathname, {
        headers: { "Cache-Control": "no-cache" },
      });
    });
  }

  // Le garde passe avant tout le reste : c'est lui qui décide ce qui répond
  // sans jeton, et il n'ouvre que `/connexion` et `/sante` (spec 021). Monté
  // ici, aucune route ajoutée plus bas ne peut l'oublier.
  application.use(garde(authentification, configuration.derriereUnProxy));
  application.use("/connexion", routeurConnexion(authentification, configuration.derriereUnProxy));

  // Sonde de vie : c'est par elle que le superviseur constate que le processus
  // répond, et pas seulement qu'il existe (spec 020). Ouverte, parce que le
  // superviseur n'a pas de session — mais réduite à un mot tant qu'on n'est
  // pas entré : la taille de la base et le nombre de captures ne regardent
  // personne d'autre (021).
  application.get("/sante", (_requete, reponse) => {
    if (reponse.locals["authentifie"] !== true) return reponse.json({ statut: "ok" });
    reponse.json({ statut: "ok", ...etatDuSocle() });
  });

  // Un tableau de bord : ce que chaque module a d'important à dire, et une
  // ligne sur les sources qui ne se fait remarquer que quand l'une est en panne.
  application.get("/", (_requete, reponse) => {
    reponse.render("accueil", {
      titre: "Accueil",
      tuiles: apercus.map((module) => ({ intitule: module.intitule, chemin: module.chemin, ...module.apercu?.() })),
      pannes: pannesDesSources(sources.etats()),
      socle: etatDuSocle(),
    });
  });

  // L'écran des paramètres est du socle, pas d'une feature : c'est la même
  // session qui sert le classement de `mon-profil` et les tournois de `veille`
  // (spec 015). Il est monté avant les modules, qui n'ont rien à en savoir.
  application.use(CHEMIN_DES_PARAMETRES, routeurSources(sources));
  // L'ancienne adresse, que citent les mails d'alerte déjà partis et les
  // specs closes : elle mène toujours quelque part.
  application.get("/sources", (_requete, reponse) => reponse.redirect(CHEMIN_DES_PARAMETRES));

  for (const module of modules) {
    application.use(module.chemin, module.routeur);
  }

  application.use((_requete, reponse) => {
    reponse.status(404).render("erreur", { titre: "Page inconnue", message: "Page inconnue." });
  });

  application.use(
    (
      erreur: Error,
      _requete: express.Request,
      reponse: express.Response,
      _suite: express.NextFunction,
    ) => {
      console.error("[socle] erreur non rattrapée", erreur);
      reponse.status(500).render("erreur", {
        titre: "Erreur",
        message: "L'application a rencontré une erreur. Le détail est dans le journal du service.",
      });
    },
  );

  return application;
}

/**
 * Ce qui, dans l'état des sources, demande un geste — en une phrase chacun.
 *
 * Une session absente n'en fait pas partie : myffbad se lit à froid, et une
 * source qu'on n'a jamais configurée n'est pas en panne. Une session expirée
 * que la source sait rouvrir seule non plus : la passe suivante s'en charge.
 */
export function pannesDesSources(etats: readonly EtatDeLaSource[]): readonly string[] {
  return etats.flatMap((etat) => {
    const pannes: string[] = [];
    if (etat.derniereIssue === "echec") pannes.push(`${etat.source} : la dernière passe a échoué`);
    if (etat.derniereIssue === "vide") pannes.push(`${etat.source} : la dernière passe n'a rien rendu`);
    if (etat.session === "expiree" && !etat.autonome) pannes.push(`${etat.source} : session expirée`);
    return pannes;
  });
}
