import type { BuildObserve, DepotBuilds } from "../../core/build.ts";
import type { Source } from "../../core/source.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = {
  source: string;
  build: string;
  vu_la_premiere_fois: string;
  vu_la_derniere_fois: string;
};

/** Adaptateur SQLite du port `DepotBuilds` — spec 015. */
export function depotBuildsSqlite(base: BaseSqlite): DepotBuilds {
  // `returning` plutôt qu'une relecture : la date de première vue rendue par
  // l'écriture dit d'elle-même s'il s'agissait d'une insertion.
  const observation = base.prepare(
    `insert into build_source (source, build, vu_la_premiere_fois, vu_la_derniere_fois)
     values (?, ?, ?, ?)
     on conflict (source, build) do update set vu_la_derniere_fois = excluded.vu_la_derniere_fois
     returning vu_la_premiere_fois`,
  );
  const dernier = base.prepare(
    `select source, build, vu_la_premiere_fois, vu_la_derniere_fois from build_source
     where source = ? order by vu_la_derniere_fois desc limit 1`,
  );
  const tous = base.prepare(
    `select source, build, vu_la_premiere_fois, vu_la_derniere_fois from build_source
     where source = ? order by vu_la_derniere_fois desc`,
  );

  return {
    observer(source: Source, build: string, maintenant: Date): boolean {
      const quand = maintenant.toISOString();
      const ecrite = observation.get(source, build, quand, quand) as {
        vu_la_premiere_fois: string;
      };
      return ecrite.vu_la_premiere_fois === quand;
    },

    courant(source: Source): BuildObserve | null {
      const ligne = dernier.get(source) as Ligne | undefined;
      return ligne === undefined ? null : versBuild(ligne);
    },

    historique(source: Source): readonly BuildObserve[] {
      return (tous.all(source) as Ligne[]).map(versBuild);
    },
  };
}

function versBuild(ligne: Ligne): BuildObserve {
  return {
    source: ligne.source as Source,
    build: ligne.build,
    vuLaPremiereFois: new Date(ligne.vu_la_premiere_fois),
    vuLaDerniereFois: new Date(ligne.vu_la_derniere_fois),
  };
}
