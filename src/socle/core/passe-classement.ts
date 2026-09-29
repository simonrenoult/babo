import type { ClientHttp, ModuleDAcquisition } from "./acquisition.ts";
import { recupererSousSession, tacheDAcquisition } from "./acquisition.ts";
import type { Classement, DepotClassements } from "./classement.ts";
import type { DepotIdentites, Identite } from "./identite.ts";
import type { Horloge } from "./horloge.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";
import type { Licence } from "./licence.ts";

/**
 * La passe qui relève noms et classements — specs 001 et 028.
 *
 * **Une seule passe pour tout le monde**, et entièrement anonyme. 001 relevait
 * mon seul classement, sous session ; 028 y ajoute les coéquipiers et retire la
 * session. Deux passes séparées auraient produit deux rapports, deux dates
 * affichées et deux fois la même requête pour moi, qui suis dans les deux
 * listes.
 *
 * Elle ne se déclenche pas elle-même : [[018__ordonnancement]] porte la passe
 * hebdomadaire — le vendredi à 1 h du matin, après la publication du CPPH —,
 * et c'est cette fonction qu'il appellera. En attendant, l'écran des sources la
 * lance à la main, et l'import de 005 l'enchaîne. Ce n'est pas le bouton
 * « rafraîchir maintenant » que 001 écarte : celui-là serait sur `/mon-profil`,
 * entre les mains de l'utilisateur, alors que ceux-ci sont sur l'écran
 * d'exploitation et disparaissent avec 018.
 *
 * Elle ne lève rien. Toute panne devient un rapport : c'est ce que 019 demande
 * d'une exécution automatique, et un ordonnanceur n'a personne à qui remonter
 * une exception.
 */
export async function releverLesClassements(options: {
  readonly client: ClientHttp;
  readonly module: ModuleDAcquisition;
  /** Les licences suivies — la mienne et celles de l'équipe, dédoublonnées par l'appelant. */
  readonly licences: readonly Licence[];
  readonly identites: DepotIdentites;
  readonly classements: DepotClassements;
  readonly rapports: DepotRapports;
  readonly horloge: Horloge;
}): Promise<RapportArchive> {
  const { client, module, licences, identites, classements, rapports, horloge } = options;
  const demarreLe = horloge.maintenant();
  const tache = tacheDAcquisition(module.source);

  const consigner = (
    issue: "succes" | "vide" | "echec",
    volumeExtrait: number,
    detail: string,
  ): RapportArchive =>
    rapports.consigner({ tache, demarreLe, termineLe: horloge.maintenant(), issue, volumeExtrait, detail });

  const acces = module.classement;
  const fiche = module.identite;
  if (acces === undefined || fiche === undefined) {
    return consigner(
      "echec",
      0,
      `${module.source} ne porte pas le classement : c'est myffbad qui en est la source (015).`,
    );
  }

  if (licences.length === 0) {
    // Ni un succès ni une panne de la source : il n'y a personne à relever.
    // Le dire plutôt que de consigner un succès à zéro, qui ferait croire à
    // `issueDuVolume` que la source s'est tue.
    return consigner("echec", 0, "aucune licence suivie : importer l'équipe depuis /parametres/equipe (005).");
  }

  const muets: string[] = [];
  let releves = 0;
  let extraits = 0;

  for (const licence of licences) {
    try {
      extraits += await releverUn({ client, module, licence, identites, classements, horloge });
      releves += 1;
    } catch (erreur) {
      // Un joueur qui change de club, une fiche déplacée, une lettre hors
      // barème : le relevé des autres continue. Sans cette clémence, un seul
      // coéquipier ferait tomber le classement de toute l'équipe, le mien
      // compris — et c'est le mien qui est là depuis 001.
      muets.push(`${licence} : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }

  const detail = `${releves} relevé(s) sur ${licences.length}${muets.length === 0 ? "" : ` — ${muets.join(" ; ")}`}`;

  // Échec seulement si personne n'a répondu : une passe qui rapporte sept
  // joueurs sur huit a fait son travail, et le rapport nomme le huitième.
  //
  // Pas d'`issueDuVolume` ici, et ce n'est pas un oubli : le succès vide que
  // 019 nomme est désormais attrapé **une ligne plus bas**, joueur par joueur —
  // celui dont l'action ne rend rien est muet, même si les autres parlent. Au
  // niveau de la passe, `extraits` ne peut plus valoir zéro sans que `releves`
  // vaille zéro aussi, et ce cas-là est déjà l'échec ci-dessus.
  if (releves === 0) return consigner("echec", 0, detail);

  return consigner("succes", extraits, detail);
}

/**
 * Un joueur : sa fiche si on ne le connaît pas encore, puis son classement.
 *
 * Rend le nombre de disciplines écrites. Lève sur toute panne — c'est
 * l'appelant qui décide qu'un joueur muet n'arrête pas la passe.
 */
async function releverUn(options: {
  readonly client: ClientHttp;
  readonly module: ModuleDAcquisition;
  readonly licence: Licence;
  readonly identites: DepotIdentites;
  readonly classements: DepotClassements;
  readonly horloge: Horloge;
}): Promise<number> {
  const { client, module, licence, identites, classements, horloge } = options;
  const acces = module.classement;
  const fiche = module.identite;
  if (acces === undefined || fiche === undefined) throw new Error("source sans classement");

  const lireLaFiche = async (): Promise<Identite> => {
    const reponse = await recupererSousSession(client, module, {
      intitule: `fiche ${licence}`,
      requete: fiche.requete(licence),
    });
    const identite = fiche.lire(reponse, licence);
    identites.enregistrer(identite, horloge.maintenant());
    return identite;
  };

  const connu = identites.lire(licence);
  let identite = connu ?? (await lireLaFiche());
  let extraits = await lireLeClassement(client, module, acces, licence, identite.personId);

  // Réponse vide alors qu'on partait d'un `personId` en cache : c'est le cache
  // qui est faux, pas la source qui s'est tue. On relit la fiche et on retente
  // — une seule fois, parce qu'un cache qui ne se répare pas laisse un joueur
  // muet jusqu'à ce que quelqu'un lise un rapport, et qu'une boucle vaut un
  // compte banni (015).
  if (extraits.length === 0 && connu !== null) {
    identite = await lireLaFiche();
    extraits = await lireLeClassement(client, module, acces, licence, identite.personId);
  }

  if (extraits.length === 0) {
    throw new Error("l'action classement n'a rendu aucune discipline, fiche relue comprise");
  }

  classements.relever(licence, extraits, horloge.maintenant());
  return extraits.length;
}

function lireLeClassement(
  client: ClientHttp,
  module: ModuleDAcquisition,
  acces: NonNullable<ModuleDAcquisition["classement"]>,
  licence: Licence,
  personId: number,
): Promise<readonly Classement[]> {
  return recupererSousSession(client, module, {
    intitule: `classement ${licence}`,
    requete: acces.requete(licence, personId),
  }).then((reponse) => acces.lire(reponse));
}

/**
 * Deux requêtes par joueur — la fiche puis l'action —, plus une de marge.
 *
 * En régime de croisière le cache tient et une seule suffit ; le plafond, lui,
 * est dimensionné pour le premier passage et pour la relecture de fiche qui
 * répare un cache. Au-delà, la passe boucle, et un scraper qui boucle vaut un
 * compte banni (015).
 */
export function plafondDeLaPasse(licences: number): number {
  return 2 * (licences + 1);
}
