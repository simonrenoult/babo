import type { ConfigurationBase } from "../../core/configuration.ts";
import type { DepotCaptures } from "../../core/capture.ts";
import type { DepotClassements } from "../../core/classement.ts";
import type { DepotJetonMyffbad } from "../../core/jeton-myffbad.ts";
import type { DepotRapports } from "../../core/rapport-execution.ts";
import type { DepotBuilds } from "../../core/build.ts";
import { ouvrirLaBase, tailleDeLaBase, type BaseSqlite } from "./connexion.ts";
import { migrer } from "./migrateur.ts";
import { depotCapturesSqlite } from "./depot-captures-sqlite.ts";
import { depotClassementsSqlite } from "./depot-classements-sqlite.ts";
import { depotJetonMyffbadSqlite } from "./depot-jeton-myffbad-sqlite.ts";
import { depotRapportsSqlite } from "./depot-rapports-sqlite.ts";
import { depotBuildsSqlite } from "./depot-builds-sqlite.ts";

/**
 * L'unique base de l'application, ouverte, migrée, et ses dépôts — spec 017.
 *
 * Une seule fonction pour tout ce qui touche au fichier : c'est ce qui rend
 * vérifiable la promesse « aucune feature ne persiste quoi que ce soit en
 * dehors ».
 */
export type Persistance = {
  readonly base: BaseSqlite;
  readonly migrationsAppliquees: readonly string[];
  readonly jetonMyffbad: DepotJetonMyffbad;
  readonly captures: DepotCaptures;
  readonly rapports: DepotRapports;
  readonly builds: DepotBuilds;
  readonly classements: DepotClassements;
  taille(): number;
  fermer(): void;
};

export function ouvrirLaPersistance(configuration: ConfigurationBase): Persistance {
  const base = ouvrirLaBase(configuration);
  const migrationsAppliquees = migrer(base);

  return {
    base,
    migrationsAppliquees,
    jetonMyffbad: depotJetonMyffbadSqlite(base),
    captures: depotCapturesSqlite(base),
    rapports: depotRapportsSqlite(base),
    builds: depotBuildsSqlite(base),
    classements: depotClassementsSqlite(base),
    taille: () => tailleDeLaBase(base),
    fermer: () => base.close(),
  };
}
