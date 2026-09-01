import { Router } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";

const routeur = Router();

routeur.get("/", (_requete, reponse) => {
  reponse.render("capitanat", { titre: "Capitanat" });
});

/**
 * Le module `capitanat` — specs 005 à 011.
 *
 * Il partage sa source de données avec `mon-profil` sans partager son modèle : un
 * joueur vu d'ici est un coéquipier qu'on aligne (spec 022).
 */
export const moduleCapitanat: ModuleWeb = {
  intitule: "Capitanat",
  chemin: "/capitanat",
  routeur,
  vues: new URL("vues/", import.meta.url).pathname,
};
