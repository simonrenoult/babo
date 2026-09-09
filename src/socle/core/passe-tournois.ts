import { tacheDesTournois } from "./acquisition.ts";
import type { DepotEngagements } from "./engagement.ts";
import type { Horloge } from "./horloge.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";
import type { DepotTournois, FicheDeTournoi } from "./tournoi.ts";

/**
 * La passe qui relève le lieu de mes tournois — spec 002.
 *
 * **Anonyme, et c'est sa propriété principale.** `/tournoi/public/informations`
 * ne demande aucune session : cette passe aboutit le jour où celle de badnet
 * est morte, comme la passe de classement depuis 028. C'est aussi pourquoi elle
 * porte un nom de tâche à elle — la consigner avec les engagements ferait
 * passer pour morte une chaîne qui va très bien.
 *
 * **Incrémentale.** Une ville ne change pas : relire douze fiches par jour pour
 * une donnée figée est exactement le genre de passe qui fait bannir un compte
 * (015). Elle ne demande que les tournois dont la fiche n'a jamais été relevée
 * — donc rien, la plupart des jours, et trois requêtes le lendemain d'une
 * inscription nouvelle.
 *
 * **Elle sert deux demandes depuis 012**, et non plus les seuls engagements :
 * une veille remplit l'index de tournois sans ville ni tableaux, et c'est cette
 * passe qui va les chercher. Deux passes se disputeraient les mêmes lignes et
 * relèveraient deux fois la même fiche le même matin.
 *
 * **Plafonnée.** Douze tournois par saison ne demandaient pas de borne ; une
 * veille large en apporte cent le premier jour, soit trois cents requêtes
 * d'affilée — la seule façon de se faire remarquer d'un site qui ne demandait
 * rien. Au-delà du plafond la passe s'arrête et dit ce qui reste ; le lendemain
 * reprend. La veille se remplit en deux ou trois jours, ce qui est sans
 * importance pour un catalogue à trois mois.
 *
 * Elle ne lève rien : toute panne devient un rapport (019).
 */
export type AccesAuxFichesPubliques = {
  ficheDe(evenement: number): Promise<FicheDeTournoi>;
};

/** Cent fiches, trois requêtes chacune : le plafond d'une passe polie. */
export const FICHES_PAR_PASSE = 100;

export async function releverLesTournois(options: {
  /**
   * Mes engagements : ce sont eux qui désignent les tournois à relever.
   *
   * La recherche publique de badnet est géographique — elle rend les tournois
   * d'un rayon, pas les miens. Partir des engagements est le seul chemin qui
   * réponde pour un tournoi où qu'il ait lieu.
   */
  readonly engagements: DepotEngagements;
  readonly tournois: DepotTournois;
  readonly rapports: DepotRapports;
  readonly horloge: Horloge;
  readonly acces: AccesAuxFichesPubliques;
}): Promise<RapportArchive> {
  const { engagements, tournois, rapports, horloge, acces } = options;
  const demarreLe = horloge.maintenant();

  const consigner = (
    issue: "succes" | "echec",
    volumeExtrait: number,
    detail: string,
  ): RapportArchive =>
    rapports.consigner({
      tache: tacheDesTournois(),
      demarreLe,
      termineLe: horloge.maintenant(),
      issue,
      volumeExtrait,
      detail,
    });

  const connus = tournois.connus();
  // Les deux demandes réunies, dédoublonnées : mes engagements, qui peuvent
  // désigner un tournoi dont aucune ligne n'existe encore, et les tournois que
  // les veilles ont indexés sans fiche.
  const demandes = [
    ...new Set([
      ...engagements.tous().map(({ evenement }) => evenement),
      ...tournois.sansFiche(),
    ]),
  ].filter((evenement) => !connus.has(evenement));

  const aRelever = demandes.slice(0, FICHES_PAR_PASSE);
  const reportees = demandes.length - aRelever.length;

  // Rien à faire n'est pas rien à dire : une passe d'acquisition muette est
  // indistinguable d'une passe morte, et c'est le trou que 019 a passé une spec
  // entière à boucher. Elle consigne donc, plutôt que de rendre `null`.
  if (aRelever.length === 0) {
    return consigner("succes", 0, `${connus.size} tournoi(s) connu(s), aucun à relever`);
  }

  const releves: number[] = [];
  const manques: string[] = [];

  for (const evenement of aRelever) {
    try {
      tournois.enregistrerLaFiche(await acces.ficheDe(evenement), horloge.maintenant());
      releves.push(evenement);
    } catch (erreur) {
      // Une fiche muette n'arrête pas la passe : c'est la clémence de 027 et
      // 028, et elle vaut ici pour la même raison — un tournoi dont la page a
      // changé ne doit pas priver les autres de leur ville.
      manques.push(`${evenement} : ${message(erreur)}`);
    }
  }

  const detail =
    `${releves.length} fiche(s) relevée(s) sur ${aRelever.length}` +
    (reportees === 0 ? "" : `, ${reportees} reportée(s) au lendemain`) +
    (manques.length === 0 ? "" : ` — ${manques.join(" ; ")}`);

  return releves.length === 0
    ? consigner("echec", 0, detail)
    : consigner("succes", releves.length, detail);
}

function message(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}
