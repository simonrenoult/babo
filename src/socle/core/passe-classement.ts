import type { ClientHttp, ModuleDAcquisition } from "./acquisition.ts";
import { recupererSousSession, tacheDAcquisition } from "./acquisition.ts";
import type { DepotClassements } from "./classement.ts";
import type { Horloge } from "./horloge.ts";
import type { DepotJetonMyffbad } from "./jeton-myffbad.ts";
import { jetonValide } from "./jeton-myffbad.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";
import { issueDuVolume } from "./rapport-execution.ts";
import type { Licence } from "./licence.ts";

/**
 * La passe qui relève le classement — spec 001.
 *
 * Une requête, une lecture, une écriture, un rapport. C'est le premier
 * traitement qui écrive une donnée métier en base : la sonde de 015 ne faisait
 * que constater, celle-ci retient.
 *
 * Elle ne se déclenche pas elle-même : [[018__ordonnancement]] porte la passe
 * hebdomadaire — le vendredi à 1 h du matin, après la publication du CPPH —,
 * et c'est cette fonction qu'il appellera. En attendant, l'écran
 * des sources la lance à la main — c'est ce qui permet de constater une passe
 * réelle à la mise en service, comme 001 l'exige. Ce n'est pas le bouton
 * « rafraîchir maintenant » que 001 écarte : celui-là serait sur `/mon-profil`,
 * entre les mains de l'utilisateur, alors que celui-ci est sur l'écran
 * d'exploitation et disparaît avec 018.
 *
 * Elle ne lève rien. Toute panne devient un rapport en échec : c'est ce que
 * 019 demande d'une exécution automatique, et un ordonnanceur n'a personne à
 * qui remonter une exception.
 */
export async function releverLeClassement(options: {
  readonly client: ClientHttp;
  readonly module: ModuleDAcquisition;
  readonly licence: Licence;
  readonly jetons: DepotJetonMyffbad;
  readonly classements: DepotClassements;
  readonly rapports: DepotRapports;
  readonly horloge: Horloge;
}): Promise<RapportArchive> {
  const { client, module, licence, jetons, classements, rapports, horloge } = options;
  const demarreLe = horloge.maintenant();
  const tache = tacheDAcquisition(module.source);

  const echec = (detail: string): RapportArchive =>
    rapports.consigner({
      tache,
      demarreLe,
      termineLe: horloge.maintenant(),
      issue: "echec",
      volumeExtrait: 0,
      detail,
    });

  const acces = module.classement;
  if (acces === undefined) {
    return echec(`${module.source} ne porte pas le classement : c'est myffbad qui en est la source (015).`);
  }

  // La session d'abord : sans elle, l'action n'a pas d'identifiant de joueur à
  // qui répondre, et partir quand même coûterait une requête pour rien sur un
  // compte dont le bannissement est un risque assumé.
  const jeton = jetons.lire(module.source);
  if (!jetonValide(jeton, demarreLe) || jeton === null) {
    return echec(
      `Aucune session ${module.source} valide : en enregistrer une depuis /sources avant de relever le classement.`,
    );
  }

  const requete = acces.requete(jeton.valeur);
  if (requete === null) {
    return echec(
      `La session ${module.source} ne porte pas l'identifiant interne du joueur : la remplacer depuis /sources.`,
    );
  }

  let extraits;
  try {
    const reponse = await recupererSousSession(client, module, { intitule: "classement", requete });
    extraits = acces.lire(reponse);
  } catch (erreur) {
    // Session morte, identifiant d'action périmé, lettre hors barème, réseau :
    // quatre pannes qui ne se réparent pas du même geste, et dont le message
    // est justement ce qui les distingue. Le rapport le porte tel quel.
    return echec(erreur instanceof Error ? erreur.message : String(erreur));
  }

  const termineLe = horloge.maintenant();
  const precedent = rapports.dernierRapport(tache);
  const issue = issueDuVolume(extraits.length, precedent?.volumeExtrait ?? null);

  // Rien d'extrait, rien à écrire : `vu_le` ne bouge qu'à la passe qui a
  // vraiment vu quelque chose, sans quoi la page annoncerait une fraîcheur
  // qu'elle n'a pas.
  if (extraits.length > 0) classements.relever(licence, extraits, termineLe);

  return rapports.consigner({
    tache,
    demarreLe,
    termineLe,
    issue,
    volumeExtrait: extraits.length,
    detail:
      extraits.length === 0
        ? "classement : la fiche n'a rendu aucune discipline"
        : `classement : ${extraits.map(({ discipline, lettre }) => `${discipline} ${lettre}`).join(", ")}`,
  });
}

/**
 * Deux requêtes de plafond, pas une : une redirection consomme la première.
 * Une passe qui en demande plus boucle, et un scraper qui boucle vaut un
 * compte banni (015).
 */
export const PLAFOND_DE_LA_PASSE = 2;
