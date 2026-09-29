import type { BaseSqlite } from "../../socle/infrastructure/base/connexion.ts";
import type { CalendrierDInterclub, DepotCalendrier, Rencontre } from "../core/calendrier.ts";

type LigneCalendrier = {
  url: string;
  code_equipe: string;
  nom_equipe: string;
  competition: string;
  groupe: string;
  importe_le: string;
};

type LigneRencontre = {
  id: number;
  journee: number;
  debut: string;
  lieu: string;
  nom_domicile: string;
  code_domicile: string;
  nom_exterieur: string;
  code_exterieur: string;
};

/**
 * Adaptateur SQLite du port `DepotCalendrier`.
 *
 * Dans `capitanat/infrastructure`, pour la raison de 005 : le socle ne connaît
 * aucune feature (022), et c'est `main.ts` qui passe la base.
 */
export function depotCalendrierSqlite(base: BaseSqlite): DepotCalendrier {
  const entete = base.prepare(
    "select url, code_equipe, nom_equipe, competition, groupe, importe_le from calendrier_interclub",
  );
  const rencontres = base.prepare(
    `select id, journee, debut, lieu, nom_domicile, code_domicile, nom_exterieur, code_exterieur
     from rencontre_interclub order by debut`,
  );
  const viderLEntete = base.prepare("delete from calendrier_interclub");
  const viderLesRencontres = base.prepare("delete from rencontre_interclub");
  const ecrireLEntete = base.prepare(
    `insert into calendrier_interclub (id, url, code_equipe, nom_equipe, competition, groupe, importe_le)
     values (1, ?, ?, ?, ?, ?, ?)`,
  );
  const ecrireUneRencontre = base.prepare(
    `insert into rencontre_interclub
       (id, journee, debut, lieu, nom_domicile, code_domicile, nom_exterieur, code_exterieur)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // Tout ou rien, comme l'import d'équipe : un calendrier à moitié remplacé
  // mêlerait deux versions des mêmes journées.
  const remplacer = base.transaction((calendrier: CalendrierDInterclub) => {
    viderLesRencontres.run();
    viderLEntete.run();
    ecrireLEntete.run(
      calendrier.url,
      calendrier.equipe.code,
      calendrier.equipe.nom,
      calendrier.competition,
      calendrier.groupe,
      calendrier.importeLe.toISOString(),
    );
    for (const rencontre of calendrier.rencontres) {
      ecrireUneRencontre.run(
        rencontre.id,
        rencontre.journee,
        rencontre.debut.toISOString(),
        rencontre.lieu,
        rencontre.domicile.nom,
        rencontre.domicile.code,
        rencontre.exterieur.nom,
        rencontre.exterieur.code,
      );
    }
  });

  return {
    remplacer: (calendrier) => void remplacer(calendrier),

    lire(): CalendrierDInterclub | null {
      const ligne = entete.get() as LigneCalendrier | undefined;
      if (ligne === undefined) return null;

      return {
        url: ligne.url,
        equipe: { nom: ligne.nom_equipe, code: ligne.code_equipe },
        competition: ligne.competition,
        groupe: ligne.groupe,
        importeLe: new Date(ligne.importe_le),
        rencontres: (rencontres.all() as LigneRencontre[]).map(versRencontre),
      };
    },
  };
}

function versRencontre(ligne: LigneRencontre): Rencontre {
  return {
    id: ligne.id,
    journee: ligne.journee,
    debut: new Date(ligne.debut),
    lieu: ligne.lieu,
    domicile: { nom: ligne.nom_domicile, code: ligne.code_domicile },
    exterieur: { nom: ligne.nom_exterieur, code: ligne.code_exterieur },
  };
}
