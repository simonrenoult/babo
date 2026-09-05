import type { ClientHttp } from "../../core/acquisition.ts";
import type { AccesAuxFichesPubliques } from "../../core/passe-tournois.ts";
import type { Tournoi } from "../../core/tournoi.ts";
import {
  actionInterneDeLaPage,
  contenuPublicDuTournoi,
  cookiesAnonymes,
  fichePubliqueUrl,
  jetonCsrf,
  journeesDuTournoi,
  lieuDuTournoi,
  moduleBadnet,
} from "./badnet.ts";

/**
 * La chaîne de la fiche publique d'un tournoi — spec 002.
 *
 * Elle vit dans l'infrastructure pour la raison écrite par 027 : la passe dit
 * « donne-moi la fiche de ce tournoi », et c'est ici seulement qu'on sait
 * combien de sauts badnet impose pour la rendre.
 *
 * **Deux requêtes, et trois pièges qu'il a fallu payer pour connaître.**
 *
 * 1. L'adresse. `/tournoi/public?eventid=…`, celle que la recherche publie dans
 *    son JSON, ne rend qu'une coquille vide. La fiche est sur
 *    `/tournoi/public/informations`.
 * 2. L'action. La coquille publique n'a pas de `default_page` — c'est le motif
 *    de l'application authentifiée, pas du site. Elle porte `data-inside_page`.
 * 3. Le jeton anti-CSRF. badnet le pose en cookie au premier contact et le
 *    réclame **aussi** dans le corps du POST ; sans lui, rien ne sort.
 *
 * **Anonyme de bout en bout.** Les deux cookies sont obtenus à l'instant et
 * jetés avec la fiche : aucun compte n'est engagé, donc aucun risque de
 * bannissement (015). C'est ce qui permet à cette passe d'aboutir le jour où la
 * session badnet est morte.
 */
export class FichePubliqueIllisible extends Error {
  constructor(etape: string) {
    super(`badnet n'a pas rendu ${etape}.`);
    this.name = "FichePubliqueIllisible";
  }
}

export function accesAuxFichesPubliquesBadnet(options: {
  readonly client: ClientHttp;
}): AccesAuxFichesPubliques {
  const { client } = options;

  return {
    async ficheDe(evenement: number): Promise<Tournoi> {
      const url = fichePubliqueUrl(evenement);
      const coquille = await client.recuperer({ url, jeton: null });

      // Testé d'abord : badnet sert sa page de connexion sous l'URL demandée,
      // sans redirection (015). Sans ce contrôle on prendrait le mur pour une
      // coquille dont l'action a bougé, et on chercherait un changement de
      // balisage là où il n'y a qu'une porte fermée.
      if (moduleBadnet.murDeConnexion(coquille)) {
        throw new FichePubliqueIllisible("une page publique : elle réclame une session");
      }

      const action = actionInterneDeLaPage(coquille);
      if (action === null) throw new FichePubliqueIllisible(`l'action interne de ${url}`);

      const csrf = jetonCsrf(coquille.cookies);
      const cookies = cookiesAnonymes(coquille.cookies);
      if (csrf === null || cookies === null) {
        throw new FichePubliqueIllisible("de jeton anti-CSRF : le POST serait refusé");
      }

      const fiche = await client.recuperer(
        contenuPublicDuTournoi({ action, evenement, csrf, cookies }),
      );

      const lieu = lieuDuTournoi(fiche);
      if (lieu === null) throw new FichePubliqueIllisible("de carte « Gymnases » lisible");

      return { evenement, ...lieu, journees: journeesDuTournoi(fiche) };
    },
  };
}
