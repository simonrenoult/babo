import type { DepotTournois, Tournoi } from "../../core/tournoi.ts";
import type { BaseSqlite } from "./connexion.ts";

type LigneTournoi = {
  evenement: number;
  // Facultatifs depuis 036 : un tournoi publié sans salle est un tournoi
  // normal, et c'est même le cas le plus courant.
  gymnase: string | null;
  adresse: string | null;
  ville: string | null;
};

/** Adaptateur SQLite du port `DepotTournois` — specs 017 et 002. */
export function depotTournoisSqlite(base: BaseSqlite): DepotTournois {
  const ecrire = base.prepare(
    `insert into tournoi (evenement, gymnase, adresse, ville, releve_le)
     values (?, ?, ?, ?, ?)
     on conflict (evenement) do update set
       gymnase = excluded.gymnase,
       adresse = excluded.adresse,
       ville = excluded.ville,
       releve_le = excluded.releve_le`,
  );
  const viderLesJournees = base.prepare("delete from tournoi_journee where evenement = ?");
  const ajouterUneJournee = base.prepare(
    "insert into tournoi_journee (evenement, jour) values (?, ?)",
  );
  const tous = base.prepare("select evenement, gymnase, adresse, ville from tournoi");
  const toutesLesJournees = base.prepare(
    "select evenement, jour from tournoi_journee order by evenement, jour",
  );
  const identifiants = base.prepare("select evenement from tournoi");

  // Le tournoi et ses journées ensemble : un tournoi dont les journées auraient
  // disparu à mi-écriture s'afficherait avec la date incomplète de 027, sans
  // que rien ne dise pourquoi.
  const enregistrer = base.transaction((tournoi: Tournoi, quand: Date) => {
    ecrire.run(
      tournoi.evenement,
      tournoi.gymnase,
      tournoi.adresse,
      tournoi.ville,
      quand.toISOString(),
    );
    viderLesJournees.run(tournoi.evenement);
    for (const journee of tournoi.journees) {
      ajouterUneJournee.run(tournoi.evenement, journee.toISOString());
    }
  });

  return {
    enregistrer(tournoi: Tournoi, quand: Date): void {
      enregistrer(tournoi, quand);
    },

    parEvenement(evenements: readonly number[]): ReadonlyMap<number, Tournoi> {
      const voulus = new Set(evenements);
      const journees = new Map<number, Date[]>();
      for (const ligne of toutesLesJournees.all() as { evenement: number; jour: string }[]) {
        if (!voulus.has(ligne.evenement)) continue;
        const liste = journees.get(ligne.evenement) ?? [];
        liste.push(new Date(ligne.jour));
        journees.set(ligne.evenement, liste);
      }

      const trouves = new Map<number, Tournoi>();
      for (const ligne of tous.all() as LigneTournoi[]) {
        if (!voulus.has(ligne.evenement)) continue;
        trouves.set(ligne.evenement, {
          ...ligne,
          journees: journees.get(ligne.evenement) ?? [],
        });
      }
      return trouves;
    },

    connus: () =>
      new Set((identifiants.all() as { evenement: number }[]).map(({ evenement }) => evenement)),
  };
}
