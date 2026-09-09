import type {
  DepotTournois,
  FicheDeTournoi,
  Tournoi,
  TournoiDeLaRecherche,
} from "../../core/tournoi.ts";
import type { Lettre } from "../../core/classement.ts";
import type { BaseSqlite } from "./connexion.ts";

type LigneTournoi = {
  evenement: number;
  nom: string | null;
  // Facultatifs depuis 036 : un tournoi publié sans salle est un tournoi
  // normal, et c'est même le cas le plus courant.
  gymnase: string | null;
  adresse: string | null;
  ville: string | null;
  latitude: number | null;
  longitude: number | null;
  date_limite: string | null;
  familles: string | null;
  categories: string | null;
  fiche_relevee_le: string | null;
};

/**
 * Adaptateur SQLite du port `DepotTournois` — specs 017, 002, 036 et 012.
 *
 * **Une ligne, deux sources, aucune qui écrase l'autre.** La recherche apporte
 * le nom, les coordonnées et la date limite ; la fiche apporte le lieu, les
 * journées, les tableaux et les séries. Chaque écriture ne nomme que ses
 * propres colonnes : sans cela, le premier relevé de fiche effacerait la date
 * limite sur laquelle une veille filtre, et le tournoi disparaîtrait d'elle
 * sans que rien ne le dise.
 */
export function depotTournoisSqlite(base: BaseSqlite): DepotTournois {
  const ecrireLaFiche = base.prepare(
    `insert into tournoi (evenement, gymnase, adresse, ville, releve_le, fiche_relevee_le)
     values (?, ?, ?, ?, ?, ?)
     on conflict (evenement) do update set
       gymnase = excluded.gymnase,
       adresse = excluded.adresse,
       ville = excluded.ville,
       releve_le = excluded.releve_le,
       fiche_relevee_le = excluded.fiche_relevee_le`,
  );
  const ecrireLaRecherche = base.prepare(
    `insert into tournoi (evenement, nom, latitude, longitude, date_limite, familles, categories, releve_le)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (evenement) do update set
       nom = excluded.nom,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       date_limite = excluded.date_limite,
       familles = excluded.familles,
       categories = excluded.categories,
       releve_le = excluded.releve_le`,
  );
  const viderLesJournees = base.prepare("delete from tournoi_journee where evenement = ?");
  const ajouterUneJournee = base.prepare(
    "insert into tournoi_journee (evenement, jour) values (?, ?)",
  );
  const viderLesTableaux = base.prepare("delete from tournoi_tableau where evenement = ?");
  const ajouterUnTableau = base.prepare(
    "insert into tournoi_tableau (evenement, tableau) values (?, ?)",
  );
  const viderLesSeries = base.prepare("delete from tournoi_serie where evenement = ?");
  const ajouterUneSerie = base.prepare(
    "insert into tournoi_serie (evenement, serie) values (?, ?)",
  );

  const tous = base.prepare(
    `select evenement, nom, gymnase, adresse, ville, latitude, longitude,
            date_limite, familles, categories, fiche_relevee_le
     from tournoi`,
  );
  const toutesLesJournees = base.prepare(
    "select evenement, jour from tournoi_journee order by evenement, jour",
  );
  const tousLesTableaux = base.prepare(
    "select evenement, tableau from tournoi_tableau order by evenement, tableau",
  );
  const toutesLesSeries = base.prepare(
    "select evenement, serie from tournoi_serie order by evenement, serie",
  );
  const releves = base.prepare("select evenement from tournoi where fiche_relevee_le is not null");
  // Les plus proches d'abord : si le plafond coupe, il coupe sur les tournois
  // les plus lointains, ceux dont l'inscription n'ouvre même pas encore.
  const aRelever = base.prepare(
    `select evenement from tournoi
     where fiche_relevee_le is null
     order by date_limite is null, date_limite, evenement`,
  );

  // Le tournoi et ses listes ensemble : un tournoi dont les journées auraient
  // disparu à mi-écriture s'afficherait avec la date incomplète de 027, sans
  // que rien ne dise pourquoi.
  const enregistrerLaFiche = base.transaction((fiche: FicheDeTournoi, quand: Date) => {
    const horodatage = quand.toISOString();
    ecrireLaFiche.run(
      fiche.evenement,
      fiche.gymnase,
      fiche.adresse,
      fiche.ville,
      horodatage,
      horodatage,
    );
    viderLesJournees.run(fiche.evenement);
    for (const journee of fiche.journees) {
      ajouterUneJournee.run(fiche.evenement, journee.toISOString());
    }
    viderLesTableaux.run(fiche.evenement);
    for (const tableau of fiche.tableaux) ajouterUnTableau.run(fiche.evenement, tableau);
    viderLesSeries.run(fiche.evenement);
    for (const serie of fiche.series) ajouterUneSerie.run(fiche.evenement, serie);
  });

  const enregistrerDepuisLaRecherche = base.transaction(
    (tournois: readonly TournoiDeLaRecherche[], quand: Date) => {
      for (const tournoi of tournois) {
        ecrireLaRecherche.run(
          tournoi.evenement,
          tournoi.nom,
          tournoi.latitude,
          tournoi.longitude,
          tournoi.dateLimite?.toISOString() ?? null,
          tournoi.familles,
          tournoi.categories,
          quand.toISOString(),
        );
      }
    },
  );

  const parEvenementDe = <T>(
    lignes: readonly { evenement: number }[],
    valeur: (ligne: never) => T,
    voulus: ReadonlySet<number>,
  ): Map<number, T[]> => {
    const par = new Map<number, T[]>();
    for (const ligne of lignes) {
      if (!voulus.has(ligne.evenement)) continue;
      const liste = par.get(ligne.evenement) ?? [];
      liste.push(valeur(ligne as never));
      par.set(ligne.evenement, liste);
    }
    return par;
  };

  return {
    enregistrerLaFiche(fiche: FicheDeTournoi, quand: Date): void {
      enregistrerLaFiche(fiche, quand);
    },

    enregistrerDepuisLaRecherche(tournois: readonly TournoiDeLaRecherche[], quand: Date): void {
      enregistrerDepuisLaRecherche(tournois, quand);
    },

    parEvenement(evenements: readonly number[]): ReadonlyMap<number, Tournoi> {
      const voulus = new Set(evenements);
      const journees = parEvenementDe(
        toutesLesJournees.all() as { evenement: number; jour: string }[],
        ({ jour }: { jour: string }) => new Date(jour),
        voulus,
      );
      const tableaux = parEvenementDe(
        tousLesTableaux.all() as { evenement: number; tableau: string }[],
        ({ tableau }: { tableau: string }) => tableau,
        voulus,
      );
      const series = parEvenementDe(
        toutesLesSeries.all() as { evenement: number; serie: string }[],
        ({ serie }: { serie: string }) => serie as Lettre,
        voulus,
      );

      const trouves = new Map<number, Tournoi>();
      for (const ligne of tous.all() as LigneTournoi[]) {
        if (!voulus.has(ligne.evenement)) continue;
        trouves.set(ligne.evenement, {
          evenement: ligne.evenement,
          nom: ligne.nom,
          gymnase: ligne.gymnase,
          adresse: ligne.adresse,
          ville: ligne.ville,
          latitude: ligne.latitude,
          longitude: ligne.longitude,
          dateLimite: ligne.date_limite === null ? null : new Date(ligne.date_limite),
          familles: ligne.familles,
          categories: ligne.categories,
          ficheRelevee: ligne.fiche_relevee_le !== null,
          journees: journees.get(ligne.evenement) ?? [],
          tableaux: tableaux.get(ligne.evenement) ?? [],
          series: series.get(ligne.evenement) ?? [],
        });
      }
      return trouves;
    },

    connus: () =>
      new Set((releves.all() as { evenement: number }[]).map(({ evenement }) => evenement)),

    sansFiche: () =>
      (aRelever.all() as { evenement: number }[]).map(({ evenement }) => evenement),
  };
}
