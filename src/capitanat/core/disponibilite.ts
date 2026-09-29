import type { Licence } from "../../socle/core/licence.ts";
import type { CalendrierDInterclub, Rencontre } from "./calendrier.ts";
import type { MembreDeLEquipe, MotifDeRefus, Sexe } from "./coequipier.ts";

/**
 * Les disponibilités aux interclubs — spec 008.
 *
 * La collecte se fait hors de l'outil, par un sondage (Framadate, tableur) :
 * c'est la solution que 008 retient. Babo en lit l'export CSV et le consolide
 * à côté du calendrier, rencontre par rencontre.
 *
 * **Le sondage parle en prénoms et en surnoms** — « Simon », « Madoche » —, pas
 * en licences. Chaque nom du sondage est donc un *répondant*, que le capitaine
 * rattache une fois pour toutes à un membre de l'équipe. Rien n'est rattaché en
 * silence : une heuristique sur des noms propres échoue sans prévenir (028),
 * et une disponibilité attribuée à la mauvaise personne ne se voit qu'au
 * moment de composer. Le prénom sert seulement à *proposer* un rattachement.
 */
export const REPONSES = ["oui", "si-besoin", "non"] as const;

export type Reponse = (typeof REPONSES)[number];

/** Une colonne du sondage : une journée, et la date qu'il lui donne. */
export type JourneeSondee = {
  readonly journee: number;
  /** « 2026-11-05 » : comparée au calendrier, jamais affichée. */
  readonly date: string;
};

export type ReponsesDUnRepondant = {
  /** Le nom tel que le sondage l'écrit, sans sa remarque. */
  readonly nom: string;
  /** Ce qui suivait le nom entre parenthèses : « qui est blessée… ». */
  readonly remarque: string | null;
  /** Une réponse par journée ; une case vide n'est pas une réponse. */
  readonly reponses: ReadonlyMap<number, Reponse>;
};

export type Sondage = {
  readonly journees: readonly JourneeSondee[];
  readonly repondants: readonly ReponsesDUnRepondant[];
};

export type Repondant = {
  readonly nom: string;
  readonly remarque: string | null;
  /** Le membre auquel le capitaine l'a rattaché, ou `null`. */
  readonly licence: Licence | null;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotDisponibilites = {
  /**
   * Remplace les réponses des journées que le sondage couvre, et elles seules.
   *
   * Un sondage J1-J5 puis un sondage J6-J10 s'additionnent ; réimporter J1-J5
   * corrigé remplace J1-J5 entier — un répondant qui a disparu du fichier n'y
   * garde pas ses anciennes réponses. Les rattachements survivent : ils
   * tiennent au nom, pas au fichier.
   */
  enregistrer(sondage: Sondage): void;
  repondants(): readonly Repondant[];
  reponses(): readonly { readonly nom: string; readonly journee: number; readonly reponse: Reponse }[];
  rattacher(nom: string, licence: Licence | null): void;
};

export class DisponibilitesRefusees extends Error {
  readonly motifs: readonly MotifDeRefus[];

  constructor(motifs: readonly MotifDeRefus[]) {
    super(`Import des disponibilités refusé : ${motifs.length} anomalie(s), rien n'a été écrit.`);
    this.name = "DisponibilitesRefusees";
    this.motifs = motifs;
  }
}

/**
 * Le sondage parle-t-il du même calendrier ?
 *
 * Il désigne ses colonnes par journée *et* par date. La journée rattache ; la
 * date contrôle : un sondage d'une autre équipe ou d'une autre saison a ses
 * J1 à d'autres dates, et l'importer mettrait des réponses en face des
 * mauvaises rencontres. Le code adverse, lui, n'est pas comparé — le sondage
 * l'abrège à sa façon (« AC15-2 » pour 75-AC1-2).
 */
export function verifierContreLeCalendrier(
  sondage: Sondage,
  calendrier: CalendrierDInterclub | null,
): readonly MotifDeRefus[] {
  if (calendrier === null) {
    return [
      {
        ligne: null,
        raison: "aucun calendrier importé : les journées du sondage n'ont rien en face. Importer d'abord le calendrier.",
      },
    ];
  }

  return sondage.journees.flatMap(({ journee, date }) => {
    const rencontre = calendrier.rencontres.find((candidate) => candidate.journee === journee);
    if (rencontre === undefined) {
      return [{ ligne: 1, raison: `J${journee} n'existe pas dans le calendrier de ${calendrier.equipe.nom}.` }];
    }
    const prevue = jourDe(rencontre.debut);
    return prevue === date
      ? []
      : [
          {
            ligne: 1,
            raison: `J${journee} est datée du ${lisible(date)} dans le sondage, du ${lisible(prevue)} au calendrier : ce n'est pas le même calendrier, ou la rencontre a été déplacée — réimporter le calendrier d'abord.`,
          },
        ];
  });
}

/**
 * Le membre qu'on propose pour un nom de sondage : celui dont le prénom relevé
 * est ce nom, s'il est seul. Une proposition, jamais un rattachement.
 */
export function suggestionPour(nom: string, membres: readonly MembreDeLEquipe[]): Licence | null {
  const cherche = normaliser(nom);
  const candidats = membres.filter(
    (membre) => membre.nom !== null && normaliser(membre.nom.split(/\s+/u)[0] ?? "") === cherche,
  );
  return candidats.length === 1 ? (candidats[0]?.licence ?? null) : null;
}

export type DecompteParSexe = Readonly<Record<Sexe, number>>;

export type ColonneDeLaGrille = {
  readonly rencontre: Rencontre;
  /** Les répondants rattachés qui ont dit oui, par sexe : c'est ce qui compose. */
  readonly disponibles: DecompteParSexe;
  readonly siBesoin: DecompteParSexe;
  /** Oui ou si besoin, sans membre rattaché : comptés à part, faute de sexe. */
  readonly nonRattaches: number;
  readonly sondee: boolean;
};

export type LigneDeLaGrille = {
  readonly nom: string;
  readonly remarque: string | null;
  readonly membre: MembreDeLEquipe | null;
  readonly reponses: ReadonlyMap<number, Reponse>;
};

export type GrilleDesDisponibilites = {
  readonly colonnes: readonly ColonneDeLaGrille[];
  readonly lignes: readonly LigneDeLaGrille[];
  /** Les membres de l'équipe qu'aucun répondant ne désigne. */
  readonly silencieux: readonly MembreDeLEquipe[];
};

export function grilleDesDisponibilites(options: {
  readonly calendrier: CalendrierDInterclub;
  readonly membres: readonly MembreDeLEquipe[];
  readonly repondants: readonly Repondant[];
  readonly reponses: readonly { readonly nom: string; readonly journee: number; readonly reponse: Reponse }[];
}): GrilleDesDisponibilites {
  const { calendrier, membres, repondants, reponses } = options;

  const lignes: LigneDeLaGrille[] = repondants.map((repondant) => ({
    nom: repondant.nom,
    remarque: repondant.remarque,
    membre: membres.find((membre) => membre.licence === repondant.licence) ?? null,
    reponses: new Map(
      reponses.filter(({ nom }) => nom === repondant.nom).map(({ journee, reponse }) => [journee, reponse]),
    ),
  }));

  const decompte = (journee: number, voulue: Reponse): DecompteParSexe => {
    const compte = { F: 0, M: 0 };
    for (const ligne of lignes) {
      if (ligne.membre !== null && ligne.reponses.get(journee) === voulue) compte[ligne.membre.sexe] += 1;
    }
    return compte;
  };

  const colonnes = calendrier.rencontres.map((rencontre) => ({
    rencontre,
    disponibles: decompte(rencontre.journee, "oui"),
    siBesoin: decompte(rencontre.journee, "si-besoin"),
    nonRattaches: lignes.filter(
      (ligne) => ligne.membre === null && ["oui", "si-besoin"].includes(ligne.reponses.get(rencontre.journee) ?? ""),
    ).length,
    sondee: lignes.some((ligne) => ligne.reponses.has(rencontre.journee)),
  }));

  const designes = new Set(repondants.flatMap(({ licence }) => (licence === null ? [] : [licence])));

  return {
    colonnes,
    lignes: lignes.toSorted((une, autre) => une.nom.localeCompare(autre.nom, "fr")),
    silencieux: membres.filter((membre) => !designes.has(membre.licence)),
  };
}

/** Sans casse ni accent : « Mélanie » et « MELANIE » sont le même prénom. */
export function normaliser(valeur: string): string {
  return valeur.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function jourDe(date: Date): string {
  const deux = (nombre: number) => String(nombre).padStart(2, "0");
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

function lisible(jour: string): string {
  const [annee, mois, date] = jour.split("-");
  return `${date}/${mois}/${annee}`;
}
