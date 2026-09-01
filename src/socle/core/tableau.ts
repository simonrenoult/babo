/**
 * Un tableau de compétition. Notion partagée par les trois features : `profil`
 * y range ses ratios, `capitanat` ses préférences, `veille` ses critères.
 */
export const TABLEAUX = ["SH", "SD", "DH", "DD", "MX"] as const;

export type Tableau = (typeof TABLEAUX)[number];

export function estUnTableau(valeur: string): valeur is Tableau {
  return (TABLEAUX as readonly string[]).includes(valeur);
}
