import { Router } from "express";
import type { DepotClassements } from "../../socle/core/classement.ts";
import type { DepotEngagements } from "../../socle/core/engagement.ts";
import type { DepotTournois } from "../../socle/core/tournoi.ts";
import type { Fraicheur } from "../../socle/core/fraicheur.ts";
import type { Horloge } from "../../socle/core/horloge.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import { monClassement } from "../core/classement.ts";
import { intituleDeLEngagement, prochainsTournois } from "../core/prochains-tournois.ts";

/**
 * Le module `mon-profil` — specs 001 à 004.
 *
 * Il lit le dépôt et affiche, rien d'autre : aucune feature ne parle à myffbad
 * (spec 022). Le classement y arrive par une passe d'acquisition du socle, que
 * 018 déclenche chaque vendredi à 1 h du matin.
 */
export function creerModuleMonProfil(options: {
  readonly licence: Licence;
  readonly classements: DepotClassements;
  /**
   * L'ancienneté de la donnée, jugée sur la cadence de la passe qui l'alimente
   * — spec 019. Reçue en argument plutôt qu'en port : le seuil vit dans les
   * réglages du planificateur (018), et le point de composition est l'endroit
   * désigné pour brancher le socle sur une feature (022).
   */
  readonly fraicheur: (vuLe: Date | null) => Fraicheur;
  /** Mes engagements de tournoi, écrits par la passe badnet de 027 — spec 002. */
  readonly engagements: DepotEngagements;
  /** Les lieux et les journées, relevés en anonyme sur la fiche publique — 002. */
  readonly tournois: DepotTournois;
  /**
   * L'ancienneté des engagements, jugée sur la cadence de *leur* passe — 019.
   *
   * Une seconde fonction, et non la première réutilisée : les deux passes
   * tombent indépendamment, et 019 interdit nommément l'ancienneté globale. Le
   * classement peut être frais pendant que badnet est muet depuis trois
   * semaines, et la page doit pouvoir le dire de chaque section.
   *
   * Elle se juge sur le dernier **succès** de la passe et non sur sa dernière
   * ligne écrite : un remplacement intégral peut aboutir à zéro engagement en
   * intersaison, et la date disparaîtrait avec les lignes.
   */
  readonly fraicheurDesEngagements: () => Fraicheur;
  readonly horloge: Horloge;
}): ModuleWeb {
  const { licence, classements, fraicheur, engagements, tournois, fraicheurDesEngagements, horloge } =
    options;
  const routeur = Router();

  routeur.get("/", (_requete, reponse) => {
    const classement = monClassement(licence, classements);
    reponse.render("mon-profil", {
      titre: "Mon profil",
      classement,
      fraicheur: fraicheur(classement.vuLe),
      tournois: prochainsTournois(engagements, tournois, horloge.maintenant()),
      // Les passés ne s'affichent pas, mais leur existence explique une liste
      // vide en fin de saison : « rien à venir » et « rien du tout » ne sont
      // pas le même message.
      engagementsConnus: engagements.compter(),
      fraicheurDesEngagements: fraicheurDesEngagements(),
      intituleDeLEngagement,
    });
  });

  return {
    intitule: "Mon profil",
    chemin: "/mon-profil",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
    // Sur l'accueil : mes lettres, et le prochain tournoi où je suis engagé.
    apercu: () => {
      const aVenir = prochainsTournois(engagements, tournois, horloge.maintenant());
      return {
        vue: "mon-profil-apercu",
        donnees: {
          classement: monClassement(licence, classements),
          prochain: aVenir[0] ?? null,
          ensuite: aVenir.length - 1,
          intituleDeLEngagement,
        },
      };
    },
  };
}
