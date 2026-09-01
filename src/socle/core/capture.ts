import type { Source } from "./source.ts";

/**
 * Une réponse HTML brute, archivée avant analyse — spec 019.
 *
 * Écrite en base dès la première requête : un parseur devenu aveugle se
 * corrige en rejouant les captures, sans requête réseau sur un compte dont le
 * bannissement est un risque assumé. Ces mêmes captures servent de fixtures.
 */
export type Capture = {
  readonly source: Source;
  readonly url: string;
  readonly statutHttp: number;
  readonly contenu: string;
  readonly captureeLe: Date;
};

export type CaptureArchivee = Capture & { readonly id: number };

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotCaptures = {
  archiver(capture: Capture): CaptureArchivee;
  /** Rejeu d'un parseur : les captures d'une source, de la plus récente à la plus ancienne. */
  dernieres(source: Source, combien: number): readonly CaptureArchivee[];
  parIdentifiant(id: number): CaptureArchivee | null;
  /** Alimente la taille annoncée par le battement hebdomadaire (019). */
  compter(): number;
};
