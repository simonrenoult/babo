/**
 * Un tableau de compétition. Notion partagée par les trois features : `mon-profil`
 * y range ses ratios, `capitanat` ses préférences, `veille` ses critères.
 */
export const TABLEAUX = ["SH", "SD", "DH", "DD", "MX"] as const;

export type Tableau = (typeof TABLEAUX)[number];

export function estUnTableau(valeur: string): valeur is Tableau {
  return (TABLEAUX as readonly string[]).includes(valeur);
}

/**
 * Le nom que le capitaine lit sur une feuille de match — spec 029.
 *
 * `MX` et non `DX` : c'est l'écriture de la fédération, et c'est elle qui fait
 * foi partout où le code parle à une source. L'intitulé, lui, est ce qu'on
 * écrit sur un écran — les deux ne se confondent pas.
 *
 * Il descend ici avec `Tableau` parce qu'un nom de tableau n'a pas une version
 * vue par `capitanat` et une autre vue par `veille` (spec 022).
 */
export const INTITULES: Record<Tableau, string> = {
  SH: "Simple hommes",
  SD: "Simple dames",
  DH: "Double hommes",
  DD: "Double dames",
  MX: "Double mixte",
};
