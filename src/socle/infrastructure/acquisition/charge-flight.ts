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
 * Trouve le premier objet qui porte toutes ces clés, où qu'il soit.
 *
 * Les identifiants de ligne changent d'une réponse à l'autre — ils dépendent de
 * l'ordre de rendu, pas du contenu. Chercher par forme plutôt que par numéro,
 * c'est la différence entre un parseur qui survit à un redéploiement de myffbad
 * et un parseur qui casse (spec 019).
 *
 * La descente dans les tableaux n'est pas un raffinement : les deux blocs
 * qu'on lit ne sont pas logés à la même profondeur. L'action `classement` rend
 * son objet à plat, en tête de ligne ; l'identité de la fiche est enfouie dans
 * l'élément React qui la rend, `["$", "$L44", null, { personId, fullName… }]`
 * (spec 028). Un parseur qui ne regarderait que le premier niveau lirait l'un
 * et pas l'autre, sans que rien ne le dise.
 */
export function objetQuiPorte(
  charge: ChargeFlight,
  clefs: readonly string[],
): Record<string, unknown> | null {
  for (const valeur of charge.values()) {
    const trouve = descendre(valeur, clefs);
    if (trouve !== null) return trouve;
  }
  return null;
}

function descendre(valeur: unknown, clefs: readonly string[]): Record<string, unknown> | null {
  if (typeof valeur !== "object" || valeur === null) return null;

  if (Array.isArray(valeur)) {
    for (const element of valeur) {
      const trouve = descendre(element, clefs);
      if (trouve !== null) return trouve;
    }
    return null;
  }

  const objet = valeur as Record<string, unknown>;
  if (clefs.every((clef) => clef in objet)) return objet;

  for (const enfant of Object.values(objet)) {
    const trouve = descendre(enfant, clefs);
    if (trouve !== null) return trouve;
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
