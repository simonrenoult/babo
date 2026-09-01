import { Router } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";

const routeur = Router();

routeur.get("/", (_requete, reponse) => {
  reponse.render("mon-profil", { titre: "Mon profil" });
});

/**
 * Le module `mon-profil` — specs 001 à 004.
 *
 * Vide de métier pour l'instant : son `core` se remplira quand la sonde de 015
 * aura montré à quoi ressemblent un classement et un match réels.
 */
export const moduleMonProfil: ModuleWeb = {
  intitule: "Mon profil",
  chemin: "/mon-profil",
  routeur,
  vues: new URL("vues/", import.meta.url).pathname,
};
