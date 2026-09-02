import type { Licence } from "./licence.ts";

/**
 * Qui est derrière une licence, tel que myffbad le publie — spec 028.
 *
 * Deux choses arrivent ensemble parce qu'elles arrivent de la même requête, la
 * fiche publique `/joueur/<licence>` :
 *
 * - le **nom**, qui est un fait fédéral au même titre que le classement. Il
 *   n'en existe pas une version vue par `mon-profil` et une autre vue par
 *   `capitanat`, donc il descend ici avec `Licence` et `Classement`
 *   (spec 022, amendée par 001 puis par celle-ci) ;
 * - le **`personId`**, clé interne des personnes chez myffbad, qui n'est pas
 *   une donnée métier du tout mais un détail d'acquisition. L'action
 *   `classement` ne prend que lui — passée une licence, elle rend 200 et une
 *   réponse vide, soit le succès vide de [[019__robustesse-du-scraping]] ;
 *   passée un objet, elle rend 500.
 *
 * Ce n'est pas `Joueur` : aucun rôle, aucune coordonnée, aucune préférence.
 * `mon-profil` et `capitanat` gardent chacun le leur (022).
 */
export type Identite = {
  readonly licence: Licence;
  /** « Simon RENOULT » — prénom puis nom, tel que myffbad le rend. */
  readonly nom: string;
  /**
   * La clé interne myffbad. Gardée en base pour ramener le régime de croisière
   * à une requête par joueur et par semaine ; jamais affichée, jamais exposée
   * à une feature autrement que par ce type.
   */
  readonly personId: number;
};

/**
 * La fiche n'a pas rendu d'identité lisible — spec 028.
 *
 * Même choix que `ClassementIllisible` : panne franche plutôt que valeur
 * inventée. Une identité fausse serait pire qu'un classement faux — elle
 * rattacherait le classement de quelqu'un d'autre à une licence.
 */
export class IdentiteIllisible extends Error {
  constructor(detail: string) {
    super(`Identité illisible sur la fiche myffbad : ${detail}`);
    this.name = "IdentiteIllisible";
  }
}

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotIdentites = {
  /**
   * Enregistre ce qu'une passe a lu sur la fiche. Une ligne par licence, mise
   * à jour en place : contrairement au classement, on ne garde pas l'historique
   * d'un nom — personne n'en a l'usage, et 024 ne le demande pas.
   */
  enregistrer(identite: Identite, vuLe: Date): void;
  lire(licence: Licence): Identite | null;
};
