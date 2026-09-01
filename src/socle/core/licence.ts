/**
 * Un numéro de licence fédérale.
 *
 * Il n'appartient à aucun module : `mon-profil` y voit le mien, `capitanat` celui
 * d'un coéquipier, `veille` celui d'un inscrit. C'est exactement le genre de
 * type que le socle porte — et `Joueur`, lui, n'y montera jamais (spec 022).
 */
export type Licence = string & { readonly __marque: "Licence" };

const FORME_ATTENDUE = /^\d{6,8}$/;

export function licence(valeur: string): Licence {
  const nettoyee = valeur.trim();
  if (!FORME_ATTENDUE.test(nettoyee)) {
    throw new Error(`Numéro de licence invalide : « ${valeur} »`);
  }
  return nettoyee as Licence;
}
