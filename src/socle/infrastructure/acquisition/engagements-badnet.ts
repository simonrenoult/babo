import type { ClientHttp } from "../../core/acquisition.ts";
import type { Engagement } from "../../core/engagement.ts";
import type { Licence } from "../../core/licence.ts";
import type { AccesAuxEngagements, TournoiEngage } from "../../core/passe-engagements.ts";
import {
  COMPETITIONS,
  actionDeLaFiche,
  actionDeLaPage,
  contenuDeLaPage,
  engagementDuTournoi,
  ficheDuTournoi,
  ficheDunTournoiUrl,
  tournoisEngages,
} from "./badnet.ts";

/**
 * La chaîne de sauts que badnet impose — spec 027.
 *
 * Elle vit dans l'infrastructure et non dans le `core` : la passe dit « liste
 * les tournois, puis donne-moi chaque fiche », et c'est ici seulement qu'on
 * sait qu'il en coûte deux requêtes pour la liste et trois par fiche.
 *
 * **Aucun identifiant d'action n'est écrit en dur.** Chacun se relève sur la
 * page qui le porte, parce qu'ils changent avec le déploiement. C'est plus cher
 * d'une requête à chaque étape, et c'est ce qui évite qu'un redéploiement de
 * badnet fasse tomber la passe sans prévenir.
 */
export class ChaineInterrompue extends Error {
  constructor(etape: string) {
    super(`badnet n'a pas rendu ${etape} : la page a changé, ou la session est morte.`);
    this.name = "ChaineInterrompue";
  }
}

export function accesAuxEngagementsBadnet(options: {
  readonly client: ClientHttp;
  readonly jeton: string;
  readonly licence: Licence;
}): AccesAuxEngagements {
  const { client, jeton, licence } = options;

  /** Coquille puis contenu : le motif de toutes les pages de badnet. */
  const contenuDe = async (url: string, cible?: string): Promise<string> => {
    const coquille = await client.recuperer({ url, jeton });
    const action = actionDeLaPage(coquille);
    if (action === null) throw new ChaineInterrompue(`l'action de ${url}`);

    const fragment = await client.recuperer(contenuDeLaPage(action, jeton, cible));
    return fragment.contenu;
  };

  return {
    async listerLesTournois(): Promise<readonly TournoiEngage[]> {
      const contenu = await contenuDe(COMPETITIONS);
      return tournoisEngages({ url: COMPETITIONS, statutHttp: 200, contenu, cookies: [] });
    },

    async ficheDe(tournoi: TournoiEngage): Promise<Engagement | null> {
      // Le fragment de la fiche ne porte pas l'inscription : il porte un
      // `autoload` qui la réclame, avec l'identifiant du tournoi. Sans ce
      // troisième saut, badnet répond pour un tournoi qui n'existe pas.
      const url = ficheDunTournoiUrl(tournoi.evenement);
      const fragment = await contenuDe(url);
      const action = actionDeLaFiche({ url, statutHttp: 200, contenu: fragment, cookies: [] });
      if (action === null) throw new ChaineInterrompue(`l'autoload de ${url}`);

      const fiche = await client.recuperer(
        ficheDuTournoi(action, jeton, tournoi.evenement, licence),
      );
      return engagementDuTournoi(fiche, tournoi);
    },
  };
}
