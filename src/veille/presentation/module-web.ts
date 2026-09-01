import { Router } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";

const routeur = Router();

routeur.get("/", (_requete, reponse) => {
  reponse.render("veille", { titre: "Veille de tournois" });
});

/**
 * Le module `veille` — specs 012 à 014.
 *
 * Il ne parlera jamais à badnet : l'acquisition est un adaptateur en amont, la
 * veille lit la base (spec 022).
 */
export const moduleVeille: ModuleWeb = {
  intitule: "Veille",
  chemin: "/veille",
  routeur,
  vues: new URL("vues/", import.meta.url).pathname,
};
