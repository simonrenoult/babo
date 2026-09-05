import type { DepotEngagements, Engagement, TableauEngage } from "../../socle/core/engagement.ts";
import type { DepotTournois, Tournoi } from "../../socle/core/tournoi.ts";
import { journeesLibellees } from "../../socle/core/tournoi.ts";

/**
 * Mes prochains tournois, tels que la page les montre — spec 002.
 *
 * Le module lit le dépôt et affiche : il ne parle jamais à badnet, c'est la
 * règle structurelle de 022. Ce que la passe de 027 a écrit sous session, il le
 * sert — et le lieu, qu'une seconde passe anonyme relèvera, viendra s'y poser
 * sans que cette lecture change.
 *
 * **Aucun signalement de chevauchement.** 002 le promettait ; il est retiré, et
 * le motif vaut d'être écrit. Sur une liste courte et triée par date, deux
 * tournois le même jour se voient à l'œil, et mieux qu'une règle : badnet ne
 * rend qu'une date sans durée, donc un signalement automatique dirait « rien »
 * d'un tournoi de trois jours qui en recouvre un autre, et « conflit » de deux
 * tableaux du même tournoi si on groupait naïvement. Un signalement qui se
 * trompe dans les deux sens est pire que pas de signalement du tout.
 */
export type ProchainTournoi = {
  readonly evenement: number;
  readonly nom: string;
  readonly date: Date;
  /**
   * La ville, `null` tant qu'aucune fiche publique n'a été relevée.
   *
   * `/competitions` ne la donne pas : elle vient de la fiche publique du
   * tournoi, relevée en anonyme par une passe distincte. Au premier temps de
   * 002 elle vaut `null` partout, et la page dit pourquoi en toutes lettres
   * plutôt que d'aligner des tirets muets (001).
   */
  readonly lieu: string | null;
  /**
   * Les dates telles que la page les écrit : « du 24 au 25 octobre » quand la
   * fiche publique a rendu les journées, la date unique de `/competitions`
   * sinon. Le tri, lui, reste sur cette date unique — la seule dont on
   * dispose toujours.
   */
  readonly quand: string;
  readonly tableaux: readonly TableauEngage[];
  /**
   * Ce que badnet dit de l'inscription, tel quel — « Inscription payée ».
   *
   * Aucune règle n'en est tirée, et c'est un choix, pas un report : 002 et 027
   * se sont renvoyé la question de savoir s'il fallait distinguer les
   * inscriptions en attente. Trois phrases observées sur un tournoi ne font pas
   * une taxonomie, et en inventer une à trois valeurs serait fabriquer une
   * échelle qui ne correspond à rien. On affiche ce que badnet dit.
   */
  readonly statut: string | null;
  /** La fiche badnet : c'est là qu'on modifie ou qu'on annule une inscription. */
  readonly fiche: string;
};

/**
 * La racine de badnet, répétée ici et non importée du module d'acquisition :
 * une feature ne connaît pas l'infrastructure du socle (022). C'est la
 * duplication que `capitanat` assume déjà pour la fiche myffbad d'un
 * coéquipier, plutôt que de creuser une passerelle entre une feature et
 * l'infrastructure d'un autre module.
 */
const FICHE_BADNET = "https://badnet.fr/joueur/tournoi?eventid=";

export function prochainsTournois(
  engagements: DepotEngagements,
  tournois: DepotTournois,
  maintenant: Date,
): readonly ProchainTournoi[] {
  const seuil = debutDuJour(maintenant);

  const aVenir = engagements
    .tous()
    .filter((engagement) => engagement.date.getTime() >= seuil.getTime())
    .sort(parDate);

  // Les lieux en une lecture plutôt qu'une par ligne : la page en affiche
  // douze au plus, mais une requête par ligne est le défaut qu'on ne voit pas
  // venir tant que la liste est courte.
  const lieux = tournois.parEvenement(aVenir.map(({ evenement }) => evenement));

  return aVenir.map((engagement) => versProchainTournoi(engagement, lieux.get(engagement.evenement)));
}

/**
 * Le seuil est le **début du jour**, pas l'instant.
 *
 * Un tournoi se joue toute la journée : le faire disparaître de la page à midi
 * une, le matin même où on la consulte pour savoir où l'on va, serait le
 * contraire de ce que cette spec cherche. La date est d'ailleurs stockée à midi
 * par 027, précisément pour qu'aucun décalage horaire ne la fasse basculer de
 * jour à l'affichage.
 */
function debutDuJour(quand: Date): Date {
  const jour = new Date(quand);
  jour.setHours(0, 0, 0, 0);
  return jour;
}

/**
 * Par date croissante, puis par identifiant.
 *
 * Le dépôt rend déjà cet ordre, et on le refait quand même : c'est cette
 * fonction qui porte la promesse de la spec — « triés par date » —, et la tenir
 * ici la rend vraie quel que soit l'adaptateur derrière le port. Le second
 * critère n'a rien d'esthétique : sans lui, deux tournois du même jour
 * changeraient de place d'un rendu à l'autre.
 */
function parDate(un: Engagement, autre: Engagement): number {
  return un.date.getTime() - autre.date.getTime() || un.evenement - autre.evenement;
}

function versProchainTournoi(
  engagement: Engagement,
  tournoi: Tournoi | undefined,
): ProchainTournoi {
  return {
    evenement: engagement.evenement,
    nom: engagement.nom,
    date: engagement.date,
    lieu: tournoi?.ville ?? null,
    quand: journeesLibellees(tournoi?.journees ?? [], engagement.date),
    tableaux: engagement.tableaux,
    statut: engagement.statut,
    fiche: `${FICHE_BADNET}${engagement.evenement}`,
  };
}

/**
 * « DH S4 avec MARTIN Claire » — l'engagement en une ligne.
 *
 * Le tableau et le partenaire ensemble, et non en deux colonnes comme le fait
 * l'écran d'exploitation : un même tournoi se joue en double *et* en mixte,
 * avec deux partenaires différents, et deux colonnes parallèles obligent le
 * lecteur à réapparier lui-même les deux listes.
 */
export function intituleDeLEngagement(tableau: TableauEngage): string {
  const jeu = tableau.serie === null ? tableau.tableau : `${tableau.tableau} ${tableau.serie}`;
  return tableau.partenaire === null ? jeu : `${jeu} avec ${tableau.partenaire.nom}`;
}
