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

/**
 * Les sites lus sans session, en un seul geste manuel : icbad, qui publie les
 * calendriers d'interclub. Ils n'ont ni jeton, ni module d'acquisition, ni
 * tâche ordonnancée — ce ne sont pas des sources au sens de 015 —, mais leurs
 * réponses s'archivent comme les autres (019).
 */
export const SITES_PUBLICS = ["icbad"] as const;

/** Tout site dont une réponse peut être archivée. */
export type SiteArchive = Source | (typeof SITES_PUBLICS)[number];
