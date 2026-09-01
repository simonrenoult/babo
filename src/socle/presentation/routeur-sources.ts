import { Router, type Response } from "express";
import type { EtatDeLaSource } from "../core/acquisition.ts";
import type { EtatDuDeploiement } from "../core/build.ts";
import type { RapportArchive } from "../core/rapport-execution.ts";
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
   * Lance la passe qui relève le classement — spec 001.
   *
   * Ici et non sur `/mon-profil` : 001 écarte le bouton « rafraîchir
   * maintenant », qui mettrait le plafond d'un passage par jour entre les
   * mains de l'utilisateur. Celui-ci est sur l'écran d'exploitation, il sert à
   * constater une passe réelle à la mise en service, et [[018__ordonnancement]]
   * le rend inutile en déclenchant la même passe chaque vendredi à 1 h.
   */
  relever(): Promise<RapportArchive>;
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
    vue: { sonde?: readonly ResultatDeSonde[] | null; passe?: RapportArchive | null },
  ): void => {
    reponse.render("sources", {
      titre: "Sources",
      etats: acces.etats(),
      deploiements: acces.deploiements(),
      sonde: vue.sonde ?? null,
      passe: vue.passe ?? null,
    });
  };

  routeur.get("/", (_requete, reponse) => ecran(reponse, {}));

  routeur.post("/sonde", (_requete, reponse, suite) => {
    acces
      .sonder()
      .then((sonde) => ecran(reponse, { sonde }))
      .catch(suite);
  });

  routeur.post("/classement", (_requete, reponse, suite) => {
    acces
      .relever()
      .then((passe) => ecran(reponse, { passe }))
      .catch(suite);
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
