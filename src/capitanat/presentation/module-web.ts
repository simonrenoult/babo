import { Router } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import type { DepotClassements } from "../../socle/core/classement.ts";
import type { DepotIdentites } from "../../socle/core/identite.ts";
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
  /** Noms et classements : relevés par le socle (028), lus ici, jamais demandés à myffbad. */
  readonly identites: DepotIdentites;
  readonly classements: DepotClassements;
}): ModuleWeb {
  const { coequipiers, identites, classements } = options;
  const routeur = Router();

  routeur.get("/", (_requete, reponse) => {
    reponse.render("capitanat", {
      titre: "Capitanat",
      equipe: listeDeLEquipe(coequipiers, identites, classements),
    });
  });

  return {
    intitule: "Capitanat",
    chemin: "/capitanat",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
  };
}
