import { Router } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import type { DepotCoequipiers } from "../core/coequipier.ts";
import { listeDeLEquipe } from "../core/coequipier.ts";

/**
 * Le module `capitanat` — specs 005 à 011.
 *
 * Il partage sa source de données avec `mon-profil` sans partager son modèle : un
 * joueur vu d'ici est un coéquipier qu'on aligne (spec 022).
 *
 * Il lit le dépôt et affiche, rien d'autre. L'import, lui, est un geste
 * d'exploitation : il vit sur `/sources`, comme la passe de 001.
 */
export function creerModuleCapitanat(options: {
  readonly coequipiers: DepotCoequipiers;
}): ModuleWeb {
  const { coequipiers } = options;
  const routeur = Router();

  routeur.get("/", (_requete, reponse) => {
    reponse.render("capitanat", { titre: "Capitanat", equipe: listeDeLEquipe(coequipiers) });
  });

  return {
    intitule: "Capitanat",
    chemin: "/capitanat",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
  };
}
