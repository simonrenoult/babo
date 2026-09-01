import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseSqlite } from "./connexion.ts";

const DOSSIER_PAR_DEFAUT = join(import.meta.dirname, "migrations");

/**
 * Applique les migrations non encore appliquées, dans l'ordre des noms.
 *
 * 017 laissait ouverte la question d'un mécanisme de migration dès le départ :
 * il en faut un, parce que la même spec annonce que le schéma des matchs et des
 * tournois se dessinera après la sonde de 015, sur des pages réellement
 * observées. Le schéma est donc appelé à bouger avant la première mise en
 * production.
 *
 * Chaque migration est appliquée dans une transaction : elle passe entière ou
 * pas du tout.
 */
export function migrer(base: BaseSqlite, dossier: string = DOSSIER_PAR_DEFAUT): readonly string[] {
  base.exec(
    "create table if not exists migration (nom text primary key, appliquee_le text not null)",
  );

  const dejaAppliquees = new Set(
    base
      .prepare("select nom from migration")
      .all()
      .map((ligne) => (ligne as { nom: string }).nom),
  );

  const aAppliquer = readdirSync(dossier)
    .filter((fichier) => fichier.endsWith(".sql"))
    .sort()
    .filter((fichier) => !dejaAppliquees.has(fichier));

  const enregistrer = base.prepare("insert into migration (nom, appliquee_le) values (?, ?)");
  for (const fichier of aAppliquer) {
    const sql = readFileSync(join(dossier, fichier), "utf8");
    base.transaction(() => {
      base.exec(sql);
      enregistrer.run(fichier, new Date().toISOString());
    })();
  }

  return aAppliquer;
}
