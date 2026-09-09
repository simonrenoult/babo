import type { Discipline } from "./classement.ts";
import type { Horloge } from "./horloge.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";
import type { Categorie, DepotTournois, TournoiDeLaRecherche } from "./tournoi.ts";

/** Le nom sous lequel les veilles consignent — spec 012, une tâche pour toutes. */
export function tacheDesVeilles(): string {
  return "acquisition:badnet:veilles";
}

/**
 * Une recherche à répéter chaque jour — spec 012.
 *
 * **Le socle ne connaît pas les veilles**, et c'est voulu : une veille est une
 * notion de la feature `veille`, avec son nom, son état et ses critères de
 * lecture. Ce que le socle reçoit, c'est ce qu'il faut demander à badnet — un
 * identifiant pour ranger le résultat, un intitulé pour le rapport, et les
 * seuls critères que le formulaire sait filtrer. C'est le point de composition
 * qui traduit les unes vers les autres, comme il le fait déjà des licences
 * suivies de 028.
 *
 * Ce qui n'est **pas** ici est aussi éloquent : ni série, ni tableau, ni
 * fenêtre de dates. La sonde du 8 septembre 2026 n'a pas su établir ce que
 * filtrent les cases de classement de badnet, et il ne distingue pas SH de SD.
 * Ces critères-là se lisent en local, sur ce que la passe a rangé.
 */
export type RechercheDeTournois = {
  /** Celui de la veille qui la demande : c'est sous lui que l'appartenance se range. */
  readonly id: number;
  /** Son nom, tel que le rapport le citera — « DH avec Louis ». */
  readonly intitule: string;
  readonly autourDe: { readonly longitude: number; readonly latitude: number };
  readonly rayonKm: number;
  readonly disciplines: readonly Discipline[];
  readonly categories: readonly Categorie[];
};

/**
 * Ce que la recherche publique rend, et ce qu'elle **annonce** — spec 012.
 *
 * Les deux nombres diffèrent, et l'écart est une information : `data-markers`
 * ne porte que les tournois géolocalisés — 46 sur 54 au rayon 50 —, les absents
 * étant ceux dont le lieu n'est pas géocodable. On les ignore, faute de pouvoir
 * les filtrer à la distance, mais le jour où badnet cesse de géolocaliser, le
 * rapport doit le dire plutôt que de laisser l'index maigrir en silence (019).
 */
export type ResultatDeRecherche = {
  readonly tournois: readonly TournoiDeLaRecherche[];
  readonly annonces: number | null;
};

export type AccesALaRecherche = {
  chercher(recherche: RechercheDeTournois): Promise<ResultatDeRecherche>;
};

/**
 * Ce qu'une veille voit, et depuis quand — spec 012.
 *
 * **La seule chose qui lui appartienne en propre.** Le tournoi est partagé : le
 * même apparaîtra dans trois veilles sur cinq, et en garder trois exemplaires
 * ferait trois villes du même fait — l'argument que 002 a écrit en séparant
 * `tournoi` d'`engagement`.
 */
export type DepotAppartenances = {
  /**
   * Constate ce qu'une veille voit aujourd'hui, et rend ce qui a bougé.
   *
   * Une sortie est **datée, pas effacée** : avec une requête par veille,
   * l'absence a deux sens — le tournoi est annulé, ou il ne répond plus aux
   * critères de celle-ci. Seule une appartenance datée les distingue, et c'est
   * elle qui garde les rappels de 014 quand je resserre un rayon, et qui
   * empêche un tournoi qui sort puis rentre de réalerter (013).
   */
  constater(
    veille: number,
    evenements: readonly number[],
    quand: Date,
  ): { readonly entres: readonly number[]; readonly sortis: readonly number[] };
  /** Ce qu'une veille voit en ce moment, les sortis exclus. */
  tournoisDe(veille: number): readonly number[];
};

/**
 * La passe qui relève les veilles — spec 012.
 *
 * **Une requête par veille active, une tâche pour toutes.** Cinq requêtes par
 * jour : le volume ne justifiait pas d'indexer la France entière pour filtrer
 * ensuite, et une collecte par veille garde « nouveau » au sens de 013 —
 * publié depuis hier, et non nouveau pour mes réglages du jour.
 *
 * **L'échec est ligne à ligne**, comme la passe de classement : « 4 veilles sur
 * 5, "Tournois en région" muette ». Sans cela, une veille dont les coordonnées
 * sont fausses priverait les quatre autres de leur relevé quotidien.
 *
 * Elle ne lève rien : toute panne devient un rapport (019).
 */
export async function releverLesVeilles(options: {
  readonly recherches: readonly RechercheDeTournois[];
  readonly tournois: DepotTournois;
  readonly appartenances: DepotAppartenances;
  readonly rapports: DepotRapports;
  readonly horloge: Horloge;
  readonly acces: AccesALaRecherche;
}): Promise<RapportArchive> {
  const { recherches, tournois, appartenances, rapports, horloge, acces } = options;
  const demarreLe = horloge.maintenant();

  const consigner = (
    issue: "succes" | "echec",
    volumeExtrait: number,
    detail: string,
  ): RapportArchive =>
    rapports.consigner({
      tache: tacheDesVeilles(),
      demarreLe,
      termineLe: horloge.maintenant(),
      issue,
      volumeExtrait,
      detail,
    });

  // Aucune veille active n'est pas une panne : c'est un choix, celui de les
  // avoir toutes suspendues. La passe le dit plutôt que de se taire, faute de
  // quoi le battement du lundi la croirait morte (019).
  if (recherches.length === 0) {
    return consigner("succes", 0, "aucune veille active");
  }

  const dits: string[] = [];
  const manques: string[] = [];
  let vus = 0;

  for (const recherche of recherches) {
    try {
      const { tournois: trouves, annonces } = await acces.chercher(recherche);
      const quand = horloge.maintenant();
      tournois.enregistrerDepuisLaRecherche(trouves, quand);
      const { entres, sortis } = appartenances.constater(
        recherche.id,
        trouves.map(({ evenement }) => evenement),
        quand,
      );
      vus += trouves.length;
      dits.push(
        `« ${recherche.intitule} » : ${trouves.length} tournoi(s)` +
          ecartAnnonce(annonces, trouves.length) +
          mouvements(entres.length, sortis.length),
      );
    } catch (erreur) {
      manques.push(`« ${recherche.intitule} » muette : ${message(erreur)}`);
    }
  }

  const detail = [
    `${dits.length} veille(s) relevée(s) sur ${recherches.length}`,
    ...dits,
    ...manques,
  ].join(" — ");

  // Une seule veille qui répond suffit à faire une passe réussie : les autres
  // ont leur ligne dans le détail, et un échec global masquerait ce qui marche.
  return dits.length === 0 ? consigner("echec", 0, detail) : consigner("succes", vus, detail);
}

/**
 * L'écart entre ce que badnet annonce et ce qu'il place sur sa carte.
 *
 * Tu ne le lis que quand il existe : l'écrire à chaque ligne en ferait un
 * élément de décor, ce que 019 reproche déjà au « donnée fraîche » permanent.
 */
function ecartAnnonce(annonces: number | null, rendus: number): string {
  if (annonces === null || annonces === rendus) return "";
  return ` (${annonces} annoncé(s), ${rendus} géolocalisé(s))`;
}

function mouvements(entres: number, sortis: number): string {
  if (entres === 0 && sortis === 0) return "";
  const parties = [entres === 0 ? "" : `${entres} nouveau(x)`, sortis === 0 ? "" : `${sortis} sorti(s)`];
  return `, ${parties.filter((partie) => partie !== "").join(" et ")}`;
}

function message(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}
