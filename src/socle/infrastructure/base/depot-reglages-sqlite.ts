import type { Cadence, DepotReglages, JourDeLaSemaine, ReglageDeTache } from "../../core/ordonnancement.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = {
  tache: string;
  nature: string;
  jour: number | null;
  heure: number;
  minute: number;
  grace_minutes: number;
  active: number;
};

/** Adaptateur SQLite du port `DepotReglages` — specs 017 et 018. */
export function depotReglagesSqlite(base: BaseSqlite): DepotReglages {
  const colonnes = "tache, nature, jour, heure, minute, grace_minutes, active from reglage_tache";
  const tous = base.prepare(`select ${colonnes} order by tache`);
  const parTache = base.prepare(`select ${colonnes} where tache = ?`);
  const ecriture = base.prepare(
    `insert into reglage_tache (tache, nature, jour, heure, minute, grace_minutes, active)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict (tache) do update set
       nature = excluded.nature, jour = excluded.jour, heure = excluded.heure,
       minute = excluded.minute, grace_minutes = excluded.grace_minutes,
       active = excluded.active`,
  );
  // `do nothing` plutôt qu'une lecture suivie d'une écriture : les valeurs de
  // départ ne doivent jamais recouvrir un réglage modifié depuis l'écran.
  const pose = base.prepare(
    `insert into reglage_tache (tache, nature, jour, heure, minute, grace_minutes, active)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict (tache) do nothing`,
  );

  const parametres = (reglage: ReglageDeTache): [string, string, number | null, number, number, number, number] => [
    reglage.tache,
    reglage.cadence.nature,
    reglage.cadence.nature === "hebdomadaire" ? reglage.cadence.jour : null,
    reglage.cadence.nature === "ponctuelle" ? 0 : reglage.cadence.heure,
    reglage.cadence.nature === "ponctuelle" ? 0 : reglage.cadence.minute,
    reglage.graceMinutes,
    reglage.active ? 1 : 0,
  ];

  return {
    tous: () => (tous.all() as Ligne[]).map(versReglage),
    lire(tache: string): ReglageDeTache | null {
      const ligne = parTache.get(tache) as Ligne | undefined;
      return ligne === undefined ? null : versReglage(ligne);
    },
    enregistrer: (reglage) => void ecriture.run(...parametres(reglage)),
    poserSiAbsent: (reglage) => void pose.run(...parametres(reglage)),
  };
}

function versReglage(ligne: Ligne): ReglageDeTache {
  return {
    tache: ligne.tache,
    cadence: versCadence(ligne),
    graceMinutes: ligne.grace_minutes,
    active: ligne.active === 1,
  };
}

function versCadence(ligne: Ligne): Cadence {
  if (ligne.nature === "ponctuelle") return { nature: "ponctuelle" };
  if (ligne.nature === "quotidienne") {
    return { nature: "quotidienne", heure: ligne.heure, minute: ligne.minute };
  }
  return {
    nature: "hebdomadaire",
    // La contrainte `check` de la migration garantit l'intervalle ; le défaut
    // n'est là que pour une ligne écrite hors de l'application.
    jour: ((ligne.jour ?? 5) as JourDeLaSemaine),
    heure: ligne.heure,
    minute: ligne.minute,
  };
}
