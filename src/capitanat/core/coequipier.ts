import type { Licence } from "../../socle/core/licence.ts";

/**
 * Un membre de mon équipe — spec 005.
 *
 * C'est le `Joueur` que 022 refuse de faire monter dans le socle : vu d'ici,
 * un joueur est quelqu'un qu'on aligne et qu'on appelle, pas le titulaire d'un
 * profil. `mon-profil` garde le sien.
 *
 * Ce que porte cette table est exactement ce que myffbad ne publie pas : le
 * sexe et le téléphone. Le nom et le classement, eux, se relèvent
 * ([[028__nom-et-classement-de-l-equipe]]) — les saisir ici serait recopier à
 * la main une donnée qui se périme chaque semaine.
 *
 * Pas de mail : myffbad ne publie pas les coordonnées de ses licenciés, et une
 * colonne remplie « au cas où » serait de la donnée personnelle de tiers
 * stockée sans usage.
 */
export type Coequipier = {
  readonly licence: Licence;
  readonly sexe: Sexe;
  /**
   * Le numéro tel qu'il a été saisi. On vérifie qu'il existe, jamais sa forme :
   * un numéro belge ou un indicatif international se ferait rejeter par toute
   * règle assez précise pour être utile.
   */
  readonly telephone: string;
};

/**
 * `F` ou `M`, et rien d'autre — spec 005.
 *
 * Il ne vient pas de myffbad, qui ne le publie nulle part : ni sur la fiche,
 * ni dans les résultats, qui rendent une discipline et une série, jamais `SH`
 * ni `SD`. C'est donc la moitié de la fiche d'équipe que seul le capitaine
 * peut donner, et c'est ce qui justifie l'import. Il sert à composer une
 * journée d'interclub ([[011__composition-de-journee]]), pas à réétiqueter un
 * classement.
 */
export const SEXES = ["F", "M"] as const;

export type Sexe = (typeof SEXES)[number];

export function estUnSexe(valeur: string): valeur is Sexe {
  return (SEXES as readonly string[]).includes(valeur);
}

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotCoequipiers = {
  /**
   * Remplace intégralement l'équipe — spec 005.
   *
   * Un coéquipier absent de la liste est supprimé, avec ses relevés de
   * classement. Ce sont le téléphone et le sexe de quelqu'un qui n'a rien
   * demandé et qui ne joue plus ici ; les garder « au cas où » est
   * précisément ce qui rendrait une fuite impardonnable
   * ([[021__authentification]]).
   */
  remplacer(coequipiers: readonly Coequipier[]): void;
  /** L'équipe, par licence croissante. Vide tant qu'aucun CSV n'a été importé. */
  tous(): readonly Coequipier[];
};

/**
 * L'import est refusé en entier — spec 005.
 *
 * Tout ou rien : une seule ligne fautive et rien n'entre en base. Un import
 * partiel laisserait une équipe à moitié remplacée, sans que personne sache
 * laquelle des deux moitiés est la bonne.
 *
 * Les motifs sont tous rendus d'un coup, pas seulement le premier : la
 * correction se fait dans le tableur, en une passe.
 */
export type MotifDeRefus = {
  /** Numéro de ligne dans le fichier, en-tête comprise. `null` si le fichier entier est en cause. */
  readonly ligne: number | null;
  readonly raison: string;
};

export class ImportRefuse extends Error {
  readonly motifs: readonly MotifDeRefus[];

  constructor(motifs: readonly MotifDeRefus[]) {
    super(`Import de l'équipe refusé : ${motifs.length} anomalie(s), rien n'a été écrit.`);
    this.name = "ImportRefuse";
    this.motifs = motifs;
  }
}

/**
 * Un membre tel que la page le montre — spec 005.
 *
 * Ni nom ni classement : cette spec n'appelle personne, et c'est voulu, pas
 * oublié. Elle doit pouvoir se livrer et se vérifier sans source externe ;
 * [[028__nom-et-classement-de-l-equipe]] accroche la passe ensuite.
 */
export type MembreDeLEquipe = Coequipier & {
  /** Le numéro débarrassé de sa mise en forme, pour l'`href="tel:"`. */
  readonly appel: string;
  /** Sa fiche fédérale, publique : le lien qui manquait entre le tableur et myffbad. */
  readonly fiche: string;
};

/**
 * La racine de myffbad, répétée ici et non importée du module d'acquisition :
 * une feature ne connaît pas l'infrastructure du socle (022), et c'est le
 * genre de duplication que 022 assume plutôt que de creuser une passerelle.
 */
const FICHE_MYFFBAD = "https://www.myffbad.fr/joueur/";

export function listeDeLEquipe(depot: DepotCoequipiers): readonly MembreDeLEquipe[] {
  // L'ordre vient du dépôt : par licence croissante, arbitraire mais stable et
  // sans code. 028 le remplacera par le nom dès qu'il y en aura un.
  return depot.tous().map((coequipier) => ({
    ...coequipier,
    appel: coequipier.telephone.replaceAll(/[^+0-9]/gu, ""),
    fiche: `${FICHE_MYFFBAD}${coequipier.licence}`,
  }));
}
