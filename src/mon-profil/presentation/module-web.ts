import { Router } from "express";
import type { DepotClassements } from "../../socle/core/classement.ts";
import type { Fraicheur } from "../../socle/core/fraicheur.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import { monClassement } from "../core/classement.ts";

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
}): ModuleWeb {
  const { licence, classements, fraicheur } = options;
  const routeur = Router();

  routeur.get("/", (_requete, reponse) => {
    const classement = monClassement(licence, classements);
    reponse.render("mon-profil", {
      titre: "Mon profil",
      classement,
      fraicheur: fraicheur(classement.vuLe),
    });
  });

  return {
    intitule: "Mon profil",
    chemin: "/mon-profil",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
  };
}
