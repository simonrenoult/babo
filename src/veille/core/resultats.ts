import type { Lettre } from "../../socle/core/classement.ts";
import type { Tournoi } from "../../socle/core/tournoi.ts";
import { journeesLibellees } from "../../socle/core/tournoi.ts";
import { bornesDeLaFenetre, type Veille } from "./veille.ts";

/**
 * Ce qu'une veille retient, tel que sa page l'affiche — spec 012.
 *
 * Le module lit la base et n'appelle jamais badnet : l'acquisition est un
 * adaptateur en amont (022). Ce fichier porte donc les seuls critères que la
 * requête ne sait pas exprimer — la distance exacte, la fenêtre, les tableaux
 * nommés et les séries.
 */
export type TournoiRetenu = {
  readonly evenement: number;
  readonly nom: string;
  readonly ville: string | null;
  /** À vol d'oiseau, depuis le centre de la veille. `null` faute de coordonnées. */
  readonly distanceKm: number | null;
  readonly quand: string;
  /**
   * Le premier jour joué, `null` tant que la fiche n'a rien rendu.
   *
   * C'est lui qui trie la page — jamais le libellé : « du 3 au 4 octobre » et
   * « samedi 14 novembre » se comparent très mal comme deux chaînes.
   */
  readonly debut: Date | null;
  readonly dateLimite: Date | null;
  readonly tableaux: readonly string[];
  readonly series: readonly Lettre[];
  readonly fiche: string;
};

export type ResultatsDeVeille = {
  /** Ce qui répond à tous les critères, trié par date. */
  readonly retenus: readonly TournoiRetenu[];
  /**
   * Ce dont l'organisateur n'a pas fini la saisie — spec 012.
   *
   * Ni tableau, ni série déclarés : ce sont **les tournois fraîchement
   * publiés**, donc exactement ceux que 013 existe pour attraper, et ceux qui
   * se remplissent en quelques jours. Les écarter serait rater le seul cas où
   * la veille a une vraie valeur, et le rater en silence. « Indéterminé » n'est
   * pas « aucun tableau ».
   */
  readonly indetermines: readonly TournoiRetenu[];
  /**
   * Combien attendent encore leur fiche.
   *
   * La passe des veilles tourne à 5 h 15, celle des fiches à 5 h 30 : un
   * tournoi découvert ce matin n'a ni ville, ni tableaux, ni journées avant le
   * quart d'heure suivant. La page le dit plutôt que de faire disparaître des
   * lignes qu'elle affichera demain.
   */
  readonly enAttenteDeFiche: number;
  /** Écartés par un critère : le décompte, pour que le filtre se voie travailler. */
  readonly ecartes: number;
};

const BADNET = "https://badnet.fr";

export function resultatsDeLaVeille(
  veille: Veille,
  tournois: readonly Tournoi[],
  maintenant: Date,
): ResultatsDeVeille {
  const { du, au } = bornesDeLaFenetre(veille.fenetre, maintenant);
  const retenus: TournoiRetenu[] = [];
  const indetermines: TournoiRetenu[] = [];
  let enAttenteDeFiche = 0;
  let ecartes = 0;

  for (const tournoi of tournois) {
    if (!tournoi.ficheRelevee) {
      enAttenteDeFiche += 1;
      continue;
    }

    const distanceKm = distanceAVolDOiseau(veille, tournoi);
    // badnet coupe juste — vérifié le 9 septembre 2026, 47 marqueurs tous dans
    // les 50 km demandés. Ce filtre n'est donc pas une correction mais une
    // ceinture, et elle sert : le jour où l'on resserre le rayon d'une veille,
    // l'index garde jusqu'au lendemain les tournois de l'ancien périmètre, et
    // la page doit être juste tout de suite.
    if (distanceKm !== null && distanceKm > veille.rayonKm) {
      ecartes += 1;
      continue;
    }

    if (veille.ouvertes && tournoi.dateLimite !== null && tournoi.dateLimite < maintenant) {
      ecartes += 1;
      continue;
    }

    const debut = tournoi.journees[0];
    if (debut !== undefined && (debut < du || debut > au)) {
      ecartes += 1;
      continue;
    }

    const retenu = versRetenu(tournoi, distanceKm);

    // Rien de déclaré : à part, jamais écarté.
    if (tournoi.tableaux.length === 0 && tournoi.series.length === 0) {
      indetermines.push(retenu);
      continue;
    }

    const bonTableau = tournoi.tableaux.some((tableau) =>
      (veille.tableaux as readonly string[]).includes(tableau),
    );
    const bonneSerie = tournoi.series.some((serie) => veille.series.includes(serie));
    if (!bonTableau || !bonneSerie) {
      ecartes += 1;
      continue;
    }

    retenus.push(retenu);
  }

  return {
    retenus: [...retenus].sort(parDate),
    indetermines: [...indetermines].sort(parDate),
    enAttenteDeFiche,
    ecartes,
  };
}

function versRetenu(tournoi: Tournoi, distanceKm: number | null): TournoiRetenu {
  const debut = tournoi.journees[0];
  return {
    evenement: tournoi.evenement,
    nom: tournoi.nom ?? `Tournoi ${tournoi.evenement}`,
    ville: tournoi.ville,
    distanceKm,
    quand:
      debut === undefined ? "dates non relevées" : journeesLibellees(tournoi.journees, debut),
    debut: debut ?? null,
    dateLimite: tournoi.dateLimite,
    tableaux: tournoi.tableaux,
    series: tournoi.series,
    fiche: `${BADNET}/tournoi/public/informations?eventid=${tournoi.evenement}`,
  };
}

/**
 * Le tri de la page : par date, la plus proche d'abord.
 *
 * Un tournoi dont les journées ne sont pas encore relevées se range sur sa date
 * limite, et à défaut en fin de liste — jamais en tête, où il ferait croire à
 * une échéance imminente.
 */
function parDate(a: TournoiRetenu, b: TournoiRetenu): number {
  return quandTrier(a) - quandTrier(b);
}

function quandTrier(retenu: TournoiRetenu): number {
  return (retenu.debut ?? retenu.dateLimite)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

/**
 * La distance à vol d'oiseau, en kilomètres — spec 012.
 *
 * **Calculée ici, jamais lue chez badnet.** Son champ `distance` est vide deux
 * fois sur trois, et faux quand il ne l'est pas : 9 km annoncés pour 1,6 km
 * réels, 38 pour 13. Les coordonnées du gymnase, elles, sont justes.
 *
 * Le vol d'oiseau est une approximation assumée : le vrai critère est le temps
 * de trajet, et il fait l'objet de 034. Le rayon se règle en attendant.
 */
const RAYON_DE_LA_TERRE_KM = 6371;

export function distanceAVolDOiseau(
  depuis: { readonly latitude: number; readonly longitude: number },
  vers: { readonly latitude: number | null; readonly longitude: number | null },
): number | null {
  if (vers.latitude === null || vers.longitude === null) return null;

  const enRadians = (degres: number) => (degres * Math.PI) / 180;
  const dLat = enRadians(vers.latitude - depuis.latitude);
  const dLon = enRadians(vers.longitude - depuis.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(enRadians(depuis.latitude)) *
      Math.cos(enRadians(vers.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(RAYON_DE_LA_TERRE_KM * 2 * Math.asin(Math.sqrt(a)));
}
