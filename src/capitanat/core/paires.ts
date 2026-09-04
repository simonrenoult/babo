import type { Lettre } from "../../socle/core/classement.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { Tableau } from "../../socle/core/tableau.ts";
import type { MembreDeLEquipe, Sexe } from "./coequipier.ts";
import { parNom } from "./coequipier.ts";
import type { Alignable, ForceParTableau, Places } from "./forces-par-tableau.ts";

/**
 * Les paires du capitaine, et ce qu'il privilégie — spec 030.
 *
 * [[029__forces-par-tableau]] range les joueurs par leur cote. Pour les deux
 * simples, c'est toute la réponse ; pour le DH, le DD et le MX, non : le
 * tableau se joue en paires, et une paire n'a pas de classement fédéral.
 *
 * Deux choses vivent ici, et une seule est dérivée. Les **paires** sont saisies
 * — une décision de capitaine, qui n'existe nulle part ailleurs et ne se
 * recalcule pas. Leur **ordre**, lui, se dérive des cotes comme le reste.
 *
 * Et une troisième, qui n'est ni l'un ni l'autre : **la marque**. La cote ne
 * dit pas tout — une paire moins bien classée qui se connaît mieux vaut mieux
 * qu'une paire mieux classée qui n'a jamais joué ensemble. L'ordre par
 * classement est un fait ; la marque est la décision qu'on écrit à côté.
 */

/** Les trois tableaux qui se jouent en paires. Les deux simples n'en ont pas. */
export const TABLEAUX_EN_PAIRES = ["DH", "DD", "MX"] as const;

export type TableauEnPaires = (typeof TABLEAUX_EN_PAIRES)[number];

export function seJoueEnPaires(tableau: Tableau): tableau is TableauEnPaires {
  return (TABLEAUX_EN_PAIRES as readonly string[]).includes(tableau);
}

/**
 * Une paire est deux licences, rien de plus — spec 030.
 *
 * Son tableau n'est pas stocké : il se déduit des sexes, et comme 005 n'accepte
 * que `F` ou `M`, il n'y a aucun autre choix possible. Le stocker permettrait
 * de l'écrire faux ; le déduire rend la ligne fausse impossible.
 */
export type Paire = {
  readonly id: number;
  readonly licences: readonly [Licence, Licence];
  readonly privilegiee: boolean;
};

/**
 * Ce que le capitaine privilégie sur un tableau donné.
 *
 * Le même joueur se marque indépendamment en SH, en DH et en MX : ce qu'on
 * privilégie n'est pas un joueur, c'est un joueur *à cette place*.
 */
export type MarqueDeJoueur = {
  readonly licence: Licence;
  readonly tableau: Tableau;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotPreferences = {
  paires(): readonly Paire[];
  /** Lève `PaireRefusee` si la paire existe déjà : deux fois la même n'est pas une décision de plus. */
  saisirUnePaire(licences: readonly [Licence, Licence], quand: Date): Paire;
  privilegierLaPaire(id: number, privilegiee: boolean): void;
  oublierLaPaire(id: number): void;
  marquesDeJoueurs(): readonly MarqueDeJoueur[];
  marquerLeJoueur(licence: Licence, tableau: Tableau, marque: boolean, quand: Date): void;
};

export class PaireRefusee extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = "PaireRefusee";
  }
}

/**
 * Deux hommes DH, deux femmes DD, un de chaque MX — spec 030.
 *
 * C'est toute la déduction, et elle est totale : les sexes ne prennent que deux
 * valeurs (005), donc il n'existe pas de couple sans tableau.
 */
export function tableauDeLaPaire(un: Sexe, autre: Sexe): TableauEnPaires {
  if (un !== autre) return "MX";
  return un === "M" ? "DH" : "DD";
}

/** Un membre de paire, tel que la page le montre. */
export type MembreDePaire = {
  readonly licence: Licence;
  readonly nom: string | null;
  readonly fiche: string;
  /**
   * La cote dans la discipline du tableau, ou `null` quand le joueur n'y est
   * pas classé — la moitié d'une paire peut manquer sans que la paire soit une
   * erreur : c'est une intention, pas un calcul.
   */
  readonly cote: number | null;
  readonly lettre: Lettre | null;
};

export type PaireDuTableau = {
  readonly id: number;
  readonly joueurs: readonly [MembreDePaire, MembreDePaire];
  readonly privilegiee: boolean;
  /**
   * La moyenne des deux cotes, `null` dès qu'un des deux manque.
   *
   * La moyenne plutôt que la somme parce qu'elle se compare à une cote
   * individuelle ; sur les cotes plutôt que sur les séries parce que deux
   * paires « D8 + D9 » peuvent valoir deux cent cinquante points d'écart, et
   * que c'est justement l'écart qu'on cherche. **Cet ordre bouge à chaque
   * publication hebdomadaire du CPPH**, et c'est assumé.
   */
  readonly cote: number | null;
};

/** Un joueur de la liste de 029, plus la marque du capitaine. */
export type JoueurRange = Alignable & { readonly privilegie: boolean };

/** Une place à pourvoir dans le formulaire de saisie, et qui peut la prendre. */
export type Emplacement = {
  readonly sexe: Sexe;
  readonly candidats: readonly CandidatAUnePaire[];
};

export type CandidatAUnePaire = {
  readonly licence: Licence;
  readonly nom: string | null;
};

/**
 * Une page de tableau, enrichie de ce que le capitaine a saisi — spec 030.
 *
 * `force` reste ce que 029 a calculé, intact : cette spec ajoute une couche,
 * elle ne réécrit pas l'ordre de force. Ce qui change à l'écran, c'est le rang
 * — deux blocs au lieu d'un — et ce qui s'y ajoute, les paires.
 */
export type TableauDuCapitaine = {
  readonly force: ForceParTableau;
  readonly joueurs: readonly JoueurRange[];
  readonly enPaires: boolean;
  /** Ordonnées : privilégiées d'abord, chaque bloc à la cote moyenne. */
  readonly paires: readonly PaireDuTableau[];
  /**
   * Les paires dont un membre au moins n'est pas classé dans la discipline.
   *
   * Nommées à part et jamais rangées dernières, pour la raison que 029 donne
   * déjà de ses écartés : en début de saison, un joueur sans classement est
   * presque toujours une licence fausse, pas un joueur faible. Les ranger
   * dernières ferait disparaître l'anomalie qu'on veut voir.
   */
  readonly pairesHorsOrdre: readonly PaireDuTableau[];
  /** Vide sur les deux simples : il n'y a pas de paire à saisir. */
  readonly emplacements: readonly Emplacement[];
};

export function tableauDuCapitaine(options: {
  readonly force: ForceParTableau;
  readonly equipe: readonly MembreDeLEquipe[];
  readonly paires: readonly Paire[];
  readonly marques: readonly MarqueDeJoueur[];
}): TableauDuCapitaine {
  const { force, equipe, paires, marques } = options;
  const enPaires = seJoueEnPaires(force.tableau);

  const marquees = new Set(
    marques
      .filter((marque) => marque.tableau === force.tableau)
      .map((marque) => marque.licence as string),
  );

  const rangees = enPaires ? pairesDuTableau(force, equipe, paires) : [];

  return {
    force,
    joueurs: enDeuxBlocs(
      force.alignables.map((joueur) => ({
        ...joueur,
        privilegie: marquees.has(joueur.licence),
      })),
      ({ privilegie }) => privilegie,
    ),
    enPaires,
    paires: enDeuxBlocs(
      rangees.filter((paire) => paire.cote !== null),
      ({ privilegiee }) => privilegiee,
    ),
    pairesHorsOrdre: enDeuxBlocs(
      rangees.filter((paire) => paire.cote === null),
      ({ privilegiee }) => privilegiee,
    ),
    emplacements: enPaires ? emplacementsDe(force.places, equipe) : [],
  };
}

/**
 * Deux blocs, les marqués d'abord, chaque bloc gardant l'ordre qu'il avait.
 *
 * Ni une simple étoile — privilégier n'est pas décorer —, ni un bonus de
 * points, qui produirait un ordre qui ne serait ni celui du classement ni celui
 * du capitaine. La comparaison ne se perd pas : le meilleur non marqué reste en
 * tête de son bloc.
 *
 * Le tri s'appuie sur la stabilité garantie de `Array.prototype.sort` : la
 * liste entre déjà rangée à la cote, et ne comparer que la marque laisse cet
 * ordre intact à l'intérieur de chaque bloc.
 */
function enDeuxBlocs<T>(liste: readonly T[], marque: (element: T) => boolean): readonly T[] {
  return [...liste].sort((un, autre) => Number(marque(autre)) - Number(marque(un)));
}

/**
 * Les paires de ce tableau, ordonnées à la cote moyenne.
 *
 * Une paire dont un membre a quitté l'équipe n'existe plus : l'import de 005
 * l'emporte avec lui. Le filtre ici n'est donc pas une réparation, c'est la
 * garantie qu'une base à moitié migrée ne fait pas tomber la page.
 */
function pairesDuTableau(
  force: ForceParTableau,
  equipe: readonly MembreDeLEquipe[],
  paires: readonly Paire[],
): readonly PaireDuTableau[] {
  const parLicence = new Map(equipe.map((membre) => [membre.licence as string, membre]));

  const rangees = paires.flatMap((paire) => {
    const [un, autre] = paire.licences.map((licence) => parLicence.get(licence));
    if (un === undefined || autre === undefined) return [];
    if (tableauDeLaPaire(un.sexe, autre.sexe) !== force.tableau) return [];

    const joueurs = [membreDePaire(un, force), membreDePaire(autre, force)] as const;
    const [coteDeLUn, coteDeLAutre] = [joueurs[0].cote, joueurs[1].cote];

    return [
      {
        id: paire.id,
        joueurs,
        privilegiee: paire.privilegiee,
        // Pas de moyenne dès qu'une cote manque : la moitié d'une paire ne dit
        // rien de sa force, et la remplacer par zéro la rangerait dernière —
        // exactement ce que 029 refuse de faire d'un joueur non classé.
        cote:
          coteDeLUn === null || coteDeLAutre === null ? null : (coteDeLUn + coteDeLAutre) / 2,
      },
    ];
  });

  // À la cote moyenne décroissante, puis sur le premier nom : deux paires de
  // même moyenne sont réellement à égalité, et un ordre arbitraire mais stable
  // vaut mieux qu'un ordre qui change à chaque rendu de page (029).
  return rangees.sort((un, autre) => {
    if (un.cote !== autre.cote) return (autre.cote ?? 0) - (un.cote ?? 0);
    return parNom(un.joueurs[0], autre.joueurs[0]);
  });
}

function membreDePaire(membre: MembreDeLEquipe, force: ForceParTableau): MembreDePaire {
  const classement = membre.classements.find(
    (candidat) => candidat.discipline === force.discipline,
  );

  return {
    licence: membre.licence,
    nom: membre.nom,
    fiche: membre.fiche,
    cote: classement?.cpph ?? null,
    lettre: classement?.lettre ?? null,
  };
}

/**
 * Un champ de saisie par place à pourvoir — spec 030.
 *
 * Le DH en réclame deux, tous deux masculins ; le MX un de chaque. Filtrer les
 * candidats par le sexe de la place est ce qui empêche de composer ici une
 * paire qui appartiendrait à un autre tableau — la même garantie que la
 * déduction, mais côté écran.
 *
 * Les candidats sont **toute l'équipe du bon sexe**, classés ou non : une paire
 * est une intention, et on peut vouloir essayer quelqu'un que la passe n'a pas
 * encore relevé.
 */
function emplacementsDe(
  places: readonly Places[],
  equipe: readonly MembreDeLEquipe[],
): readonly Emplacement[] {
  return places.flatMap(({ sexe, nombre }) => {
    const candidats = equipe
      .filter((membre) => membre.sexe === sexe)
      .map(({ licence, nom }) => ({ licence, nom }));

    return Array.from({ length: nombre }, () => ({ sexe, candidats }));
  });
}

/**
 * La paire telle qu'on la range en base : les deux licences dans l'ordre.
 *
 * « Dupont avec Martin » et « Martin avec Dupont » sont la même décision. Sans
 * cette mise en forme, l'index d'unicité ne verrait pas le doublon, et la page
 * afficherait deux fois la même paire.
 */
export function paireCanonique(
  un: Licence,
  autre: Licence,
): readonly [Licence, Licence] {
  return un < autre ? [un, autre] : [autre, un];
}

/**
 * Ce qu'on vérifie avant d'écrire une paire — spec 030.
 *
 * Tout ou rien, comme l'import de 005 : une paire à moitié valide n'est pas une
 * paire. Le tableau demandé est vérifié en plus des sexes, pour qu'une saisie
 * postée depuis la page du DD ne puisse pas y faire apparaître deux hommes.
 */
export function verifierLaPaire(options: {
  readonly licences: readonly string[];
  readonly tableau: Tableau;
  readonly equipe: readonly MembreDeLEquipe[];
}): readonly [Licence, Licence] {
  const { licences, tableau, equipe } = options;

  if (licences.length !== 2) {
    throw new PaireRefusee("Une paire est faite de deux joueurs, exactement.");
  }

  const membres = licences.map((licence) =>
    equipe.find((membre) => (membre.licence as string) === licence),
  );

  const [un, autre] = membres;
  if (un === undefined || autre === undefined) {
    throw new PaireRefusee(
      "Un des deux joueurs n'est pas dans l'équipe. La liste se met à jour par l'import, depuis l'écran des sources.",
    );
  }

  if (un.licence === autre.licence) {
    throw new PaireRefusee("Un joueur ne fait pas une paire avec lui-même.");
  }

  const deduit = tableauDeLaPaire(un.sexe, autre.sexe);
  if (deduit !== tableau) {
    throw new PaireRefusee(
      `Ces deux joueurs forment une paire de ${deduit}, pas de ${tableau} : le tableau se déduit des sexes, il ne se choisit pas.`,
    );
  }

  return paireCanonique(un.licence, autre.licence);
}
