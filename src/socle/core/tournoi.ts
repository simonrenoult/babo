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
export type Tournoi = {
  /** L'identifiant badnet, le même que celui d'un `Engagement`. */
  readonly evenement: number;
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
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotTournois = {
  /**
   * Écrit ou réécrit un tournoi.
   *
   * Un par un, et non par remplacement intégral comme les engagements : ici
   * chaque ligne vient d'une requête indépendante, et une passe qui échoue à
   * mi-course ne doit pas effacer ce que la précédente avait obtenu. C'est
   * aussi ce qui rend la passe incrémentale possible.
   */
  enregistrer(tournoi: Tournoi, quand: Date): void;
  /** Par identifiant badnet : c'est ainsi que la page les rapproche des engagements. */
  parEvenement(evenements: readonly number[]): ReadonlyMap<number, Tournoi>;
  /** Ce qui est déjà connu, pour ne pas le redemander — une ville ne change pas. */
  connus(): ReadonlySet<number>;
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
