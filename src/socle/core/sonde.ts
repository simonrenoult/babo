import type { ClientHttp, ModuleDAcquisition, PageSondee } from "./acquisition.ts";
import {
  ActionIntrouvable,
  SessionMorte,
  recupererSousSession,
  tacheDAcquisition,
} from "./acquisition.ts";
import type { DepotJetonMyffbad } from "./jeton-myffbad.ts";
import type { DepotRapports, RapportExecution } from "./rapport-execution.ts";
import { issueDuVolume } from "./rapport-execution.ts";
import type { Horloge } from "./horloge.ts";
import type { Source } from "./source.ts";

/**
 * La sonde d'accès — spec 015.
 *
 * 015 fixe l'ordre : « une base minimale, puis la sonde d'accès jusqu'à
 * extraire un match et un tournoi réels, puis seulement le schéma définitif ».
 * Ceci est la deuxième marche. La sonde ne comprend rien de ce qu'elle
 * rapporte : elle va chercher les pages, les archive, et dit jusqu'où elle est
 * allée. C'est exactement ce qu'il faut pour dessiner la suite sans la deviner
 * — les captures qu'elle laisse sont les pages sur lesquelles les parseurs
 * s'écriront, et leurs fixtures.
 */
export const VERDICTS = ["atteinte", "mur-de-connexion", "action-introuvable", "echec"] as const;

export type Verdict = (typeof VERDICTS)[number];

export type ResultatDeSonde = {
  readonly source: Source;
  readonly page: PageSondee;
  readonly verdict: Verdict;
  readonly statutHttp: number | null;
  /** Taille de la capture, en octets. Une page de 400 octets n'est pas la page attendue. */
  readonly octets: number | null;
  /** Objets réellement extraits, quand le module sait les compter. */
  readonly extraits: number | null;
  readonly detail: string | null;
};

/**
 * Un plafond bas, parce qu'une sonde ne pagine pas : elle touche une poignée
 * de pages connues. Tout ce qui dépasse est une boucle, pas une sonde.
 */
const PLAFOND_PAR_SOURCE = 10;

export async function sonder(options: {
  readonly modules: readonly ModuleDAcquisition[];
  /** Un client par source : c'est lui qui porte l'archivage et le plafond de cette passe. */
  readonly clientPour: (source: Source, plafond: number) => ClientHttp;
  readonly jetons: DepotJetonMyffbad;
  readonly rapports: DepotRapports;
  readonly horloge: Horloge;
}): Promise<readonly ResultatDeSonde[]> {
  const { modules, clientPour, jetons, rapports, horloge } = options;
  const resultats: ResultatDeSonde[] = [];

  for (const module of modules) {
    const demarreLe = horloge.maintenant();
    const client = clientPour(module.source, PLAFOND_PAR_SOURCE);
    const jeton = jetons.lire(module.source);
    const pourCetteSource: ResultatDeSonde[] = [];

    for (const page of module.pagesDeLaSonde(jeton?.valeur ?? null)) {
      pourCetteSource.push(await sonderUnePage(client, module, page));
    }

    resultats.push(...pourCetteSource);
    const precedent = rapports.dernierRapport(tacheDAcquisition(module.source));
    rapports.consigner(
      rapportDeLaSonde(module.source, pourCetteSource, demarreLe, horloge, precedent?.volumeExtrait ?? null),
    );
  }

  return resultats;
}

async function sonderUnePage(
  client: ClientHttp,
  module: ModuleDAcquisition,
  page: PageSondee,
): Promise<ResultatDeSonde> {
  try {
    const reponse = await recupererSousSession(client, module, page);
    return {
      source: module.source,
      page,
      verdict: "atteinte",
      statutHttp: reponse.statutHttp,
      octets: Buffer.byteLength(reponse.contenu),
      extraits: page.extraire?.(reponse) ?? null,
      detail: reponse.url === page.requete.url ? null : `redirigée vers ${reponse.url}`,
    };
  } catch (erreur) {
    // Ni la session morte ni l'identifiant périmé ne sont des pannes de la
    // sonde : ce sont précisément les deux constats qu'elle est là pour faire,
    // et ils se réparent différemment. Elle continue sur les autres pages.
    const verdict: Verdict =
      erreur instanceof SessionMorte
        ? "mur-de-connexion"
        : erreur instanceof ActionIntrouvable
          ? "action-introuvable"
          : "echec";
    return {
      source: module.source,
      page,
      verdict,
      statutHttp: null,
      octets: null,
      extraits: null,
      detail: erreur instanceof Error ? erreur.message : String(erreur),
    };
  }
}

function rapportDeLaSonde(
  source: Source,
  resultats: readonly ResultatDeSonde[],
  demarreLe: Date,
  horloge: Horloge,
  volumePrecedent: number | null,
): RapportExecution {
  // Toute page manquée fait échouer la passe, mur de connexion compris : une
  // sonde ne visite que des pages qu'elle sait nommer, donc chacune compte.
  const manquees = resultats.filter(({ verdict }) => verdict !== "atteinte").length;

  // Le volume, c'est ce qui a été extrait — jamais le nombre de pages
  // atteintes (spec 019). Une page qui répond sans rien rendre est le mode de
  // panne le plus coûteux : elle passe pour un succès.
  const volumeExtrait = resultats.reduce((total, { extraits }) => total + (extraits ?? 0), 0);

  return {
    // Nommée d'après la source et non d'après la sonde : c'est cette tâche que
    // l'écran interroge pour l'ancienneté, et la passe de classement de 001
    // s'y consigne à son tour, sous le même nom.
    tache: tacheDAcquisition(source),
    demarreLe,
    termineLe: horloge.maintenant(),
    issue: manquees > 0 ? "echec" : issueDuVolume(volumeExtrait, volumePrecedent),
    volumeExtrait,
    detail: detailLisible(resultats),
  };
}

function detailLisible(resultats: readonly ResultatDeSonde[]): string {
  const manquees = resultats.filter(({ verdict }) => verdict !== "atteinte");
  if (manquees.length === 0) return "sonde : toutes les pages atteintes";
  const detail = manquees.map(({ page, verdict }) => `${page.intitule} : ${verdict}`).join(" ; ");
  return `sonde — ${detail}`;
}
