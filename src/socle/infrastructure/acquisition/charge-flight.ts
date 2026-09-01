/**
 * Lecture d'une charge « flight » Next.js — spec 015.
 *
 * myffbad ne rend pas des balises mais des lignes numérotées, `<id>:<valeur>`,
 * que le navigateur recolle. On les lit là où elles arrivent :
 *
 * - dans une page, poussées par `self.__next_f.push([1, "…"])` ;
 * - dans la réponse d'une Server Action, à nu, une par ligne.
 *
 * Ce module ne connaît que cette enveloppe. Il rend des objets bruts et ne
 * nomme aucune notion métier : c'est `mon-profil` qui saura qu'un classement
 * est un classement (spec 022). Le tenir ici, et non chez l'appelant, c'est ce
 * qui permet d'en changer quand myffbad changera de version de Next.
 */
export type ChargeFlight = ReadonlyMap<string, unknown>;

const POUSSEE = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
const LIGNE = /^([0-9a-zA-Z]+):(.*)$/;

export function lireLaChargeFlight(contenu: string): ChargeFlight {
  const lignes = new Map<string, unknown>();

  for (const ligne of decoller(contenu).split("\n")) {
    const decoupe = LIGNE.exec(ligne);
    if (decoupe === null) continue;

    const [, identifiant, valeur] = decoupe as unknown as [string, string, string];
    // Une ligne peut porter autre chose que du JSON — une référence de module
    // (`I[…]`), un renvoi (`$@1`). On la garde telle quelle plutôt que de la
    // perdre : ce qui ne se lit pas ici se lira peut-être ailleurs.
    lignes.set(identifiant, essayerJson(valeur));
  }

  return lignes;
}

/**
 * Trouve la première ligne qui porte toutes ces clés.
 *
 * Les identifiants de ligne changent d'une réponse à l'autre — ils dépendent de
 * l'ordre de rendu, pas du contenu. Chercher par forme plutôt que par numéro,
 * c'est la différence entre un parseur qui survit à un redéploiement de myffbad
 * et un parseur qui casse (spec 019).
 */
export function ligneQuiPorte(
  charge: ChargeFlight,
  clefs: readonly string[],
): Record<string, unknown> | null {
  for (const valeur of charge.values()) {
    if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) continue;
    const objet = valeur as Record<string, unknown>;
    if (clefs.every((clef) => clef in objet)) return objet;
  }
  return null;
}

/** Recolle les fragments d'une page ; laisse passer une réponse déjà à nu. */
function decoller(contenu: string): string {
  const fragments = [...contenu.matchAll(POUSSEE)].map(
    ([, litteral]) => JSON.parse(litteral as string) as string,
  );
  return fragments.length === 0 ? contenu : fragments.join("");
}

function essayerJson(valeur: string): unknown {
  try {
    return JSON.parse(valeur);
  } catch {
    return valeur;
  }
}
