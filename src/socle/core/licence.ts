/**
 * Un numéro de licence fédérale.
 *
 * Il n'appartient à aucun module : `mon-profil` y voit le mien, `capitanat` celui
 * d'un coéquipier, `veille` celui d'un inscrit. C'est exactement le genre de
 * type que le socle porte — et `Joueur`, lui, n'y montera jamais (spec 022).
 */
export type Licence = string & { readonly __marque: "Licence" };

const FORME_ATTENDUE = /^\d{6,8}$/;

/**
 * Huit chiffres, zéros de tête compris — spec 028.
 *
 * Un numéro fédéral s'écrit sur huit chiffres, et myffbad le montre lui-même :
 * la fiche demandée pour `409390` répond pour `00409390`, celle demandée pour
 * `7194591` répond pour `07194591`. Un tableur, lui, traite la colonne comme un
 * nombre et mange les zéros de tête au premier export en CSV.
 *
 * Sans normalisation ici, les deux écritures désignent la même personne mais
 * font deux clés différentes : la moitié de l'équipe se retrouve muette au
 * relevé, avec un message qui accuse myffbad d'avoir répondu pour quelqu'un
 * d'autre. Le padding est donc dans le constructeur du type, pas chez l'un de
 * ses appelants — c'est la seule place où aucun chemin ne peut l'oublier.
 */
const LONGUEUR = 8;

export function licence(valeur: string): Licence {
  const nettoyee = valeur.trim();
  if (!FORME_ATTENDUE.test(nettoyee)) {
    throw new Error(`Numéro de licence invalide : « ${valeur} »`);
  }
  return nettoyee.padStart(LONGUEUR, "0") as Licence;
}
