import type { Discipline } from "../../socle/core/classement.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { MembreDeLEquipe, Sexe } from "./coequipier.ts";
import { designations } from "./coequipier.ts";
import type { Reponse } from "./disponibilite.ts";

/**
 * La composition d'une journée d'interclub — spec 011.
 *
 * Six matchs : deux simples hommes, un simple dames, un double hommes, un
 * double dames, un double mixte. Neuf places, chacune réservée à un sexe.
 *
 * Trois règles, et elles seules :
 *
 * - **seul un joueur disponible se sélectionne** — « oui » ou « si besoin »
 *   au sondage de la journée (008) ;
 * - **deux matchs au plus par joueur** sur la rencontre ;
 * - **le SH1 n'a pas une moyenne inférieure à celle du SH2**, la moyenne étant
 *   le CPPH de simple.
 *
 * Un assistant, pas un solveur : le capitaine compose, l'outil vérifie (011).
 * Une composition incomplète s'enregistre — on planifie en plusieurs fois —,
 * une composition qui enfreint une règle, jamais.
 */
export type Match = "SH1" | "SH2" | "SD" | "DH" | "DD" | "MX";

export type Poste = {
  /** Le nom du champ, et la clé en base : « DH-1 », « MX-F ». */
  readonly id: string;
  readonly match: Match;
  readonly sexe: Sexe;
  /** La discipline dont le CPPH s'affiche à côté du nom. */
  readonly discipline: Discipline;
};

export const MATCHS: readonly { readonly match: Match; readonly intitule: string }[] = [
  { match: "SH1", intitule: "Simple hommes 1" },
  { match: "SH2", intitule: "Simple hommes 2" },
  { match: "SD", intitule: "Simple dames" },
  { match: "DH", intitule: "Double hommes" },
  { match: "DD", intitule: "Double dames" },
  { match: "MX", intitule: "Double mixte" },
];

export const POSTES: readonly Poste[] = [
  { id: "SH1", match: "SH1", sexe: "M", discipline: "simple" },
  { id: "SH2", match: "SH2", sexe: "M", discipline: "simple" },
  { id: "SD", match: "SD", sexe: "F", discipline: "simple" },
  { id: "DH-1", match: "DH", sexe: "M", discipline: "double" },
  { id: "DH-2", match: "DH", sexe: "M", discipline: "double" },
  { id: "DD-1", match: "DD", sexe: "F", discipline: "double" },
  { id: "DD-2", match: "DD", sexe: "F", discipline: "double" },
  { id: "MX-F", match: "MX", sexe: "F", discipline: "mixte" },
  { id: "MX-H", match: "MX", sexe: "M", discipline: "mixte" },
];

export function estUnPoste(valeur: string): boolean {
  return POSTES.some(({ id }) => id === valeur);
}

export const MATCHS_PAR_JOUEUR = 2;

/** Poste → licence ; un poste absent est une place encore vide. */
export type Composition = ReadonlyMap<string, Licence>;

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotCompositions = {
  lire(journee: number): Composition;
  /** Remplace la composition de la journée entière ; une composition vide l'efface. */
  enregistrer(journee: number, composition: Composition): void;
  /** Les journées qui ont au moins une place remplie. */
  journeesComposees(): ReadonlySet<number>;
  /** Toutes les compositions, par journée. */
  toutes(): ReadonlyMap<number, Composition>;
};

/** Un joueur qu'on peut sélectionner sur un poste, et pourquoi il le peut. */
export type Candidat = {
  readonly membre: MembreDeLEquipe;
  readonly reponse: Extract<Reponse, "oui" | "si-besoin">;
  /** Le CPPH dans la discipline du poste, `null` s'il n'y est pas classé. */
  readonly cote: number | null;
};

/**
 * Les joueurs sélectionnables sur un poste : du bon sexe, et disponibles ou
 * « si besoin » à cette journée. Les disponibles d'abord, puis à la cote.
 */
export function candidatsAuPoste(
  poste: Poste,
  membres: readonly MembreDeLEquipe[],
  reponses: ReadonlyMap<Licence, Reponse>,
): readonly Candidat[] {
  return membres
    .flatMap((membre) => {
      const reponse = reponses.get(membre.licence);
      if (membre.sexe !== poste.sexe || (reponse !== "oui" && reponse !== "si-besoin")) return [];
      return [{ membre, reponse, cote: coteDe(membre, poste.discipline) }];
    })
    .toSorted(
      (un, autre) =>
        Number(un.reponse === "si-besoin") - Number(autre.reponse === "si-besoin") ||
        (autre.cote ?? -1) - (un.cote ?? -1),
    );
}

/**
 * Ce qui rend la composition irrecevable, en mots. Vide : elle s'enregistre.
 *
 * Une place vide n'est pas une faute : on planifie en plusieurs fois, et
 * `placesVides` le dit à part.
 */
/**
 * Une règle enfreinte, et les matchs qu'elle touche.
 *
 * Les matchs sont ce qui permet à la page de marquer la bonne carte : un
 * joueur qui en joue trois les désigne tous les trois, un SH1 plus faible que
 * le SH2 désigne les deux simples.
 */
export type Faute = { readonly message: string; readonly matchs: readonly Match[] };

export function fautesDeLaComposition(
  composition: Composition,
  membres: readonly MembreDeLEquipe[],
  reponses: ReadonlyMap<Licence, Reponse>,
): readonly string[] {
  return fautesParMatch(composition, membres, reponses).map(({ message }) => message);
}

export function fautesParMatch(
  composition: Composition,
  membres: readonly MembreDeLEquipe[],
  reponses: ReadonlyMap<Licence, Reponse>,
): readonly Faute[] {
  const fautes: Faute[] = [];
  const faute = (message: string, ...matchs: Match[]) => fautes.push({ message, matchs });
  const parLicence = new Map(membres.map((membre) => [membre.licence, membre]));
  const nom = (licence: Licence) => parLicence.get(licence)?.nom ?? licence;

  for (const poste of POSTES) {
    const licence = composition.get(poste.id);
    if (licence === undefined) continue;
    const membre = parLicence.get(licence);
    if (membre === undefined) {
      faute(`${intituleDu(poste)} : ${licence} n'est plus dans l'équipe.`, poste.match);
      continue;
    }
    if (membre.sexe !== poste.sexe) {
      faute(`${intituleDu(poste)} : ${nom(licence)} n'y a pas sa place.`, poste.match);
    }
    const reponse = reponses.get(licence);
    if (reponse !== "oui" && reponse !== "si-besoin") {
      faute(
        `${intituleDu(poste)} : ${nom(licence)} n'est pas disponible à cette journée (${
          reponse === "non" ? "a répondu non" : "pas de réponse au sondage"
        }).`,
        poste.match,
      );
    }
  }

  // Un joueur deux fois dans le même double n'est pas deux matchs, c'est une
  // paire impossible : on le dit comme tel.
  for (const match of ["DH", "DD"] as const) {
    const [un, autre] = POSTES.filter((poste) => poste.match === match).map(({ id }) => composition.get(id));
    if (un !== undefined && un === autre) {
      faute(`${intituleDuMatch(match)} : ${nom(un)} ne fait pas une paire à lui seul.`, match);
    }
  }

  const matchsDe = new Map<Licence, Set<Match>>();
  for (const poste of POSTES) {
    const licence = composition.get(poste.id);
    if (licence === undefined) continue;
    matchsDe.set(licence, (matchsDe.get(licence) ?? new Set()).add(poste.match));
  }
  for (const [licence, matchs] of matchsDe) {
    if (matchs.size > MATCHS_PAR_JOUEUR) {
      faute(
        `${nom(licence)} joue ${matchs.size} matchs (${[...matchs].join(", ")}) : ${MATCHS_PAR_JOUEUR} au plus par rencontre.`,
        ...matchs,
      );
    }
  }

  const sh1 = composition.get("SH1");
  const sh2 = composition.get("SH2");
  if (sh1 !== undefined && sh2 !== undefined && sh1 !== sh2) {
    const cote1 = coteOuZero(parLicence.get(sh1), "simple");
    const cote2 = coteOuZero(parLicence.get(sh2), "simple");
    if (cote1 < cote2) {
      faute(
        `Le SH1 (${nom(sh1)}, ${cote1.toLocaleString("fr-FR")} points) a une moyenne inférieure au SH2 (${nom(sh2)}, ${cote2.toLocaleString("fr-FR")} points) : les inverser.`,
        "SH1",
        "SH2",
      );
    }
  }

  return fautes;
}

/**
 * La composition en texte, à coller dans la discussion de l'équipe.
 *
 * Une ligne par match où quelqu'un est retenu, en liste WhatsApp (« * »), et
 * rien d'autre : ni classement ni cote, c'est une convocation. Chacun y est
 * désigné par son prénom, sauf quand deux membres le partagent.
 */
export function texteDeLaComposition(composition: Composition, membres: readonly MembreDeLEquipe[]): string {
  const noms = designations(membres);
  return MATCHS.flatMap(({ match }) => {
    const retenus = POSTES.filter((poste) => poste.match === match).flatMap(({ id }) => {
      const licence = composition.get(id);
      return licence === undefined ? [] : [noms.get(licence) ?? licence];
    });
    return retenus.length === 0 ? [] : [`* ${match} : ${retenus.join(" & ")}`];
  }).join("\n");
}

export function placesVides(composition: Composition): number {
  return POSTES.filter(({ id }) => !composition.has(id)).length;
}

/** Combien de matchs chaque joueur retenu joue sur la rencontre. */
export function matchsParJoueur(composition: Composition): ReadonlyMap<Licence, number> {
  const matchs = new Map<Licence, Set<Match>>();
  for (const poste of POSTES) {
    const licence = composition.get(poste.id);
    if (licence !== undefined) matchs.set(licence, (matchs.get(licence) ?? new Set()).add(poste.match));
  }
  return new Map([...matchs].map(([licence, ensemble]) => [licence, ensemble.size]));
}

export function coteDe(membre: MembreDeLEquipe, discipline: Discipline): number | null {
  return membre.classements.find((classement) => classement.discipline === discipline)?.cpph ?? null;
}

/** Un joueur non classé en simple n'a pas de moyenne : il compte pour zéro. */
function coteOuZero(membre: MembreDeLEquipe | undefined, discipline: Discipline): number {
  return membre === undefined ? 0 : (coteDe(membre, discipline) ?? 0);
}

function intituleDu(poste: Poste): string {
  return intituleDuMatch(poste.match);
}

function intituleDuMatch(match: Match): string {
  return MATCHS.find((candidat) => candidat.match === match)?.intitule ?? match;
}

/** Une ligne de la feuille de rencontre officielle : un match et ses joueurs. */
export type LigneDeFeuille = {
  readonly match: "SH1" | "SH2" | "SD1" | "DH1" | "DD1" | "DX1";
  /** Un joueur pour un simple, deux pour un double ; `null` pour une place vide. */
  readonly joueurs: readonly (JoueurDeFeuille | null)[];
};

export type JoueurDeFeuille = {
  /** « 07194591 - Simon RENOULT » : la forme de la feuille, licence d'abord. */
  readonly identite: string;
  readonly classement: string;
  readonly cote: string;
};

/**
 * La composition, dans l'ordre et sous les intitulés de la feuille d'icbad :
 * SH1, SH2, SD1, DH1, DD1, DX1 — l'homme d'abord au mixte. Classement et cote
 * sont ceux de la discipline du match ; un joueur qui n'y est pas classé est
 * « NC », sans cote.
 */
export function lignesDeLaFeuille(
  composition: Composition,
  membres: readonly MembreDeLEquipe[],
): readonly LigneDeFeuille[] {
  const joueur = (poste: string, discipline: Discipline): JoueurDeFeuille | null => {
    const licence = composition.get(poste);
    if (licence === undefined) return null;
    const membre = membres.find((candidat) => candidat.licence === licence);
    const classement = membre?.classements.find((candidat) => candidat.discipline === discipline);
    return {
      identite: `${licence} - ${membre?.nom ?? ""}`.trim(),
      classement: classement?.lettre ?? "NC",
      cote: classement === undefined ? "" : classement.cpph.toLocaleString("fr-FR"),
    };
  };

  return [
    { match: "SH1", joueurs: [joueur("SH1", "simple")] },
    { match: "SH2", joueurs: [joueur("SH2", "simple")] },
    { match: "SD1", joueurs: [joueur("SD", "simple")] },
    { match: "DH1", joueurs: [joueur("DH-1", "double"), joueur("DH-2", "double")] },
    { match: "DD1", joueurs: [joueur("DD-1", "double"), joueur("DD-2", "double")] },
    { match: "DX1", joueurs: [joueur("MX-H", "mixte"), joueur("MX-F", "mixte")] },
  ];
}

/**
 * Combien de fois un joueur a été retenu, sur combien d'occasions — spec 009.
 *
 * Une occasion est une **autre** journée déjà composée où il avait répondu oui
 * ou si besoin : une journée pas encore composée ne dit rien de l'usage qu'on
 * fait de lui, et la compter ferait passer tout le monde pour sous-utilisé.
 * **Un « si besoin » ne vaut qu'une demi-occasion** : ne pas retenir celui qui
 * ne se proposait qu'en renfort n'est pas le sous-utiliser à moitié autant
 * que celui qui avait dit oui.
 * Une sélection est une de ces journées où il figure, un ou deux tableaux
 * comptant pour une.
 */
export type Sollicitation = { readonly selections: number; readonly occasions: number };

export function sollicitations(options: {
  /** La journée qu'on compose : elle ne compte pas. Absente, toutes comptent. */
  readonly journee?: number;
  readonly compositions: ReadonlyMap<number, Composition>;
  readonly reponsesDe: (journee: number) => ReadonlyMap<Licence, Reponse>;
}): ReadonlyMap<Licence, Sollicitation> {
  const compte = new Map<Licence, { selections: number; occasions: number }>();
  for (const [journee, composition] of options.compositions) {
    if (journee === options.journee || composition.size === 0) continue;
    const retenus = new Set(composition.values());
    for (const [licence, reponse] of options.reponsesDe(journee)) {
      if (reponse === "non") continue;
      const courant = compte.get(licence) ?? { selections: 0, occasions: 0 };
      courant.occasions += reponse === "si-besoin" ? 0.5 : 1;
      if (retenus.has(licence)) courant.selections += 1;
      compte.set(licence, courant);
    }
  }
  return compte;
}
