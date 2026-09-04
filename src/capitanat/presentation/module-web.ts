import { Router, type Response } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import type { DepotClassements } from "../../socle/core/classement.ts";
import type { Horloge } from "../../socle/core/horloge.ts";
import type { Fraicheur } from "../../socle/core/fraicheur.ts";
import type { DepotIdentites } from "../../socle/core/identite.ts";
import type { Licence } from "../../socle/core/licence.ts";
import { estUnTableau, type Tableau } from "../../socle/core/tableau.ts";
import type { DepotCoequipiers } from "../core/coequipier.ts";
import { listeDeLEquipe } from "../core/coequipier.ts";
import { forceDuTableau, forcesParTableau } from "../core/forces-par-tableau.ts";
import type { DepotPreferences } from "../core/paires.ts";
import { PaireRefusee, seJoueEnPaires, tableauDuCapitaine, verifierLaPaire } from "../core/paires.ts";
import { enJoueurs, joueursRequis } from "./mots.ts";

/**
 * Le module `capitanat` — specs 005 à 011.
 *
 * Il partage sa source de données avec `mon-profil` sans partager son modèle : un
 * joueur vu d'ici est un coéquipier qu'on aligne (spec 022).
 *
 * Depuis 029, `/capitanat` est un index : l'équipe y reste, et cinq pages
 * s'ouvrent sous `/capitanat/tableau/…`. Une page par tableau, parce qu'on
 * consulte un tableau à la fois, que chacun est une URL qu'on met en favori, et
 * qu'une page unique à cinq sections ferait défiler le DH pour atteindre le DD.
 *
 * **030 y ajoute les premières écritures de la feature.** Jusqu'ici ce module
 * lisait et affichait, tout geste d'écriture vivant sur `/sources`. La
 * frontière n'a pas bougé pour autant : `/sources` porte l'exploitation —
 * charger un fichier, relancer une passe —, alors que saisir une paire et
 * marquer ce qu'on privilégie *est* la feature. Le mettre sur l'écran
 * d'exploitation aurait séparé la décision de ce qu'elle éclaire.
 *
 * Les formulaires n'ont pas de jeton anti-CSRF : le cookie de session est
 * `SameSite=Strict` (021), ce qui les couvre tous.
 */
export function creerModuleCapitanat(options: {
  readonly coequipiers: DepotCoequipiers;
  /** Noms et classements : relevés par le socle (028), lus ici, jamais demandés à myffbad. */
  readonly identites: DepotIdentites;
  readonly classements: DepotClassements;
  /** Les paires et les marques du capitaine — spec 030. */
  readonly preferences: DepotPreferences;
  /** L'ancienneté des classements, jugée sur la cadence de leur passe — spec 019. */
  readonly fraicheur: (vuLe: Date | null) => Fraicheur;
  readonly horloge: Horloge;
}): ModuleWeb {
  const { coequipiers, identites, classements, preferences, fraicheur, horloge } = options;
  const routeur = Router();

  const equipe = () => listeDeLEquipe(coequipiers, identites, classements);

  routeur.get("/", (_requete, reponse) => {
    const membres = equipe();
    reponse.render("capitanat", {
      titre: "Capitanat",
      equipe: membres,
      forces: forcesParTableau(membres),
      paires: preferences.paires().length,
      fraicheur: fraicheur(laPlusRecente(membres)),
      enJoueurs,
      joueursRequis,
    });
  });

  routeur.get("/tableau/:tableau", (requete, reponse, suite) => {
    const demande = lireLeTableau(requete.params["tableau"]);
    if (demande === null) return suite();

    const membres = equipe();
    const page = tableauDuCapitaine({
      force: forceDuTableau(membres, demande),
      equipe: membres,
      paires: preferences.paires(),
      marques: preferences.marquesDeJoueurs(),
    });

    reponse.render("capitanat-tableau", {
      titre: page.force.intitule,
      page,
      force: page.force,
      fraicheur: fraicheur(page.force.releveLe),
      enJoueurs,
      joueursRequis,
    });
  });

  /**
   * Saisir une paire — spec 030.
   *
   * Le tableau est dans l'URL et vérifié contre les sexes des deux joueurs :
   * une saisie postée depuis la page du DD ne peut pas y faire apparaître deux
   * hommes. Le tableau ne se choisit pas, il se déduit.
   */
  routeur.post("/tableau/:tableau/paires", (requete, reponse, suite) => {
    const demande = lireLeTableau(requete.params["tableau"]);
    if (demande === null || !seJoueEnPaires(demande)) return suite();

    try {
      const licences = verifierLaPaire({
        licences: champsMultiples(requete.body, "licence"),
        tableau: demande,
        equipe: equipe(),
      });
      preferences.saisirUnePaire(licences, horloge.maintenant());
    } catch (erreur) {
      if (erreur instanceof PaireRefusee) return refuser(reponse, erreur.message);
      throw erreur;
    }

    reponse.redirect(`/capitanat/tableau/${demande}`);
  });

  routeur.post("/paires/:id/marque", (requete, reponse, suite) => {
    const identifiant = Number(requete.params["id"]);
    const retour = lireLeTableau(champ(requete.body, "tableau"));
    if (!Number.isInteger(identifiant) || retour === null) return suite();

    preferences.privilegierLaPaire(identifiant, champ(requete.body, "valeur") === "1");
    reponse.redirect(`/capitanat/tableau/${retour}`);
  });

  routeur.post("/paires/:id/suppression", (requete, reponse, suite) => {
    const identifiant = Number(requete.params["id"]);
    const retour = lireLeTableau(champ(requete.body, "tableau"));
    if (!Number.isInteger(identifiant) || retour === null) return suite();

    preferences.oublierLaPaire(identifiant);
    reponse.redirect(`/capitanat/tableau/${retour}`);
  });

  /**
   * Marquer un joueur sur un tableau — spec 030.
   *
   * Sur ce tableau seulement : le même joueur se marque indépendamment en SH,
   * en DH et en MX. Ce qu'on privilégie n'est pas un joueur, c'est un joueur à
   * cette place.
   */
  routeur.post("/tableau/:tableau/joueurs/:licence/marque", (requete, reponse, suite) => {
    const demande = lireLeTableau(requete.params["tableau"]);
    const licence = requete.params["licence"] ?? "";
    if (demande === null) return suite();

    // Une licence qui n'est pas dans l'équipe ne se marque pas : sans ce
    // contrôle, une marque survivrait à l'import qui a fait partir le joueur.
    if (!equipe().some((membre) => (membre.licence as string) === licence)) {
      return refuser(reponse, "Ce joueur n'est pas dans l'équipe.");
    }

    preferences.marquerLeJoueur(
      licence as Licence,
      demande,
      champ(requete.body, "valeur") === "1",
      horloge.maintenant(),
    );
    reponse.redirect(`/capitanat/tableau/${demande}`);
  });

  return {
    intitule: "Capitanat",
    chemin: "/capitanat",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
  };
}

/**
 * Une URL qu'on met en favori se retape aussi à la main, en minuscules aussi
 * souvent qu'autrement. Ce qui n'est pas un tableau, en revanche, passe au 404
 * du socle plutôt que de rendre une page vide de sens.
 */
function lireLeTableau(valeur: string | undefined): Tableau | null {
  const demande = (valeur ?? "").toUpperCase();
  return estUnTableau(demande) ? demande : null;
}

/** La passe la plus récente de l'équipe : c'est elle qui date la page d'index. */
function laPlusRecente(membres: readonly { readonly vuLe: Date | null }[]): Date | null {
  const dates = membres.flatMap(({ vuLe }) => (vuLe === null ? [] : [vuLe.getTime()]));
  return dates.length === 0 ? null : new Date(Math.max(...dates));
}

function champ(corps: unknown, nom: string): string {
  const valeur = ((corps ?? {}) as Record<string, unknown>)[nom];
  return typeof valeur === "string" ? valeur : "";
}

/**
 * Un formulaire qui répète le même nom rend une chaîne pour une valeur et un
 * tableau pour plusieurs. Le DH en attend deux, et un capitaine qui laisse un
 * champ vide n'en envoie qu'une : les deux cas arrivent, et c'est
 * `verifierLaPaire` qui tranche.
 */
function champsMultiples(corps: unknown, nom: string): readonly string[] {
  const valeur = ((corps ?? {}) as Record<string, unknown>)[nom];
  if (Array.isArray(valeur)) return valeur.map(String).filter((licence) => licence !== "");
  return typeof valeur === "string" && valeur !== "" ? [valeur] : [];
}

function refuser(reponse: Response, message: string): void {
  reponse.status(400).render("erreur", { titre: "Paire refusée", message });
}
