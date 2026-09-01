import type { Source } from "./source.ts";

/**
 * Le déploiement d'une source, tel qu'on l'observe — spec 015.
 *
 * myffbad annonce son `buildId` dans chaque réponse. C'est la seule prise
 * qu'on ait sur la péremption des identifiants de Server Action : ils sont
 * calculés à la construction, donc un build neuf peut les avoir invalidés.
 *
 * On ne garde qu'une ligne par build, pas une par observation : la question
 * posée est « à quelle fréquence ce site redéploie-t-il ? », et une passe
 * quotidienne qui ne change rien n'y répond pas.
 */
export type BuildObserve = {
  readonly source: Source;
  readonly build: string;
  readonly vuLaPremiereFois: Date;
  readonly vuLaDerniereFois: Date;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotBuilds = {
  /** Consigne l'observation. Rend `true` si ce build n'avait jamais été vu. */
  observer(source: Source, build: string, maintenant: Date): boolean;
  /** Le dernier build vu pour cette source. */
  courant(source: Source): BuildObserve | null;
  /** Du plus récemment vu au plus ancien : c'est la fréquence de déploiement. */
  historique(source: Source): readonly BuildObserve[];
};

/**
 * Ce que l'écran des sources affiche d'un déploiement — spec 015.
 *
 * `builds` compte les déploiements observés depuis la première passe : c'est
 * la mesure qui dira s'il faut un jour un navigateur sans écran pour
 * redécouvrir les identifiants d'action, ou si les relever à la main une fois
 * l'an suffit.
 */
export type EtatDuDeploiement = {
  readonly source: Source;
  readonly build: string | null;
  readonly depuis: Date | null;
  readonly builds: number;
  readonly actionsPeutEtrePerimees: boolean;
};
