import type { ClientHttp } from "../../core/acquisition.ts";
import type { AccesALaRecherche, RechercheDeTournois } from "../../core/passe-veilles.ts";
import { nombreAnnonce, rechercheDeTournois, tournoisDeLaRecherche } from "./badnet.ts";

/**
 * La recherche publique de tournois, branchée sur une veille — spec 012.
 *
 * **Un seul saut, et sans cookie.** C'est la requête la plus simple du projet :
 * un POST sur `/index.php`, sans session, sans compte, donc hors du risque de
 * bannissement de 015. Elle ne doit jamais passer sous session, sous peine de
 * mettre la veille quotidienne sous le même risque que le reste.
 *
 * **Ce qui part dans la requête est ce que la sonde a vérifié** : la zone,
 * `coming`, le type d'événement, les catégories d'âge et les disciplines. Les
 * séries et les tableaux restent en local — badnet ne distingue pas SH de SD,
 * et ses cases de classement filtrent sur quelque chose que la sonde du
 * 8 septembre 2026 n'a pas su nommer.
 */
export function accesALaRechercheBadnet(options: {
  readonly client: ClientHttp;
}): AccesALaRecherche {
  const { client } = options;

  return {
    async chercher(recherche: RechercheDeTournois) {
      const reponse = await client.recuperer(
        rechercheDeTournois({
          autourDe: recherche.autourDe,
          rayonKm: recherche.rayonKm,
          aVenir: true,
          disciplines: recherche.disciplines,
          categories: recherche.categories,
        }),
      );

      return {
        tournois: tournoisDeLaRecherche(reponse).map((publie) => ({
          evenement: publie.id,
          nom: publie.nom,
          latitude: publie.latitude,
          longitude: publie.longitude,
          dateLimite: publie.dateLimite,
          familles: publie.classements,
          categories: publie.categories,
        })),
        annonces: nombreAnnonce(reponse),
      };
    },
  };
}
