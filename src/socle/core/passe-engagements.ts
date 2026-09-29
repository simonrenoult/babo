import { tacheDesEngagements } from "./acquisition.ts";
import type { DepotEngagements, Engagement } from "./engagement.ts";
import type { Horloge } from "./horloge.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";

/**
 * La passe qui relève mes engagements — spec 027.
 *
 * badnet sert toutes ses pages en coquille : une requête pour relever l'action,
 * une pour le contenu. La liste coûte donc deux requêtes, et chaque fiche
 * trois — la coquille, le fragment, puis l'`autoload` qui porte enfin
 * l'inscription. C'est cher, et c'est le prix d'un site qu'on lit sans
 * navigateur ; le plafond de 015 le borne.
 *
 * Elle ne lève rien : toute panne devient un rapport (019).
 */
/**
 * Ce que la passe demande à badnet, sans rien savoir de comment il répond.
 *
 * Un port, et non les `requete`/`lire` de `ModuleDAcquisition` : la chaîne de
 * badnet est **enchaînée** — chaque appel dépend d'un identifiant relevé sur le
 * précédent —, et un couple requête/lecture statique ne sait pas exprimer ça.
 * Le `core` dit ce qu'il veut, l'infrastructure sait par combien de sauts elle
 * l'obtient.
 */
export type AccesAuxEngagements = {
  listerLesTournois(): Promise<readonly TournoiEngage[]>;
  ficheDe(tournoi: TournoiEngage): Promise<Engagement | null>;
};

/** Ce que la liste rend : de quoi aller chercher une fiche, rien de plus. */
export type TournoiEngage = {
  readonly evenement: number;
  readonly nom: string;
  readonly date: Date;
};

export async function releverLesEngagements(options: {
  /** `null` quand aucune session badnet n'est ouverte : la passe le dit et s'arrête. */
  readonly jeton: string | null;
  readonly engagements: DepotEngagements;
  readonly rapports: DepotRapports;
  readonly horloge: Horloge;
  readonly acces: AccesAuxEngagements;
}): Promise<RapportArchive> {
  const { engagements, rapports, horloge, acces } = options;
  const demarreLe = horloge.maintenant();

  const consigner = (
    issue: "succes" | "vide" | "echec",
    volumeExtrait: number,
    detail: string,
  ): RapportArchive =>
    rapports.consigner({
      tache: tacheDesEngagements(),
      demarreLe,
      termineLe: horloge.maintenant(),
      issue,
      volumeExtrait,
      detail,
    });

  if (options.jeton === null) {
    return consigner("echec", 0, "aucune session badnet : en ouvrir une depuis /parametres/scrapping/sessions (027).");
  }

  let tournois;
  try {
    tournois = await acces.listerLesTournois();
  } catch (erreur) {
    return consigner("echec", 0, message(erreur));
  }

  // Aucun tournoi n'est un fait normal en intersaison, pas une panne : c'est
  // `issueDuVolume` qui dirait le contraire, et 019 la réserve aux passes dont
  // le vide *est* anormal. Ici on ne s'engage pas toute l'année.
  if (tournois.length === 0) {
    engagements.remplacer([], horloge.maintenant());
    return consigner("succes", 0, "aucun tournoi engagé cette saison");
  }

  const releves: Engagement[] = [];
  const muets: string[] = [];

  for (const tournoi of tournois) {
    try {
      const fiche = await acces.ficheDe(tournoi);
      if (fiche === null) throw new Error("fiche illisible");
      releves.push(fiche);
    } catch (erreur) {
      // Un tournoi muet n'arrête pas la passe : c'est la clémence de 028, et
      // elle vaut ici pour la même raison — un seul tournoi illisible ne doit
      // pas faire disparaître les autres de l'écran.
      muets.push(`${tournoi.nom} : ${message(erreur)}`);
    }
  }

  const detail = `${releves.length} engagement(s) sur ${tournois.length}${muets.length === 0 ? "" : ` — ${muets.join(" ; ")}`}`;

  // Échec seulement si aucune fiche n'aboutit, comme la passe de 028 : une
  // passe qui rapporte trois tournois sur quatre a fait son travail.
  if (releves.length === 0) return consigner("echec", 0, detail);

  // Remplacement intégral, comme l'équipe de 005 : une inscription annulée sur
  // badnet doit disparaître d'ici, faute de quoi cette spec reproduirait
  // l'oubli qu'elle corrige — dans l'autre sens.
  engagements.remplacer(releves, horloge.maintenant());
  return consigner("succes", releves.length, detail);
}

function message(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}
