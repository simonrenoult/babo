import type { Capture, CaptureArchivee, DepotCaptures } from "../../core/capture.ts";
import type { SiteArchive } from "../../core/source.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = {
  id: number;
  source: string;
  url: string;
  statut_http: number;
  contenu: string;
  capturee_le: string;
};

/** Adaptateur SQLite du port `DepotCaptures` — specs 017 et 019. */
export function depotCapturesSqlite(base: BaseSqlite): DepotCaptures {
  const insertion = base.prepare(
    `insert into capture (source, url, statut_http, contenu, capturee_le)
     values (?, ?, ?, ?, ?)`,
  );
  const parSource = base.prepare(
    `select id, source, url, statut_http, contenu, capturee_le from capture
     where source = ? order by capturee_le desc, id desc limit ?`,
  );
  const parId = base.prepare(
    "select id, source, url, statut_http, contenu, capturee_le from capture where id = ?",
  );
  const comptage = base.prepare("select count(*) as total from capture");

  return {
    archiver(capture: Capture): CaptureArchivee {
      const resultat = insertion.run(
        capture.source,
        capture.url,
        capture.statutHttp,
        capture.contenu,
        capture.captureeLe.toISOString(),
      );
      return { ...capture, id: Number(resultat.lastInsertRowid) };
    },

    dernieres(source: SiteArchive, combien: number): readonly CaptureArchivee[] {
      return (parSource.all(source, combien) as Ligne[]).map(versCapture);
    },

    parIdentifiant(id: number): CaptureArchivee | null {
      const ligne = parId.get(id) as Ligne | undefined;
      return ligne === undefined ? null : versCapture(ligne);
    },

    compter(): number {
      return (comptage.get() as { total: number }).total;
    },
  };
}

function versCapture(ligne: Ligne): CaptureArchivee {
  return {
    id: ligne.id,
    source: ligne.source as SiteArchive,
    url: ligne.url,
    statutHttp: ligne.statut_http,
    contenu: ligne.contenu,
    captureeLe: new Date(ligne.capturee_le),
  };
}
