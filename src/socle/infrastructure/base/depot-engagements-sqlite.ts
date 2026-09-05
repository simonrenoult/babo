import type { DepotEngagements, Engagement, TableauEngage } from "../../core/engagement.ts";
import type { Licence } from "../../core/licence.ts";
import type { Tableau } from "../../core/tableau.ts";
import type { BaseSqlite } from "./connexion.ts";

type LigneEngagement = {
  evenement: number;
  nom: string;
  date: string;
  statut: string | null;
};

type LigneTableau = {
  evenement: number;
  tableau: string;
  serie: string | null;
  partenaire_licence: string | null;
  partenaire_nom: string | null;
};

/** Adaptateur SQLite du port `DepotEngagements` — specs 017 et 027. */
export function depotEngagementsSqlite(base: BaseSqlite): DepotEngagements {
  const vider = base.prepare("delete from engagement");
  const viderLesTableaux = base.prepare("delete from engagement_tableau");
  const ajouter = base.prepare(
    "insert into engagement (evenement, nom, date, statut, releve_le) values (?, ?, ?, ?, ?)",
  );
  const ajouterUnTableau = base.prepare(
    `insert into engagement_tableau
       (evenement, tableau, serie, partenaire_licence, partenaire_nom)
     values (?, ?, ?, ?, ?)`,
  );
  const tous = base.prepare(
    "select evenement, nom, date, statut from engagement order by date, evenement",
  );
  const tousLesTableaux = base.prepare(
    `select evenement, tableau, serie, partenaire_licence, partenaire_nom
     from engagement_tableau order by evenement, tableau`,
  );
  const compte = base.prepare("select count(*) as total from engagement");

  // Tout ou rien, dans une transaction : un remplacement à moitié fait
  // laisserait un agenda dont personne ne saurait quelle moitié croire — le
  // défaut que 005 refuse pour l'équipe, et pour la même raison.
  const remplacer = base.transaction((engagements: readonly Engagement[], quand: Date) => {
    viderLesTableaux.run();
    vider.run();
    for (const engagement of engagements) {
      ajouter.run(
        engagement.evenement,
        engagement.nom,
        engagement.date.toISOString(),
        engagement.statut,
        quand.toISOString(),
      );
      for (const tableau of engagement.tableaux) {
        ajouterUnTableau.run(
          engagement.evenement,
          tableau.tableau,
          tableau.serie,
          tableau.partenaire?.licence ?? null,
          tableau.partenaire?.nom ?? null,
        );
      }
    }
  });

  return {
    remplacer(engagements: readonly Engagement[], quand: Date): void {
      remplacer(engagements, quand);
    },

    tous(): readonly Engagement[] {
      const parEvenement = new Map<number, TableauEngage[]>();
      for (const ligne of tousLesTableaux.all() as LigneTableau[]) {
        const liste = parEvenement.get(ligne.evenement) ?? [];
        liste.push(versTableau(ligne));
        parEvenement.set(ligne.evenement, liste);
      }

      return (tous.all() as LigneEngagement[]).map((ligne) => ({
        evenement: ligne.evenement,
        nom: ligne.nom,
        date: new Date(ligne.date),
        statut: ligne.statut,
        tableaux: parEvenement.get(ligne.evenement) ?? [],
      }));
    },

    compter: () => (compte.get() as { total: number }).total,
  };
}

function versTableau(ligne: LigneTableau): TableauEngage {
  return {
    tableau: ligne.tableau as Tableau,
    serie: ligne.serie,
    partenaire:
      ligne.partenaire_nom === null
        ? null
        : {
            licence: (ligne.partenaire_licence as Licence | null) ?? null,
            nom: ligne.partenaire_nom,
          },
  };
}
