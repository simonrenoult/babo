import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import type { Database as BaseSqlite } from "better-sqlite3";
import type { ConfigurationBase } from "../../core/configuration.ts";

export type { BaseSqlite };

export class CleDeChiffrementInvalide extends Error {
  constructor(chemin: string) {
    super(
      `La base ${chemin} ne s'ouvre pas avec cette clé. Ni la clé ni le fichier ne sont modifiés : vérifier BABO_BASE_CLE.`,
    );
    this.name = "CleDeChiffrementInvalide";
  }
}

/**
 * Ouvre l'unique base de l'application — spec 017.
 *
 * Une base, un fichier, une instance : c'est ce que suppose le planificateur
 * interne de 018 et ce qu'impose la forme retenue en 020.
 *
 * Le chiffrement au repos est appliqué ici et nulle part ailleurs : la base
 * porte les coordonnées des coéquipiers, et c'est ce fichier qu'on recopie
 * pour sauvegarder (023).
 */
export function ouvrirLaBase(configuration: ConfigurationBase): BaseSqlite {
  const { chemin, cle } = configuration;
  if (chemin !== ":memory:") {
    mkdirSync(dirname(chemin), { recursive: true });
  }

  const base = new Database(chemin);
  base.pragma("cipher='sqlcipher'");
  base.pragma(`key='${cle.replaceAll("'", "''")}'`);

  try {
    // Première lecture réelle : c'est elle qui déchiffre l'en-tête, donc elle
    // qui distingue une mauvaise clé d'un fichier absent.
    base.prepare("select count(*) from sqlite_master").get();
  } catch {
    base.close();
    throw new CleDeChiffrementInvalide(chemin);
  }

  base.pragma("journal_mode = WAL");
  base.pragma("foreign_keys = ON");
  base.pragma("busy_timeout = 5000");
  return base;
}

/** Taille du fichier, telle qu'annoncée par le battement hebdomadaire (019). */
export function tailleDeLaBase(base: BaseSqlite): number {
  const pages = Number(base.pragma("page_count", { simple: true }));
  const taillePage = Number(base.pragma("page_size", { simple: true }));
  return pages * taillePage;
}
