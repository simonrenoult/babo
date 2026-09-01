import type { Source } from "./source.ts";

/**
 * Le jeton de session myffbad — specs 015 et 017.
 *
 * C'est la raison d'être immédiate de la base : gardé en mémoire, il est perdu
 * à chaque redémarrage et coûte une reconnexion manuelle — et, côté badnet, un
 * passage par la 2FA que ce site impose et que myffbad n'a pas. Les
 * identifiants, eux, restent en variable d'environnement et n'entrent jamais
 * ici.
 */
export type JetonMyffbad = {
  readonly valeur: string;
  readonly obtenuLe: Date;
  /** Un mois, vérifié. Passé cette date, le scraper s'arrête et le signale. */
  readonly expireLe: Date;
};

export function jetonValide(jeton: JetonMyffbad | null, maintenant: Date): boolean {
  return jeton !== null && jeton.expireLe.getTime() > maintenant.getTime();
}

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotJetonMyffbad = {
  /** Il n'y a jamais qu'un jeton en cours pour une source donnée. */
  lire(source: Source): JetonMyffbad | null;
  enregistrer(source: Source, jeton: JetonMyffbad): void;
  effacer(source: Source): void;
};
