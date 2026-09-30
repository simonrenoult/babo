/**
 * Le calendrier d'interclub de mon équipe.
 *
 * Publié par icbad, groupe par groupe : une page par poule, qui liste toutes
 * les rencontres de la saison. Il ne bouge presque pas — d'où un import à la
 * main, une fois en début de saison et de nouveau si le comité déplace une
 * rencontre, plutôt qu'une passe ordonnancée qui relirait chaque nuit une page
 * figée.
 */
export type EquipeDInterclub = {
  /** « Bad’ à Paname 5 », tel qu'icbad l'affiche. */
  readonly nom: string;
  /** « 75-BAP-5 » : le code fédéral, stable quand le nom s'abrège. */
  readonly code: string;
};

export type Rencontre = {
  /** L'identifiant icbad de la rencontre : `/rencontre/<id>`. */
  readonly id: number;
  /** Le numéro de journée : 1 pour « J01 ». */
  readonly journee: number;
  /** Date et heure de début, heure de Paris. */
  readonly debut: Date;
  /** Le gymnase et sa ville, tels que le club recevant les a saisis. */
  readonly lieu: string;
  readonly domicile: EquipeDInterclub;
  readonly exterieur: EquipeDInterclub;
};

/** Ce que la page d'un groupe publie, avant qu'on n'y cherche mon équipe. */
export type PageDeGroupe = {
  readonly competition: string;
  readonly groupe: string;
  readonly rencontres: readonly Rencontre[];
};

export type CalendrierDInterclub = {
  /** La page du groupe, gardée pour réimporter sans la retaper. */
  readonly url: string;
  readonly equipe: EquipeDInterclub;
  readonly competition: string;
  readonly groupe: string;
  readonly importeLe: Date;
  /** Les rencontres de mon équipe seule, par date. */
  readonly rencontres: readonly Rencontre[];
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotCalendrier = {
  /** Remplace le calendrier entier : un réimport ne laisse aucune rencontre d'avant. */
  remplacer(calendrier: CalendrierDInterclub): void;
  lire(): CalendrierDInterclub | null;
};

/** L'import n'a rien écrit, et dit pourquoi. */
export class CalendrierRefuse extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendrierRefuse";
  }
}

/**
 * Le calendrier de mon équipe, tiré de la page de son groupe.
 *
 * **Le code, pas le nom.** Un code mal recopié refuse l'import en nommant les
 * équipes du groupe, plutôt que de rendre un calendrier vide : dix journées
 * attendues, zéro trouvée, c'est le succès vide que 019 appelle une panne.
 */
export function calendrierDeLEquipe(
  page: PageDeGroupe,
  demande: { readonly url: string; readonly code: string; readonly importeLe: Date },
): CalendrierDInterclub {
  const code = demande.code.trim().toUpperCase();
  const rencontres = page.rencontres
    .filter((rencontre) => rencontre.domicile.code === code || rencontre.exterieur.code === code)
    .toSorted((une, autre) => une.debut.getTime() - autre.debut.getTime());

  const premiere = rencontres[0];
  if (premiere === undefined) {
    const codes = [
      ...new Set(page.rencontres.flatMap(({ domicile, exterieur }) => [domicile.code, exterieur.code])),
    ].toSorted();
    throw new CalendrierRefuse(
      codes.length === 0
        ? "La page ne liste aucune rencontre : ce n'est pas la page d'un groupe, ou icbad a changé sa mise en page."
        : `Aucune rencontre pour « ${code} » dans ce groupe. Les équipes du groupe : ${codes.join(", ")}.`,
    );
  }

  return {
    url: demande.url,
    equipe: premiere.domicile.code === code ? premiere.domicile : premiere.exterieur,
    competition: page.competition,
    groupe: page.groupe,
    importeLe: demande.importeLe,
    rencontres,
  };
}

/** L'adversaire, vu de mon équipe. */
export function adversaireDe(rencontre: Rencontre, equipe: EquipeDInterclub): EquipeDInterclub {
  return rencontre.domicile.code === equipe.code ? rencontre.exterieur : rencontre.domicile;
}

/**
 * Le sigle d'une équipe, sans son département : « BAP18-5 » pour
 * « 75-BAP18-5 ». C'est ainsi qu'on les nomme entre joueurs.
 */
export function sigleDe(equipe: EquipeDInterclub): string {
  return equipe.code.replace(/^\d+-/, "");
}

export function recoitOn(rencontre: Rencontre, equipe: EquipeDInterclub): boolean {
  return rencontre.domicile.code === equipe.code;
}
