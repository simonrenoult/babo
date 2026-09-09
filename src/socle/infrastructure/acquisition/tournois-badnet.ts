import type { ClientHttp } from "../../core/acquisition.ts";
import type { AccesAuxFichesPubliques } from "../../core/passe-tournois.ts";
import type { Tournoi } from "../../core/tournoi.ts";
import {
  actionDeLEnveloppe,
  actionInterneDeLaPage,
  contenuPublicDuTournoi,
  cookiesAnonymes,
  enTeteDuTournoi,
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
 *
 * **Trois requêtes depuis 036, et non deux.** La coquille porte deux actions,
 * et 002 n'en exploitait qu'une. L'**enveloppe** — le bandeau du tournoi — rend
 * la ville nommée et les dates en ISO ; l'onglet « Présentation » rend le
 * gymnase, son adresse et le détail des journées **quand l'organisateur les a
 * saisis**, ce qui n'est le cas que d'un tournoi sur quatre. L'enveloppe est
 * donc la source, la carte « Gymnases » le complément.
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

      const enveloppe = actionDeLEnveloppe(coquille);
      if (enveloppe === null) throw new FichePubliqueIllisible(`l'action d'enveloppe de ${url}`);

      const csrf = jetonCsrf(coquille.cookies);
      const cookies = cookiesAnonymes(coquille.cookies);
      if (csrf === null || cookies === null) {
        throw new FichePubliqueIllisible("de jeton anti-CSRF : le POST serait refusé");
      }

      const enTete = enTeteDuTournoi(
        await client.recuperer(
          contenuPublicDuTournoi({ action: enveloppe, evenement, csrf, cookies }),
        ),
      );
      // L'attribut absent est une page qui a changé, et cela doit s'entendre.
      // Un champ vide *dedans* est une donnée que l'organisateur n'a pas
      // saisie, ce qui est tout autre chose — 019 vise le premier, pas le
      // second.
      if (enTete === null) throw new FichePubliqueIllisible("d'en-tête de tournoi lisible");

      const fiche = await client.recuperer(
        contenuPublicDuTournoi({ action, evenement, csrf, cookies }),
      );

      // La carte « Gymnases » ne fait plus foi : elle complète. Quand elle
      // existe, ses journées priment — un tournoi peut sauter un jour au milieu
      // de son intervalle, et l'énumération de l'enveloppe le dirait à tort.
      const lieu = lieuDuTournoi(fiche);
      const journees = journeesDuTournoi(fiche);

      return {
        evenement,
        gymnase: lieu?.gymnase ?? null,
        adresse: lieu?.adresse ?? null,
        ville: enTete.ville ?? lieu?.ville ?? null,
        journees: journees.length > 0 ? journees : enTete.journees,
      };
    },
  };
}
