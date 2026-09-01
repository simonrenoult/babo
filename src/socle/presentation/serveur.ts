import express, { type Express, type Router } from "express";
import type { Configuration } from "../core/configuration.ts";
import { routeurSources, type AccesAuxSources } from "./routeur-sources.ts";

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
}): Express {
  const { configuration, modules, etatDuSocle, sources } = options;
  const application = express();
  application.disable("x-powered-by");

  // TLS est terminé en amont : c'est le proxy qui rend le `Secure` du cookie
  // de 021 tenable, et lui qui porte l'adresse réelle du client.
  application.set("trust proxy", configuration.derriereUnProxy);

  application.set("view engine", "ejs");
  application.set("views", [DOSSIER_VUES, ...modules.map((module) => module.vues)]);
  application.locals["modules"] = modules.map(({ intitule, chemin }) => ({ intitule, chemin }));

  application.use(express.urlencoded({ extended: false }));

  // Usage strictement personnel : le `noindex` ne ferme rien par lui-même
  // (c'est le rôle de 021), mais il évite l'indexation (spec 015).
  application.use((_requete, reponse, suite) => {
    reponse.setHeader("X-Robots-Tag", "noindex, nofollow");
    suite();
  });

  // Sonde de vie : c'est par elle que le superviseur constate que le processus
  // répond, et pas seulement qu'il existe (spec 020).
  application.get("/sante", (_requete, reponse) => {
    reponse.json({ statut: "ok", ...etatDuSocle() });
  });

  application.get("/", (_requete, reponse) => {
    reponse.render("accueil", { titre: "Accueil", socle: etatDuSocle() });
  });

  // L'écran des sources est du socle, pas d'une feature : c'est la même
  // session qui sert le classement de `mon-profil` et les tournois de `veille`
  // (spec 015). Il est monté avant les modules, qui n'ont rien à en savoir.
  application.use("/sources", routeurSources(sources));

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
