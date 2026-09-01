import { Router } from "express";
import type { DepotClassements } from "../../socle/core/classement.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import { monClassement } from "../core/classement.ts";

/**
 * Le module `mon-profil` — specs 001 à 004.
 *
 * Il lit le dépôt et affiche, rien d'autre : aucune feature ne parle à myffbad
 * (spec 022). Le classement y arrive par une passe d'acquisition du socle, que
 * 018 déclenchera chaque jour.
 */
export function creerModuleMonProfil(options: {
  readonly licence: Licence;
  readonly classements: DepotClassements;
}): ModuleWeb {
  const { licence, classements } = options;
  const routeur = Router();

  routeur.get("/", (_requete, reponse) => {
    reponse.render("mon-profil", {
      titre: "Mon profil",
      classement: monClassement(licence, classements),
    });
  });

  return {
    intitule: "Mon profil",
    chemin: "/mon-profil",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
  };
}
