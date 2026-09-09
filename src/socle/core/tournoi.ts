import type { Lettre } from "./classement.ts";

/**
 * Un tournoi, tel que badnet le publie — spec 002.
 *
 * Il vit dans le `socle` pour la raison qui a déjà fait descendre `Classement`
 * et `Engagement` : c'est une passe du socle qui l'écrit, et deux features le
 * liront — `mon-profil` pour dire où je vais (002), `veille` pour chercher où
 * aller (012). Une ville n'a pas une version vue par l'une et une autre vue par
 * l'autre.
 *
 * **C'est le début de l'index de 012.** Cette spec disait « la première des
 * deux traitée la paiera pour l'autre » : 002 passe devant, donc 002 paie. Elle
 * n'écrit que ce dont elle a besoin — le lieu et les journées ; 012 y ajoutera
 * la date limite d'inscription, les tableaux proposés et les classements
 * admis, sans avoir à déplacer ce qui est là.
 */
/**
 * Les catégories d'âge, telles que le formulaire de recherche les coche — 012.
 *
 * Le nom du champ *est* la valeur : badnet attend `jeunes=1`, `seniors=1`. Elles
 * vivent dans le `core` et non dans le module d'acquisition parce qu'une veille
 * les porte dans ses critères, et qu'un `core` ne connaît pas son
 * infrastructure (022).
 */
export const CATEGORIES = ["jeunes", "seniors", "veterans", "parabad"] as const;

export type Categorie = (typeof CATEGORIES)[number];

export function estUneCategorie(valeur: string): valeur is Categorie {
  return (CATEGORIES as readonly string[]).includes(valeur);
}

export type Tournoi = {
  /** L'identifiant badnet, le même que celui d'un `Engagement`. */
  readonly evenement: number;
  /**
   * Le nom du tournoi — « 5ème tournoi de Taverny ».
   *
   * Il vient de la recherche (012), pas de la fiche : un tournoi entré dans
   * l'index par mes seuls engagements n'en a pas, et la page de 002 affiche
   * alors l'intitulé que `/competitions` lui donne.
   */
  readonly nom: string | null;
  /**
   * La salle : « Armand Silvestre » — `null` tant qu'aucune n'est saisie.
   *
   * **Nullable depuis 036**, et ce n'est pas une commodité : sept tournois sur
   * neuf relevés le 9 septembre 2026 n'avaient pas de gymnase. L'organisateur
   * réserve la salle des semaines après avoir publié, et la fiche écrit
   * « Aucun gymnase renseigné » en attendant. Le tenir pour obligatoire faisait
   * échouer la passe sur le cas le plus courant.
   */
  readonly gymnase: string | null;
  /** L'adresse complète, telle que l'organisateur l'a saisie — `null` avec elle. */
  readonly adresse: string | null;
  /**
   * La ville, nommée par l'enveloppe de la fiche, ou lue derrière le code
   * postal quand un gymnase existe.
   *
   * C'est elle que la page affiche : « Courbevoie » répond à la question qu'on
   * se pose la veille d'un tournoi, là où l'adresse entière encombrerait une
   * colonne. L'adresse reste en base pour qui veut y aller.
   *
   * `null` quand badnet ne la nomme pas : la page sait dire « lieu non
   * relevé », et une ville absente n'est pas une fiche illisible (036).
   */
  readonly ville: string | null;
  /**
   * Les journées réellement jouées, dans l'ordre.
   *
   * **La seule source d'intervalle du projet.** `/competitions` ne rend qu'une
   * date, et 027 en avait conclu qu'il n'y en avait pas d'autre ; la fiche
   * publique dément, en listant une ligne par jour. C'est ce qui permet
   * d'écrire « du 24 au 25 octobre » plutôt qu'une date unique qui perdrait la
   * moitié du week-end.
   */
  readonly journees: readonly Date[];
  /**
   * Les coordonnées du gymnase, telles que la recherche les publie — 012.
   *
   * C'est d'elles que vient la distance, et c'est le seul chemin fiable : le
   * champ `distance` de badnet est vide deux fois sur trois, et faux quand il
   * ne l'est pas — 9 km annoncés pour 1,6 km réels, 38 pour 13.
   */
  readonly latitude: number | null;
  readonly longitude: number | null;
  /**
   * La date limite d'inscription, au jour près — 012.
   *
   * Lue sur la recherche, dans l'attribut `title` de `deadline` : présente
   * partout, gratuite, et suffisante pour filtrer. L'heure exacte est sur
   * l'enveloppe de la fiche, et c'est 014 qui en aura besoin.
   */
  readonly dateLimite: Date | null;
  /**
   * Les familles de classement et les catégories, telles que la recherche les
   * annonce : « N, R, D, P, NC », « Jeunes ».
   *
   * Gardées **sans être réinterprétées**, et à côté des séries lues sur la
   * fiche plutôt qu'à leur place : elles mentent — un tournoi annoncé `N` dont
   * la fiche exclut N1. Les garder toutes les deux fait voir l'écart.
   */
  readonly familles: string | null;
  readonly categories: string | null;
  /**
   * Les tableaux réellement proposés, tels que la fiche les code — 012.
   *
   * Des chaînes et non des `Tableau` : le relevé du 9 septembre 2026 en a rendu
   * sept, dont `ST` et `SI` que le projet ne connaît pas. Les refuser ferait
   * perdre le tournoi entier, les traduire serait inventer.
   *
   * Vide veut dire « rien de déclaré », pas « aucun tableau » — l'organisateur
   * n'a pas fini sa saisie, ce qui est le propre d'un tournoi fraîchement
   * publié.
   */
  readonly tableaux: readonly string[];
  /** Les séries admises, rang par rang, lues sur la fiche — 012. */
  readonly series: readonly Lettre[];
  /**
   * La fiche a-t-elle été relevée ?
   *
   * Depuis 012, une ligne de `tournoi` peut naître d'une recherche, sans ville,
   * sans tableaux et sans journées. C'est ce drapeau, et non l'existence de la
   * ligne, qui dit à la passe des fiches ce qu'il lui reste à faire.
   */
  readonly ficheRelevee: boolean;
};

/**
 * Ce que la fiche publique d'un tournoi rend — specs 002, 036 et 012.
 *
 * Un sous-ensemble de `Tournoi`, et pas `Tournoi` lui-même : la fiche ignore le
 * nom, les coordonnées et la date limite, qui viennent de la recherche. Les
 * confondre obligerait la chaîne à inventer des champs qu'elle n'a pas lus.
 */
export type FicheDeTournoi = {
  readonly evenement: number;
  readonly gymnase: string | null;
  readonly adresse: string | null;
  readonly ville: string | null;
  readonly journees: readonly Date[];
  readonly tableaux: readonly string[];
  readonly series: readonly Lettre[];
};

/**
 * Ce qu'une ligne de la recherche publique rend — spec 012.
 *
 * Défini dans le `core` et non dans le module badnet : c'est la passe qui le
 * manipule, et un `core` ne connaît pas son infrastructure (022). Le module
 * d'acquisition traduit sa propre lecture vers cette forme.
 */
export type TournoiDeLaRecherche = {
  readonly evenement: number;
  readonly nom: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly dateLimite: Date | null;
  readonly familles: string;
  readonly categories: string;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotTournois = {
  /**
   * Écrit ou réécrit ce que la fiche publique a rendu.
   *
   * Un par un, et non par remplacement intégral comme les engagements : ici
   * chaque ligne vient d'une requête indépendante, et une passe qui échoue à
   * mi-course ne doit pas effacer ce que la précédente avait obtenu. C'est
   * aussi ce qui rend la passe incrémentale possible.
   *
   * Elle **ne touche pas** à ce que la recherche a écrit : le nom, les
   * coordonnées et la date limite ne sont pas de son ressort, et les remettre à
   * blanc ferait disparaître un tournoi de sa veille au premier relevé de
   * fiche.
   */
  enregistrerLaFiche(fiche: FicheDeTournoi, quand: Date): void;
  /**
   * Écrit ce qu'une passe de veille a vu — spec 012.
   *
   * Symétrique de la précédente : elle ne touche ni au gymnase, ni aux
   * journées, ni aux tableaux, qui viennent de la fiche. Deux sources, deux
   * moitiés de la même ligne, et aucune qui écrase l'autre.
   */
  enregistrerDepuisLaRecherche(
    tournois: readonly TournoiDeLaRecherche[],
    quand: Date,
  ): void;
  /** Par identifiant badnet : c'est ainsi que la page les rapproche des engagements. */
  parEvenement(evenements: readonly number[]): ReadonlyMap<number, Tournoi>;
  /**
   * Ce dont la fiche est déjà relevée, pour ne pas la redemander — une ville ne
   * change pas.
   *
   * **Ce n'est plus « les lignes qui existent ».** Depuis 012 une recherche
   * insère des tournois sans fiche : confondre les deux ferait croire la passe
   * des fiches à jour le jour où une veille remplit l'index.
   */
  connus(): ReadonlySet<number>;
  /** Ce qu'il reste à relever, le plus proche d'abord — spec 012. */
  sansFiche(): readonly number[];
};

/**
 * Comment la page écrit les dates d'un tournoi — spec 002.
 *
 * Une journée : « samedi 24 octobre ». Deux ou plus : « du 24 au 25 octobre ».
 * Rien de connu : la date unique de `/competitions`, qui reste vraie même
 * quand elle est incomplète.
 *
 * Le calcul est ici et non dans la vue : c'est une règle, pas une mise en
 * forme, et une règle se teste.
 */
export function journeesLibellees(journees: readonly Date[], defaut: Date): string {
  const jours = journees.length === 0 ? [defaut] : journees;
  const premier = jours[0]!;
  const dernier = jours[jours.length - 1]!;

  if (premier.getTime() === dernier.getTime()) {
    return premier.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }

  // Le mois n'est répété que s'il change : « du 31 octobre au 1er novembre »
  // se lit, « du 24 octobre au 25 octobre » bégaie.
  const memeMois = premier.getMonth() === dernier.getMonth();
  const debut = premier.toLocaleDateString("fr-FR", {
    day: "numeric",
    ...(memeMois ? {} : { month: "long" }),
  });
  const fin = dernier.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return `du ${debut} au ${fin}`;
}
