import type { Classement, DepotClassements } from "../../socle/core/classement.ts";
import { DISCIPLINES } from "../../socle/core/classement.ts";
import type { DepotIdentites } from "../../socle/core/identite.ts";
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
 * ([[028__nom-et-classement-de-l-equipe]], faite) et vivent dans le socle —
 * les saisir ici serait recopier à la main une donnée qui se périme chaque
 * semaine.
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
 * Un membre tel que la page le montre — specs 005 et 028.
 *
 * 005 n'appelait personne : la page montrait des numéros de licence là où il
 * fallait des noms. 028 accroche la passe, et les trois champs relevés arrivent
 * ici — sans jamais que ce module ne parle à myffbad, qui reste le travail du
 * socle (022).
 */
export type MembreDeLEquipe = Coequipier & {
  /** Le numéro débarrassé de sa mise en forme, pour l'`href="tel:"`. */
  readonly appel: string;
  /** Sa fiche fédérale, publique : le lien qui manquait entre le tableur et myffbad. */
  readonly fiche: string;
  /**
   * Le nom relevé sur myffbad, ou `null` tant qu'aucune passe n'a abouti pour
   * lui. C'est aussi ce qui rend visible une licence bien formée mais erronée :
   * elle rapporte le nom de quelqu'un d'autre, et rien d'autre ne le dit (028).
   */
  readonly nom: string | null;
  /** Une entrée par discipline présente sur la fiche, dans l'ordre du barème. */
  readonly classements: readonly Classement[];
  /**
   * La date de la passe qui a relevé ces valeurs — `vu_le`, pas `apparu_le` :
   * la question à laquelle la page répond est « est-ce à jour ? ».
   */
  readonly vuLe: Date | null;
};

/**
 * La racine de myffbad, répétée ici et non importée du module d'acquisition :
 * une feature ne connaît pas l'infrastructure du socle (022), et c'est le
 * genre de duplication que 022 assume plutôt que de creuser une passerelle.
 */
const FICHE_MYFFBAD = "https://www.myffbad.fr/joueur/";

export function listeDeLEquipe(
  depot: DepotCoequipiers,
  identites: DepotIdentites,
  classements: DepotClassements,
): readonly MembreDeLEquipe[] {
  const membres = depot.tous().map((coequipier) => {
    const releves = classements.derniers(coequipier.licence);

    return {
      ...coequipier,
      appel: coequipier.telephone.replaceAll(/[^+0-9]/gu, ""),
      fiche: `${FICHE_MYFFBAD}${coequipier.licence}`,
      nom: identites.lire(coequipier.licence)?.nom ?? null,
      // Dans l'ordre simple, double, mixte — celui de la fiche et du barème,
      // et non celui que la base rendrait, qui n'est l'ordre de personne. La
      // discipline jamais jouée est absente, jamais inventée (001).
      classements: DISCIPLINES.flatMap((discipline) => {
        const releve = releves.find((candidat) => candidat.discipline === discipline);
        return releve === undefined
          ? []
          : [{ discipline, lettre: releve.lettre, cpph: releve.cpph }];
      }),
      vuLe: laPlusRecente(releves.map(({ vuLe }) => vuLe)),
    };
  });

  return [...membres].sort(parNom);
}

/** Ce qu'il faut pour être trié : un nom relevé ou pas, et le numéro qui le remplace. */
export type Nommable = {
  readonly nom: string | null;
  readonly licence: Licence;
};

/**
 * Le tri de 028 : sur le nom tel que myffbad le rend — « Simon RENOULT »,
 * prénom puis nom.
 *
 * Pas d'extraction du nom de famille : une heuristique sur des noms propres
 * échoue en silence au premier nom composé, sur la donnée qu'on lit en premier.
 *
 * Les membres pas encore relevés passent en fin de liste, par licence : c'est
 * l'ordre provisoire de 005, et le tenir séparé évite qu'un membre change de
 * place à mesure que la passe avance.
 *
 * Exporté depuis 029, qui range les mêmes joueurs sur cinq autres pages : deux
 * tris départageant les homonymes différemment feraient bouger un joueur d'une
 * page à l'autre sans raison lisible.
 */
export function parNom(un: Nommable, autre: Nommable): number {
  if (un.nom === null || autre.nom === null) {
    if (un.nom !== autre.nom) return un.nom === null ? 1 : -1;
    return un.licence.localeCompare(autre.licence);
  }
  return un.nom.localeCompare(autre.nom, "fr");
}

function laPlusRecente(dates: readonly Date[]): Date | null {
  return dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime())));
}

/**
 * Comment on appelle chacun entre coéquipiers : « Simon » pour « Simon
 * RENOULT ». Quand deux membres partagent un prénom, le nom complet les
 * distingue. Sans nom relevé, la licence.
 */
export function designations(membres: readonly MembreDeLEquipe[]): ReadonlyMap<Licence, string> {
  const prenoms = new Map(membres.map((membre) => [membre.licence, prenomDe(membre)]));
  const partages = (prenom: string) => [...prenoms.values()].filter((autre) => autre === prenom).length > 1;
  return new Map(
    membres.map((membre) => {
      const prenom = prenoms.get(membre.licence) ?? membre.licence;
      return [membre.licence, partages(prenom) ? (membre.nom ?? membre.licence) : prenom];
    }),
  );
}

/**
 * myffbad écrit le nom de famille en capitales : le prénom est ce qui ne l'est
 * pas. « Marie-Anne DE LA TOUR » donne « Marie-Anne ».
 */
function prenomDe(membre: MembreDeLEquipe): string {
  if (membre.nom === null) return membre.licence;
  const prenom = membre.nom.split(/\s+/).filter((mot) => mot !== mot.toUpperCase() || !/\p{L}/u.test(mot));
  return prenom.length === 0 ? membre.nom : prenom.join(" ");
}
