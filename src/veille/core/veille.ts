import type { Lettre } from "../../socle/core/classement.ts";
import { LETTRES } from "../../socle/core/classement.ts";
import type { Discipline } from "../../socle/core/classement.ts";
import type { Tableau } from "../../socle/core/tableau.ts";
import { TABLEAUX } from "../../socle/core/tableau.ts";
import type { Categorie } from "../../socle/core/tournoi.ts";
import { CATEGORIES } from "../../socle/core/tournoi.ts";

/**
 * Une veille : une recherche de tournois qu'on nomme et qu'on garde — spec 012.
 *
 * **Ce n'est pas une configuration du formulaire badnet.** « DH » et
 * « D7 D8 D9 » s'y traduisent ; « moins d'une heure en transports depuis
 * Paris » et « proche de la mer » n'existent nulle part chez lui. La veille
 * porte donc un modèle à elle, qu'un adaptateur traduit — ce qui la met aussi à
 * l'abri du jour où badnet renomme un champ, ou change le sens des
 * identifiants de comité qu'il utilise pour ses départements.
 */
export type Veille = {
  readonly id: number;
  /** « DH avec Louis », « Tournois en région avec l'équipe ». */
  readonly nom: string;
  /**
   * Suspendue plutôt que supprimée.
   *
   * Supprimer efface ce que la veille a déjà vu, donc la recréer réalerte sur
   * tout ce qu'elle connaissait (013). Une veille qui ne sert qu'en début de
   * saison se met en pause ; elle ne cherche plus et n'alerte plus.
   */
  readonly active: boolean;
  readonly latitude: number;
  readonly longitude: number;
  readonly rayonKm: number;
  readonly fenetre: Fenetre;
  readonly tableaux: readonly Tableau[];
  readonly series: readonly Lettre[];
  readonly categories: readonly Categorie[];
  /** Les inscriptions ne sont pas encore closes. */
  readonly ouvertes: boolean;
};

/**
 * La fenêtre de dates, sous l'une de deux formes et jamais les deux — spec 012.
 *
 * « Les trois prochains mois » est **glissante** : la veille dit la même chose
 * en janvier et en juin. « Du 15 octobre au 5 novembre » est fixe.
 *
 * **Pas de récurrence annuelle.** « Tous les novembres » a l'air utile et ne
 * l'est pas : ce qu'on veut vraiment, c'est « pendant les vacances de la
 * Toussaint », dont les dates changent chaque année. Une veille à intervalle
 * fixe qui expire est d'ailleurs une information — la page la montre éteinte
 * plutôt que de la laisser rater en silence.
 */
export type Fenetre =
  | { readonly nature: "glissante"; readonly jours: number }
  | { readonly nature: "intervalle"; readonly du: Date; readonly au: Date };

/** Cinq au plus : au-delà, on ne les relit plus. */
export const VEILLES_AU_PLUS = 5;

export type DepotVeilles = {
  toutes(): readonly Veille[];
  parId(id: number): Veille | null;
  creer(veille: Omit<Veille, "id">, quand: Date): Veille;
  modifier(veille: Veille): void;
  supprimer(id: number): void;
};

export class VeilleRefusee extends Error {
  readonly motifs: readonly string[];

  constructor(motifs: readonly string[]) {
    super(motifs.join(" ; "));
    this.name = "VeilleRefusee";
    this.motifs = motifs;
  }
}

/**
 * Ce qu'une saisie doit respecter — spec 012.
 *
 * Tout ou rien, comme l'import de 005 : une veille à moitié valide entrerait en
 * base et chercherait chaque matin sur des critères que personne n'a voulus.
 * Les motifs sont rendus tous ensemble, pour ne pas faire corriger le
 * formulaire une erreur à la fois.
 */
export function verifierLaVeille(
  saisie: Omit<Veille, "id">,
  options: { readonly existantes: readonly Veille[]; readonly id?: number },
): void {
  const { existantes, id } = options;
  const motifs: string[] = [];

  const nom = saisie.nom.trim();
  if (nom === "") motifs.push("Le nom est vide.");
  if (existantes.some((autre) => autre.nom === nom && autre.id !== id)) {
    motifs.push(`Une veille s'appelle déjà « ${nom} ».`);
  }
  if (id === undefined && existantes.length >= VEILLES_AU_PLUS) {
    motifs.push(`Cinq veilles au plus, et il y en a déjà ${existantes.length}.`);
  }

  if (!Number.isFinite(saisie.latitude) || Math.abs(saisie.latitude) > 90) {
    motifs.push("La latitude n'est pas une latitude.");
  }
  if (!Number.isFinite(saisie.longitude) || Math.abs(saisie.longitude) > 180) {
    motifs.push("La longitude n'est pas une longitude.");
  }
  if (!Number.isInteger(saisie.rayonKm) || saisie.rayonKm <= 0 || saisie.rayonKm > 500) {
    motifs.push("Le rayon se compte en kilomètres, entre 1 et 500.");
  }

  if (saisie.fenetre.nature === "glissante") {
    const { jours } = saisie.fenetre;
    if (!Number.isInteger(jours) || jours <= 0 || jours > 365) {
      motifs.push("Une fenêtre glissante se compte en jours, entre 1 et 365.");
    }
  } else {
    const { du, au } = saisie.fenetre;
    if (Number.isNaN(du.getTime()) || Number.isNaN(au.getTime())) {
      motifs.push("Les deux bornes de la fenêtre sont des dates.");
    } else if (au < du) {
      motifs.push("La fin de la fenêtre précède son début.");
    }
  }

  // Une veille sans tableau ou sans série ne filtre rien : elle rendrait le
  // catalogue entier, et 013 alerterait sur tout. Mieux vaut refuser que de
  // laisser croire à un filtre.
  if (saisie.tableaux.length === 0) motifs.push("Aucun tableau : la veille ne filtrerait rien.");
  if (saisie.series.length === 0) motifs.push("Aucune série : la veille ne filtrerait rien.");
  if (saisie.tableaux.some((tableau) => !(TABLEAUX as readonly string[]).includes(tableau))) {
    motifs.push("Un tableau n'en est pas un.");
  }
  if (saisie.series.some((serie) => !(LETTRES as readonly string[]).includes(serie))) {
    motifs.push("Une série n'est pas au barème.");
  }
  if (saisie.categories.some((c) => !(CATEGORIES as readonly string[]).includes(c))) {
    motifs.push("Une catégorie d'âge n'en est pas une.");
  }

  if (motifs.length > 0) throw new VeilleRefusee(motifs);
}

/**
 * Les disciplines à pousser dans la requête badnet — spec 012.
 *
 * **Déduites des tableaux, pas saisies à part.** badnet ne distingue pas le
 * genre : il ne connaît que simple, double et mixte. Demander la discipline en
 * plus du tableau ferait deux champs qui peuvent se contredire, et l'un des
 * deux serait forcément faux.
 */
const DISCIPLINE_DU_TABLEAU: Record<Tableau, Discipline> = {
  SH: "simple",
  SD: "simple",
  DH: "double",
  DD: "double",
  MX: "mixte",
};

export function disciplinesDe(tableaux: readonly Tableau[]): readonly Discipline[] {
  return [...new Set(tableaux.map((tableau) => DISCIPLINE_DU_TABLEAU[tableau]))];
}

/** Les bornes de la fenêtre à un instant donné. */
export function bornesDeLaFenetre(fenetre: Fenetre, maintenant: Date): { du: Date; au: Date } {
  if (fenetre.nature === "intervalle") return { du: fenetre.du, au: fenetre.au };
  const au = new Date(maintenant);
  au.setDate(au.getDate() + fenetre.jours);
  return { du: maintenant, au };
}
