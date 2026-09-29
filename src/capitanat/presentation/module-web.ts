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
import type { DepotCalendrier } from "../core/calendrier.ts";
import { adversaireDe, recoitOn } from "../core/calendrier.ts";
import type { DepotDisponibilites } from "../core/disponibilite.ts";
import { grilleDesDisponibilites, reponsesALaJournee, suggestionPour } from "../core/disponibilite.ts";
import type { Composition, DepotCompositions, LigneDeFeuille } from "../core/composition.ts";
import {
  MATCHS,
  POSTES,
  candidatsAuPoste,
  coteDe,
  fautesDeLaComposition,
  lignesDeLaFeuille,
  matchsParJoueur,
  placesVides,
  sollicitations,
} from "../core/composition.ts";
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
  /** Le calendrier d'interclub, importé depuis l'écran des paramètres et lu ici. */
  readonly calendrier: DepotCalendrier;
  /** Les réponses aux sondages, importées depuis les paramètres, et leurs rattachements — spec 008. */
  readonly disponibilites: DepotDisponibilites;
  /** Les compositions retenues, journée par journée — spec 011. */
  readonly compositions: DepotCompositions;
  /**
   * La feuille de rencontre officielle d'icbad, complétée de ma composition,
   * en PDF. Branchée dans `main.ts` : télécharger est l'affaire du socle.
   */
  readonly feuilleDeRencontre: (demande: {
    readonly rencontre: number;
    readonly cote: "domicile" | "exterieur";
    readonly lignes: readonly LigneDeFeuille[];
  }) => Promise<Uint8Array>;
  /** L'ancienneté des classements, jugée sur la cadence de leur passe — spec 019. */
  readonly fraicheur: (vuLe: Date | null) => Fraicheur;
  readonly horloge: Horloge;
}): ModuleWeb {
  const {
    coequipiers,
    identites,
    classements,
    preferences,
    calendrier,
    disponibilites,
    compositions,
    feuilleDeRencontre,
    fraicheur,
    horloge,
  } = options;
  const routeur = Router();

  const equipe = () => listeDeLEquipe(coequipiers, identites, classements);

  // Trois onglets : l'effectif et ce qu'il permet d'aligner, le calendrier de
  // la saison, et ce que je privilégie tableau par tableau. `/capitanat` reste
  // l'adresse des effectifs, celle que les autres pages citent.
  routeur.get("/", (_requete, reponse) => {
    const membres = equipe();
    const repondants = disponibilites.repondants();
    const reponses = disponibilites.reponses();
    reponse.render("capitanat-effectifs", {
      titre: "Capitanat",
      onglet: "effectifs",
      equipe: membres,
      fraicheur: fraicheur(laPlusRecente(membres)),
      // Sur toute la saison composée jusqu'ici — spec 009.
      usage: sollicitations({
        compositions: compositions.toutes(),
        reponsesDe: (journee) => reponsesALaJournee(journee, repondants, reponses),
      }),
    });
  });

  routeur.get("/calendrier", (_requete, reponse) => {
    reponse.render("capitanat-calendrier", {
      titre: "Capitanat",
      onglet: "calendrier",
      calendrier: calendrier.lire(),
      maintenant: horloge.maintenant(),
      adversaireDe,
      recoitOn,
    });
  });

  /**
   * La grille des disponibilités — spec 008 : une colonne par rencontre, une
   * ligne par nom du sondage, et le décompte par sexe qui dit si l'on compose.
   */
  routeur.get("/disponibilites", (_requete, reponse) => {
    const membres = equipe();
    const leCalendrier = calendrier.lire();
    const repondants = disponibilites.repondants();
    reponse.render("capitanat-disponibilites", {
      titre: "Capitanat",
      onglet: "disponibilites",
      calendrier: leCalendrier,
      membres,
      repondants,
      grille:
        leCalendrier === null
          ? null
          : grilleDesDisponibilites({
              calendrier: leCalendrier,
              membres,
              repondants,
              reponses: disponibilites.reponses(),
            }),
      // Le membre préselectionné : le rattachement en base, sinon la
      // proposition par le prénom — que le capitaine confirme en enregistrant.
      preselection: (nom: string, licence: Licence | null) => licence ?? suggestionPour(nom, membres),
      adversaireDe,
      recoitOn,
    });
  });

  /**
   * Rattacher les noms du sondage aux membres — spec 008.
   *
   * Un seul formulaire pour tous les noms : on rattache le sondage d'un coup,
   * après l'import. Une licence qui n'est pas dans l'équipe ne se rattache pas.
   */
  routeur.post("/disponibilites/rattachements", (requete, reponse) => {
    const noms = champsAlignes(requete.body, "nom");
    const licences = champsAlignes(requete.body, "licence");
    const connus = new Set(disponibilites.repondants().map(({ nom }) => nom));
    const equipeActuelle = new Set<string>(equipe().map(({ licence }) => licence));

    if (noms.length !== licences.length) {
      return reponse.status(400).render("erreur", { titre: "Rattachement refusé", message: "Formulaire incomplet." });
    }
    for (const [index, nom] of noms.entries()) {
      const licence = licences[index] ?? "";
      if (!connus.has(nom) || (licence !== "" && !equipeActuelle.has(licence))) {
        return reponse.status(400).render("erreur", {
          titre: "Rattachement refusé",
          message: `« ${nom} » ne se rattache pas à ce membre : l'un ou l'autre n'existe plus. Rien n'a été enregistré.`,
        });
      }
    }

    for (const [index, nom] of noms.entries()) {
      const licence = licences[index] ?? "";
      disponibilites.rattacher(nom, licence === "" ? null : (licence as Licence));
    }
    reponse.redirect("/capitanat/disponibilites");
  });

  /**
   * La planification — spec 011. Sans journée désignée, on ouvre la prochaine
   * rencontre : c'est celle qu'on compose.
   */
  routeur.get("/planification", (_requete, reponse) => {
    const leCalendrier = calendrier.lire();
    if (leCalendrier === null || leCalendrier.rencontres.length === 0) {
      return reponse.render("capitanat-planification", {
        titre: "Capitanat",
        onglet: "planification",
        calendrier: null,
      });
    }
    const maintenant = horloge.maintenant();
    const prochaine =
      leCalendrier.rencontres.find((rencontre) => rencontre.debut >= maintenant) ?? leCalendrier.rencontres.at(-1);
    reponse.redirect(`/capitanat/planification/${prochaine?.journee ?? 1}`);
  });

  const planification = (
    reponse: Response,
    journee: number,
    suite: () => void,
    saisie?: { readonly composition: Composition; readonly fautes: readonly string[] },
  ): void => {
    const leCalendrier = calendrier.lire();
    const rencontre = leCalendrier?.rencontres.find((candidate) => candidate.journee === journee);
    if (leCalendrier === null || rencontre === undefined) return suite();

    const membres = equipe();
    const repondants = disponibilites.repondants();
    const toutesLesReponses = disponibilites.reponses();
    const reponses = reponsesALaJournee(journee, repondants, toutesLesReponses);
    const composition = saisie?.composition ?? compositions.lire(journee);
    const usage = sollicitations({
      journee,
      compositions: compositions.toutes(),
      reponsesDe: (autre) => reponsesALaJournee(autre, repondants, toutesLesReponses),
    });

    reponse.status(saisie === undefined ? 200 : 400).render("capitanat-planification", {
      titre: "Capitanat",
      onglet: "planification",
      calendrier: leCalendrier,
      rencontre,
      composees: compositions.journeesComposees(),
      matchs: MATCHS,
      postes: POSTES.map((poste) => ({
        poste,
        choisi: composition.get(poste.id) ?? null,
        candidats: candidatsAuPoste(poste, membres, reponses),
      })),
      membres,
      reponses,
      // Un choix enregistré que les réponses ne justifient plus (nouveau
      // sondage, joueur parti) reste affiché, et la faute dit pourquoi.
      fautes: saisie?.fautes ?? fautesDeLaComposition(composition, membres, reponses),
      enregistree: saisie === undefined,
      vides: placesVides(composition),
      matchsParJoueur: matchsParJoueur(composition),
      disponibles: [...reponses.values()].filter((valeur) => valeur !== "non").length,
      usage,
      // Les disponibles de la journée, les moins retenus d'abord : ceux qu'on
      // oublie. Sans occasion, on ne peut rien en dire — ils ferment la liste.
      sollicites: membres
        .filter((membre) => ["oui", "si-besoin"].includes(reponses.get(membre.licence) ?? ""))
        .map((membre) => ({ membre, reponse: reponses.get(membre.licence), ...(usage.get(membre.licence) ?? { selections: 0, occasions: 0 }) }))
        .toSorted(
          (un, autre) =>
            Number(un.occasions === 0) - Number(autre.occasions === 0) ||
            un.selections / Math.max(un.occasions, 1) - autre.selections / Math.max(autre.occasions, 1) ||
            autre.occasions - un.occasions,
        ),
      coteDe,
      adversaireDe,
      recoitOn,
    });
  };

  routeur.get("/planification/:journee", (requete, reponse, suite) => {
    planification(reponse, Number(requete.params["journee"]), suite);
  });

  /**
   * La feuille de rencontre à imprimer — la feuille d'icbad, avec ma
   * composition *enregistrée* écrite dans ma colonne. Ce qui n'est pas
   * enregistré n'est pas imprimé : la feuille dit ce que la page affiche.
   */
  routeur.get("/planification/:journee/feuille", (requete, reponse, suite) => {
    const journee = Number(requete.params["journee"]);
    const leCalendrier = calendrier.lire();
    const rencontre = leCalendrier?.rencontres.find((candidate) => candidate.journee === journee);
    if (leCalendrier === null || rencontre === undefined) return suite();

    feuilleDeRencontre({
      rencontre: rencontre.id,
      cote: recoitOn(rencontre, leCalendrier.equipe) ? "domicile" : "exterieur",
      lignes: lignesDeLaFeuille(compositions.lire(journee), equipe()),
    })
      .then((pdf) => {
        reponse
          .type("application/pdf")
          .setHeader(
            "Content-Disposition",
            `inline; filename="J${String(journee).padStart(2, "0")}-feuille-de-rencontre.pdf"`,
          );
        reponse.send(Buffer.from(pdf));
      })
      .catch((erreur: unknown) => {
        reponse.status(502).render("erreur", {
          titre: "Feuille indisponible",
          message: `La feuille de rencontre n'a pas pu être préparée : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        });
      });
  });

  /**
   * Enregistrer la composition d'une journée — spec 011.
   *
   * Une composition fautive n'est pas enregistrée : la page revient avec la
   * saisie telle quelle et ses fautes, pour qu'on la corrige sans la retaper.
   */
  routeur.post("/planification/:journee", (requete, reponse, suite) => {
    const journee = Number(requete.params["journee"]);
    const composition: Composition = new Map(
      POSTES.flatMap(({ id }) => {
        const licence = champ(requete.body, id);
        return licence === "" ? [] : [[id, licence as Licence] as const];
      }),
    );
    const reponses = reponsesALaJournee(journee, disponibilites.repondants(), disponibilites.reponses());
    const fautes = fautesDeLaComposition(composition, equipe(), reponses);
    if (fautes.length > 0) return planification(reponse, journee, suite, { composition, fautes });

    if (calendrier.lire()?.rencontres.some((rencontre) => rencontre.journee === journee) !== true) return suite();
    compositions.enregistrer(journee, composition);
    reponse.redirect(`/capitanat/planification/${journee}`);
  });

  routeur.get("/preferences", (_requete, reponse) => {
    const membres = equipe();
    const paires = preferences.paires();
    const marques = preferences.marquesDeJoueurs();
    reponse.render("capitanat-preferences", {
      titre: "Capitanat",
      onglet: "preferences",
      tableaux: forcesParTableau(membres).map((force) =>
        tableauDuCapitaine({ force, equipe: membres, paires, marques }),
      ),
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

/**
 * Deux champs répétés, lus côte à côte : contrairement à `champsMultiples`, la
 * valeur vide est gardée — ici elle veut dire « non rattaché », et l'ôter
 * décalerait toutes les paires qui suivent.
 */
function champsAlignes(corps: unknown, nom: string): readonly string[] {
  const valeur = ((corps ?? {}) as Record<string, unknown>)[nom];
  if (Array.isArray(valeur)) return valeur.map(String);
  return typeof valeur === "string" ? [valeur] : [];
}

function refuser(reponse: Response, message: string): void {
  reponse.status(400).render("erreur", { titre: "Paire refusée", message });
}
