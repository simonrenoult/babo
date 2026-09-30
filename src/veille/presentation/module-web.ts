import { Router, type Response } from "express";
import type { ModuleWeb } from "../../socle/presentation/serveur.ts";
import type { Horloge } from "../../socle/core/horloge.ts";
import { LETTRES, type Lettre } from "../../socle/core/classement.ts";
import { INTITULES, TABLEAUX, estUnTableau, type Tableau } from "../../socle/core/tableau.ts";
import { CATEGORIES, estUneCategorie, type Categorie } from "../../socle/core/tournoi.ts";
import type { DepotTournois } from "../../socle/core/tournoi.ts";
import type { DepotAppartenances } from "../../socle/core/passe-veilles.ts";
import type { Fraicheur } from "../../socle/core/fraicheur.ts";
import {
  VEILLES_AU_PLUS,
  VeilleRefusee,
  bornesDeLaFenetre,
  verifierLaVeille,
  type DepotVeilles,
  type Fenetre,
  type Veille,
} from "../core/veille.ts";
import { resultatsDeLaVeille } from "../core/resultats.ts";

/**
 * Le module `veille` — specs 012 à 014.
 *
 * Il ne parle jamais à badnet : l'acquisition est un adaptateur en amont, la
 * veille lit la base (spec 022). Ce que cette page porte, c'est la **saisie des
 * veilles** et la lecture de ce qu'elles ont vu.
 *
 * Les formulaires vivent ici et non sur `/sources` : c'est l'arbitrage rendu
 * par 030 — `/sources` porte l'exploitation, saisir une veille *est* la
 * feature. Aucun jeton anti-CSRF : le `SameSite=Strict` de 021 les couvre.
 */
export function creerModuleVeille(options: {
  readonly veilles: DepotVeilles;
  readonly tournois: DepotTournois;
  readonly appartenances: DepotAppartenances;
  /** L'ancienneté du relevé, jugée sur la cadence de la passe des veilles (019). */
  readonly fraicheur: () => Fraicheur;
  readonly horloge: Horloge;
  /** Mes séries du moment, proposées comme valeur de départ du formulaire (012). */
  readonly mesSeries: () => readonly Lettre[];
}): ModuleWeb {
  const { veilles, tournois, appartenances, fraicheur, horloge, mesSeries } = options;
  const routeur = Router();

  const resultats = (veille: Veille) => {
    const evenements = appartenances.tournoisDe(veille.id);
    const index = tournois.parEvenement(evenements);
    return resultatsDeLaVeille(veille, [...index.values()], horloge.maintenant());
  };

  routeur.get("/", (_requete, reponse) => {
    const toutes = veilles.toutes();
    reponse.render("veille", {
      titre: "Veille de tournois",
      veilles: toutes.map((veille) => ({
        veille,
        vus: appartenances.tournoisDe(veille.id).length,
        releveeLe: appartenances.releveeLe(veille.id),
      })),
      auPlus: VEILLES_AU_PLUS,
      fraicheur: fraicheur(),
    });
  });

  routeur.get("/nouvelle", (_requete, reponse) => {
    reponse.render("veille-formulaire", {
      titre: "Nouvelle veille",
      veille: null,
      // Mes séries du moment : le confort que 012 accorde après avoir refusé de
      // déduire le critère du classement. Une valeur de départ se corrige ; un
      // critère qui change tout seul un vendredi matin, non.
      seriesProposees: mesSeries(),
      motifs: [],
      ...vocabulaire(),
    });
  });

  routeur.get("/:id", (requete, reponse, suite) => {
    const veille = veilles.parId(Number(requete.params["id"]));
    if (veille === null) return suite();

    const { du, au } = bornesDeLaFenetre(veille.fenetre, horloge.maintenant());
    reponse.render("veille-detail", {
      titre: veille.nom,
      veille,
      resultats: resultats(veille),
      fenetre: { du, au },
      // Ce qui sépare « rien ne correspond » de « on n'a pas encore cherché ».
      // Sans elle la page disait le premier dans les deux cas, ce qui fait
      // douter de critères qui n'ont jamais servi (019).
      releveeLe: appartenances.releveeLe(veille.id),
      fraicheur: fraicheur(),
    });
  });

  routeur.get("/:id/modifier", (requete, reponse, suite) => {
    const veille = veilles.parId(Number(requete.params["id"]));
    if (veille === null) return suite();

    reponse.render("veille-formulaire", {
      titre: `Modifier « ${veille.nom} »`,
      veille,
      seriesProposees: veille.series,
      motifs: [],
      ...vocabulaire(),
    });
  });

  routeur.post("/", (requete, reponse) => {
    const saisie = lireLeFormulaire(requete.body as Record<string, unknown>);
    try {
      verifierLaVeille(saisie, { existantes: veilles.toutes() });
    } catch (erreur) {
      return refuser(reponse, erreur, saisie, "Nouvelle veille");
    }
    const creee = veilles.creer(saisie, horloge.maintenant());
    reponse.redirect(`/veille/${creee.id}`);
  });

  routeur.post("/:id", (requete, reponse, suite) => {
    const id = Number(requete.params["id"]);
    const existante = veilles.parId(id);
    if (existante === null) return suite();

    const saisie = lireLeFormulaire(requete.body as Record<string, unknown>);
    try {
      verifierLaVeille(saisie, { existantes: veilles.toutes(), id });
    } catch (erreur) {
      return refuser(reponse, erreur, saisie, `Modifier « ${existante.nom} »`);
    }
    veilles.modifier({ ...saisie, id });
    reponse.redirect(`/veille/${id}`);
  });

  /**
   * Suspendre, et non supprimer.
   *
   * Le formulaire poste l'état voulu et non « l'inverse de ce qui est écrit » :
   * c'est le choix de 030, et il fait qu'un double envoi ne fait pas clignoter
   * l'état.
   */
  routeur.post("/:id/etat", (requete, reponse, suite) => {
    const veille = veilles.parId(Number(requete.params["id"]));
    if (veille === null) return suite();

    const corps = requete.body as Record<string, unknown>;
    veilles.modifier({ ...veille, active: String(corps["active"] ?? "") === "1" });
    reponse.redirect(`/veille/${veille.id}`);
  });

  routeur.post("/:id/supprimer", (requete, reponse, suite) => {
    const veille = veilles.parId(Number(requete.params["id"]));
    if (veille === null) return suite();

    veilles.supprimer(veille.id);
    reponse.redirect("/veille");
  });

  return {
    intitule: "Veille",
    chemin: "/veille",
    routeur,
    vues: new URL("vues/", import.meta.url).pathname,
    // Sur l'accueil : ce que chaque veille active retient, et la prochaine
    // clôture d'inscription — c'est elle qui presse.
    apercu: () => {
      const maintenant = horloge.maintenant();
      return {
        vue: "veille-apercu",
        donnees: {
          veilles: veilles
            .toutes()
            .filter((veille) => veille.active)
            .map((veille) => {
              const { retenus, indetermines } = resultats(veille);
              const cloture = [...retenus, ...indetermines]
                .filter((tournoi) => tournoi.dateLimite !== null && tournoi.dateLimite >= maintenant)
                .toSorted((un, autre) => Number(un.dateLimite) - Number(autre.dateLimite))[0];
              return {
                veille,
                tournois: retenus.length + indetermines.length,
                releveeLe: appartenances.releveeLe(veille.id),
                cloture: cloture ?? null,
              };
            }),
        },
      };
    },
  };
}

function refuser(
  reponse: Response,
  erreur: unknown,
  saisie: Omit<Veille, "id">,
  titre: string,
): void {
  if (!(erreur instanceof VeilleRefusee)) throw erreur;
  reponse.status(400).render("veille-formulaire", {
    titre,
    veille: { ...saisie, id: 0 },
    seriesProposees: saisie.series,
    motifs: erreur.motifs,
    ...vocabulaire(),
  });
}

/** Les listes que le formulaire affiche : des codes fermés, jamais du texte libre. */
function vocabulaire() {
  return { tousLesTableaux: TABLEAUX, intitules: INTITULES, toutesLesSeries: LETTRES, toutesLesCategories: CATEGORIES };
}

/**
 * Ce que le formulaire poste, traduit vers la notion — jamais l'inverse.
 *
 * Rien n'est validé ici : `verifierLaVeille` le fait, et le fait tout entier.
 * Une validation à deux endroits est une validation qu'on oublie à l'un des
 * deux.
 */
function lireLeFormulaire(corps: Record<string, unknown>): Omit<Veille, "id"> {
  const liste = (valeur: unknown): readonly string[] =>
    Array.isArray(valeur) ? valeur.map(String) : valeur === undefined ? [] : [String(valeur)];

  return {
    nom: String(corps["nom"] ?? "").trim(),
    active: String(corps["active"] ?? "1") === "1",
    latitude: Number(corps["latitude"]),
    longitude: Number(corps["longitude"]),
    rayonKm: Number(corps["rayonKm"]),
    fenetre: lireLaFenetre(corps),
    tableaux: liste(corps["tableaux"]).filter(estUnTableau) as readonly Tableau[],
    series: liste(corps["series"]).filter(estUneLettre),
    categories: liste(corps["categories"]).filter(estUneCategorie) as readonly Categorie[],
    ouvertes: String(corps["ouvertes"] ?? "") === "1",
  };
}

function lireLaFenetre(corps: Record<string, unknown>): Fenetre {
  if (String(corps["fenetre"] ?? "glissante") === "glissante") {
    return { nature: "glissante", jours: Number(corps["fenetreJours"]) };
  }
  return {
    nature: "intervalle",
    du: new Date(String(corps["fenetreDu"] ?? "")),
    au: new Date(String(corps["fenetreAu"] ?? "")),
  };
}

function estUneLettre(valeur: string): valeur is Lettre {
  return (LETTRES as readonly string[]).includes(valeur);
}
