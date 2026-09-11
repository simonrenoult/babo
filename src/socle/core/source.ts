/**
 * Les deux sites fédéraux dont Babo tire ses données — spec 015.
 *
 * Chaque donnée a une source et une seule ; les deux sont acquises et
 * ordonnancées séparément, pour qu'une panne de l'une n'arrête pas l'autre.
 */
export const SOURCES = ["myffbad", "badnet"] as const;

export type Source = (typeof SOURCES)[number];

export function estUneSource(valeur: string): valeur is Source {
  return (SOURCES as readonly string[]).includes(valeur);
}
