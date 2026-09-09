import type { ConfigurationBase } from "../../core/configuration.ts";
import type { DepotCaptures } from "../../core/capture.ts";
import type { DepotClassements } from "../../core/classement.ts";
import type { DepotIdentites } from "../../core/identite.ts";
import type { DepotJetonMyffbad } from "../../core/jeton-myffbad.ts";
import type { DepotRapports } from "../../core/rapport-execution.ts";
import type { DepotBuilds } from "../../core/build.ts";
import type { DepotEcheances, DepotReglages } from "../../core/ordonnancement.ts";
import type { DepotCompte } from "../../core/authentification.ts";
import type { DepotCourrier } from "../../core/courrier.ts";
import type { DepotEngagements } from "../../core/engagement.ts";
import type { DepotTournois } from "../../core/tournoi.ts";
import { ouvrirLaBase, tailleDeLaBase, type BaseSqlite } from "./connexion.ts";
import { migrer } from "./migrateur.ts";
import { depotCapturesSqlite } from "./depot-captures-sqlite.ts";
import { depotClassementsSqlite } from "./depot-classements-sqlite.ts";
import { depotIdentitesSqlite } from "./depot-identites-sqlite.ts";
import { depotJetonMyffbadSqlite } from "./depot-jeton-myffbad-sqlite.ts";
import { depotRapportsSqlite } from "./depot-rapports-sqlite.ts";
import { depotBuildsSqlite } from "./depot-builds-sqlite.ts";
import { depotReglagesSqlite } from "./depot-reglages-sqlite.ts";
import { depotEcheancesSqlite } from "./depot-echeances-sqlite.ts";
import { depotCompteSqlite } from "./depot-compte-sqlite.ts";
import { depotCourrierSqlite } from "./depot-courrier-sqlite.ts";
import { depotEngagementsSqlite } from "./depot-engagements-sqlite.ts";
import { depotTournoisSqlite } from "./depot-tournois-sqlite.ts";
import { depotAppartenancesSqlite } from "./depot-appartenances-sqlite.ts";
import type { DepotAppartenances } from "../../core/passe-veilles.ts";

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
  readonly identites: DepotIdentites;
  /** Les fréquences des tâches, et ce qui reste à exécuter — spec 018. */
  readonly reglages: DepotReglages;
  readonly echeances: DepotEcheances;
  /** Le compte unique qui ouvre la porte — spec 021. */
  readonly compte: DepotCompte;
  /** La boîte d'envoi : tout mail y est écrit avant d'être remis — spec 016. */
  readonly courrier: DepotCourrier;
  /** Mes engagements de tournoi, relevés sur badnet — spec 027. */
  readonly engagements: DepotEngagements;
  /** Les tournois eux-mêmes — lieu et journées, relevés en anonyme (002). */
  readonly tournois: DepotTournois;
  /**
   * Ce que chaque veille voit, et depuis quand — spec 012.
   *
   * Dans le socle avec `tournoi`, et non dans la feature : c'est une passe du
   * socle qui l'écrit. La feature `veille`, elle, garde ses propres critères.
   */
  readonly appartenances: DepotAppartenances;
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
    identites: depotIdentitesSqlite(base),
    reglages: depotReglagesSqlite(base),
    echeances: depotEcheancesSqlite(base),
    compte: depotCompteSqlite(base),
    courrier: depotCourrierSqlite(base),
    engagements: depotEngagementsSqlite(base),
    tournois: depotTournoisSqlite(base),
    appartenances: depotAppartenancesSqlite(base),
    taille: () => tailleDeLaBase(base),
    fermer: () => base.close(),
  };
}
