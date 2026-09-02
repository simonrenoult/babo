import { Router } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import type { DepotClassements } from "../../socle/core/classement.ts";
import type { DepotIdentites } from "../../socle/core/identite.ts";
import { estUnTableau } from "../../socle/core/tableau.ts";
import type { DepotCoequipiers } from "../core/coequipier.ts";
import { listeDeLEquipe } from "../core/coequipier.ts";
import { forceDuTableau, forcesParTableau } from "../core/forces-par-tableau.ts";
import { enJoueurs, joueursRequis } from "./mots.ts";

/**
 * Le module `capitanat` — specs 005 à 011.
 *
 * Il partage sa source de données avec `mon-profil` sans partager son modèle : un
 * joueur vu d'ici est un coéquipier qu'on aligne (spec 022).
 *
 * Il lit le dépôt et affiche, rien d'autre. L'import, lui, est un geste
 * d'exploitation : il vit sur `/sources`, comme la passe de 001.
 *
 * Depuis 029, `/capitanat` est devenu un index : l'équipe y reste, et cinq
 * pages s'ouvrent sous `/capitanat/tableau/…`. Une page par tableau, parce
 * qu'on consulte un tableau à la fois, que chacun est une URL qu'on met en
 * favori, et qu'une page unique à cinq sections ferait défiler le DH pour
 * atteindre le DD.
 */
export function creerModuleCapitanat(options: {
  readonly coequipiers: DepotCoequipiers;
  /** Noms et classements : relevés par le socle (028), lus ici, jamais demandés à myffbad. */
  readonly identites: DepotIdentites;
  readonly classements: DepotClassements;
}): ModuleWeb {
  const { coequipiers, identites, classements } = options;
  const routeur = Router();

  const equipe = () => listeDeLEquipe(coequipiers, identites, classements);

  routeur.get("/", (_requete, reponse) => {
    const membres = equipe();
    reponse.render("capitanat", {
      titre: "Capitanat",
      equipe: membres,
      forces: forcesParTableau(membres),
      enJoueurs,
      joueursRequis,
    });
  });

  routeur.get("/tableau/:tableau", (requete, reponse, suite) => {
    // Une URL qu'on met en favori se retape aussi à la main, en minuscules
    // aussi souvent qu'autrement. Ce qui n'est pas un tableau, en revanche,
    // passe au 404 du socle plutôt que de rendre une page vide de sens.
    const demande = (requete.params["tableau"] ?? "").toUpperCase();
    if (!estUnTableau(demande)) return suite();

    const force = forceDuTableau(equipe(), demande);
    reponse.render("capitanat-tableau", { titre: force.intitule, force, enJoueurs, joueursRequis });
  });

  return {
    intitule: "Capitanat",
    chemin: "/capitanat",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
  };
}
