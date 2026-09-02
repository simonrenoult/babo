import type { Discipline, Lettre } from "../../socle/core/classement.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { Tableau } from "../../socle/core/tableau.ts";
import { INTITULES, TABLEAUX } from "../../socle/core/tableau.ts";
import type { MembreDeLEquipe, Sexe } from "./coequipier.ts";
import { parNom } from "./coequipier.ts";

/**
 * L'équipe rangée tableau par tableau — spec 029.
 *
 * `/capitanat` liste des personnes ; une rencontre, elle, se joue en six matchs
 * répartis sur cinq tableaux. Ce fichier fait la bascule, et rien d'autre :
 * tout se dérive de ce qui est déjà en base — le sexe du CSV de 005, la cote et
 * la lettre de la passe de 028. Aucune saisie, aucune source nouvelle, aucune
 * table.
 *
 * **Un amendement à 028.** 028 refusait de dériver `SH` ou `SD` de « simple +
 * sexe », au motif que le sexe importé est une saisie manuelle et qu'en tirer
 * une série serait inventer une donnée fédérale. La dérivation est faite ici,
 * et c'est tenable pour une raison précise : elle ne présente aucun fait
 * fédéral, elle range des joueurs pour le capitaine qui a saisi ce sexe
 * lui-même. Les pages le disent. La cote et la lettre, elles, restent lues
 * telles quelles — jamais converties, jamais calculées (001).
 */

/**
 * Des places à pourvoir sur un tableau, pour un sexe donné.
 *
 * Le même type sert à dire ce qu'il faut et ce qui manque : un manque est une
 * exigence dont l'effectif ne couvre qu'une partie.
 */
export type Places = {
  readonly sexe: Sexe;
  readonly nombre: number;
};

type Exigence = {
  readonly discipline: Discipline;
  readonly matchs: number;
  readonly places: readonly Places[];
};

/**
 * Le format de la division actuelle : six matchs sur cinq tableaux — spec 029.
 *
 * Deux SH, un SD, un DH, un DD, un MX. Les places ne s'en déduisent pas : deux
 * SH sont deux matchs à un joueur chacun, un DH un seul match à deux joueurs,
 * et les deux réclament pourtant deux hommes.
 *
 * Écrit en dur, et la spec laisse la question ouverte : le jour où la division
 * change, ou bien ce format devient un réglage, ou bien c'est 011 qui portera
 * le règlement, format compris. En attendant, une constante que l'on relit
 * vaut mieux qu'un réglage que personne n'a jamais changé.
 */
const FORMAT: Record<Tableau, Exigence> = {
  SH: { discipline: "simple", matchs: 2, places: [{ sexe: "M", nombre: 2 }] },
  SD: { discipline: "simple", matchs: 1, places: [{ sexe: "F", nombre: 1 }] },
  DH: { discipline: "double", matchs: 1, places: [{ sexe: "M", nombre: 2 }] },
  DD: { discipline: "double", matchs: 1, places: [{ sexe: "F", nombre: 2 }] },
  MX: {
    discipline: "mixte",
    matchs: 1,
    places: [
      { sexe: "M", nombre: 1 },
      { sexe: "F", nombre: 1 },
    ],
  },
};

/** Un joueur que son sexe et son classement rendent alignable sur ce tableau. */
export type Alignable = {
  readonly licence: Licence;
  readonly nom: string | null;
  readonly sexe: Sexe;
  /** Lue sur myffbad, affichée telle quelle : la page ne convertit rien (001). */
  readonly lettre: Lettre;
  readonly cpph: number;
  readonly fiche: string;
};

/**
 * Un joueur du bon sexe, mais sans classement dans la discipline — spec 029.
 *
 * Il est écarté de l'ordre de force et nommé à part, jamais rangé dernier : en
 * début de saison, un joueur sans classement est presque toujours une licence
 * fausse, pas un joueur faible. Le confondre avec le plus faible de l'équipe
 * ferait disparaître exactement l'anomalie qu'on veut voir.
 */
export type Ecarte = {
  readonly licence: Licence;
  readonly nom: string | null;
  readonly sexe: Sexe;
  readonly fiche: string;
  /**
   * `jamais-releve` : aucune passe n'a abouti pour cette licence — c'est le cas
   * qui sent la licence fausse. `discipline-absente` : le joueur est relevé,
   * mais la fiche ne porte rien dans cette discipline, qu'il n'a donc jamais
   * jouée en compétition.
   */
  readonly motif: "jamais-releve" | "discipline-absente";
};

export type ForceParTableau = {
  readonly tableau: Tableau;
  readonly intitule: string;
  readonly discipline: Discipline;
  readonly matchs: number;
  /** Ce que le tableau réclame : deux hommes pour les deux SH, un de chaque pour le MX. */
  readonly places: readonly Places[];
  /** Du plus fort au plus faible, à la cote. */
  readonly alignables: readonly Alignable[];
  readonly ecartes: readonly Ecarte[];
  /**
   * Ce qui manque pour remplir le tableau, par sexe. Vide quand l'effectif
   * suffit. C'est un décompte, jamais une estimation : pas de verdict de
   * niveau, qui demanderait un seuil — et 001 a déjà refusé les seuils au motif
   * qu'ils produisent surtout de fausses alertes.
   */
  readonly manques: readonly Places[];
  /**
   * La passe la plus récente parmi les joueurs listés, ou `null` si aucun n'a
   * été relevé. Un ordre de force calculé sur un relevé de trois semaines n'est
   * pas faux, mais la page qui se tait là-dessus laisse croire qu'il est
   * d'aujourd'hui (001, 019).
   */
  readonly releveLe: Date | null;
};

/**
 * Les cinq tableaux, dans l'ordre de la feuille de match — spec 029.
 *
 * **Les cinq listes ne se cumulent pas.** Un joueur figure dans tous les
 * tableaux où il est éligible ; il ne fera pourtant pas les six matchs. Les
 * additionner surestimerait la profondeur de l'effectif, ce qui serait le pire
 * défaut d'un écran censé montrer des manques. Le plafond de matchs par joueur
 * relève de 011, qui compose vraiment ; ici, les pages le disent.
 */
export function forcesParTableau(equipe: readonly MembreDeLEquipe[]): readonly ForceParTableau[] {
  return TABLEAUX.map((tableau) => forceDuTableau(equipe, tableau));
}

export function forceDuTableau(
  equipe: readonly MembreDeLEquipe[],
  tableau: Tableau,
): ForceParTableau {
  const { discipline, matchs, places } = FORMAT[tableau];
  // Le sexe décide qui est concerné par le tableau ; le classement décide
  // seulement de la place dans l'ordre. Une femme n'est pas « écartée du DH
  // faute de classement » : elle n'y joue pas, et la nommer là serait un
  // reproche adressé à la mauvaise personne.
  const concernes = equipe.filter((membre) => places.some(({ sexe }) => sexe === membre.sexe));

  const alignables: Alignable[] = [];
  const ecartes: Ecarte[] = [];

  for (const membre of concernes) {
    const classement = membre.classements.find((candidat) => candidat.discipline === discipline);

    if (classement === undefined) {
      ecartes.push({
        licence: membre.licence,
        nom: membre.nom,
        sexe: membre.sexe,
        fiche: membre.fiche,
        motif: membre.nom === null ? "jamais-releve" : "discipline-absente",
      });
      continue;
    }

    alignables.push({
      licence: membre.licence,
      nom: membre.nom,
      sexe: membre.sexe,
      lettre: classement.lettre,
      cpph: classement.cpph,
      fiche: membre.fiche,
    });
  }

  alignables.sort(parForce);
  ecartes.sort(parNom);

  return {
    tableau,
    intitule: INTITULES[tableau],
    discipline,
    matchs,
    places,
    alignables,
    ecartes,
    manques: places.flatMap(({ sexe, nombre }) => {
      const disponibles = alignables.filter((joueur) => joueur.sexe === sexe).length;
      return disponibles >= nombre ? [] : [{ sexe, nombre: nombre - disponibles }];
    }),
    releveLe: laPlusRecente(concernes),
  };
}

/**
 * La cote décroissante, puis le tri de 028 — spec 029.
 *
 * Le CPPH est la seule mesure de force que la source donne, et deux joueurs à
 * la même cote sont réellement à égalité : les départager par le nom est
 * arbitraire, mais un ordre arbitraire et stable vaut mieux qu'un ordre qui
 * change à chaque rendu de page.
 */
function parForce(un: Alignable, autre: Alignable): number {
  if (un.cpph !== autre.cpph) return autre.cpph - un.cpph;
  return parNom(un, autre);
}

function laPlusRecente(membres: readonly MembreDeLEquipe[]): Date | null {
  const dates = membres.flatMap(({ vuLe }) => (vuLe === null ? [] : [vuLe.getTime()]));
  return dates.length === 0 ? null : new Date(Math.max(...dates));
}
