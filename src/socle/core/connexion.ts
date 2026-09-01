import type { ClientHttp, ModuleDAcquisition } from "./acquisition.ts";
import { ActionIntrouvable, echeanceDeLaSession } from "./acquisition.ts";
import type { DepotJetonMyffbad, JetonMyffbad } from "./jeton-myffbad.ts";
import type { Horloge } from "./horloge.ts";

/**
 * S'authentifier tout seul — spec 015.
 *
 * C'est la pièce qui sépare une acquisition autonome d'une acquisition qui
 * attend un humain chaque mois. Elle ne vaut que pour les sources qui le
 * permettent : myffbad, qui ne demande que licence et mot de passe. badnet
 * garde son écran, sa 2FA ne se contourne pas.
 *
 * Le mot de passe traverse cette fonction et n'y reste pas : il vient de
 * l'environnement, ne touche jamais la base, et seul le jeton est persisté.
 */
export class ConnexionImpossible extends Error {
  constructor(source: string) {
    super(`La source ${source} ne sait pas se connecter seule : sa session s'enregistre à la main.`);
    this.name = "ConnexionImpossible";
  }
}

export class ConnexionRefusee extends Error {
  constructor(source: string, statutHttp: number) {
    super(
      `Connexion ${source} refusée (statut ${statutHttp}) : aucun jeton dans la réponse. Vérifier les identifiants.`,
    );
    this.name = "ConnexionRefusee";
  }
}

const ACTION_ABSENTE = "Server action not found";

export async function seConnecter(options: {
  readonly client: ClientHttp;
  readonly module: ModuleDAcquisition;
  readonly motDePasse: string;
  readonly jetons: DepotJetonMyffbad;
  readonly horloge: Horloge;
}): Promise<JetonMyffbad> {
  const { client, module, motDePasse, jetons, horloge } = options;

  const connexion = module.connexion;
  if (connexion === undefined) throw new ConnexionImpossible(module.source);

  const reponse = await client.recuperer(connexion.requete(motDePasse));

  // Distinguer les deux pannes ici, et non chez l'appelant : elles se réparent
  // différemment, et les confondre enverrait recoller un cookie là où il faut
  // relever un identifiant.
  if (reponse.statutHttp === 404 && reponse.contenu.includes(ACTION_ABSENTE)) {
    throw new ActionIntrouvable(module.source, reponse.url);
  }

  const valeur = connexion.jetonDepuisLesCookies(reponse.cookies);
  if (valeur === null) throw new ConnexionRefusee(module.source, reponse.statutHttp);

  const obtenuLe = horloge.maintenant();
  const jeton: JetonMyffbad = {
    valeur,
    obtenuLe,
    expireLe: echeanceDeLaSession(module, valeur, obtenuLe),
  };
  jetons.enregistrer(module.source, jeton);
  return jeton;
}
