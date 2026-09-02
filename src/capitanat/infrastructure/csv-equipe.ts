import { licence as versLicence } from "../../socle/core/licence.ts";
import type { Coequipier, MotifDeRefus } from "../core/coequipier.ts";
import { estUnSexe, ImportRefuse } from "../core/coequipier.ts";

/**
 * Le fichier d'équipe — spec 005.
 *
 * `licence;sexe;telephone`, **en-tête obligatoire**, `;` seul, **UTF-8 exigé**.
 *
 * L'en-tête parce que trois colonnes anonymes finissent par s'inverser, et
 * qu'un sexe pris pour un téléphone ne se voit qu'au moment d'appeler.
 * L'encodage strict parce que deviner transforme « Noël » en « NoÃ«l » sans
 * rien signaler — et le seul endroit où un accent peut apparaître ici est
 * justement celui qu'on ne relit pas.
 *
 * Tout ou rien : la fonction rend l'équipe entière ou lève `ImportRefuse` avec
 * la ligne et la raison de chaque anomalie.
 */
const SEPARATEUR = ";";

const COLONNES = ["licence", "sexe", "telephone"] as const;

export function lireLeCsvDeLEquipe(contenu: string): readonly Coequipier[] {
  const motifs: MotifDeRefus[] = [];
  // Le BOM d'un tableur est de l'UTF-8 parfaitement valide : on l'enlève, on
  // ne le reproche pas.
  const lignes = contenu.replace(/^\uFEFF/u, "").split(/\r?\n/u);

  // `\uFFFD` est ce que produit un décodage UTF-8 sur des octets qui n'en sont
  // pas : c'est la trace, et la seule, d'un fichier enregistré en Latin-1.
  // Le refus est ici plutôt qu'à la lecture parce que c'est le seul endroit
  // qui sache dire quelle ligne est abîmée.
  for (const [index, ligne] of lignes.entries()) {
    if (ligne.includes("\uFFFD")) {
      motifs.push({
        ligne: index + 1,
        raison:
          "caractère illisible : le fichier n'est pas en UTF-8. Le réenregistrer en « CSV UTF-8 » depuis le tableur.",
      });
    }
  }
  if (motifs.length > 0) throw new ImportRefuse(motifs);

  const numerotees = lignes
    .map((texte, index) => ({ numero: index + 1, texte }))
    .filter(({ texte }) => texte.trim() !== "");

  const [entete, ...donnees] = numerotees;
  if (entete === undefined) {
    throw new ImportRefuse([{ ligne: null, raison: "fichier vide." }]);
  }

  const colonnes = decouper(entete.texte).map(sansAccent);
  for (const attendue of COLONNES) {
    if (!colonnes.includes(attendue)) {
      motifs.push({
        ligne: entete.numero,
        raison: `colonne « ${attendue} » absente de l'en-tête. Attendu : ${COLONNES.join(SEPARATEUR)}`,
      });
    }
  }
  if (motifs.length > 0) throw new ImportRefuse(motifs);

  const ou = Object.fromEntries(COLONNES.map((nom) => [nom, colonnes.indexOf(nom)])) as Record<
    (typeof COLONNES)[number],
    number
  >;

  // Un fichier sans aucune ligne de données effacerait l'équipe entière sans
  // rien dire. C'est très probablement le mauvais fichier, pas une équipe
  // dissoute : on le refuse comme le reste, et la suppression volontaire passe
  // par un CSV qu'on aura écrit exprès.
  if (donnees.length === 0) {
    throw new ImportRefuse([
      { ligne: null, raison: "aucune ligne de données sous l'en-tête : équipe inchangée." },
    ]);
  }

  const coequipiers: Coequipier[] = [];
  const vues = new Map<string, number>();

  for (const { numero, texte } of donnees) {
    const cellules = decouper(texte);
    if (cellules.length !== colonnes.length) {
      motifs.push({
        ligne: numero,
        raison: `${colonnes.length} colonne(s) attendue(s), ${cellules.length} trouvée(s).`,
      });
      continue;
    }

    const brut = {
      licence: cellules[ou.licence] ?? "",
      sexe: (cellules[ou.sexe] ?? "").toUpperCase(),
      telephone: cellules[ou.telephone] ?? "",
    };

    let licence;
    try {
      // La forme du numéro n'est pas redéfinie ici : c'est celle du socle,
      // partagée avec la mienne et avec celle d'un inscrit de la veille.
      licence = versLicence(brut.licence);
    } catch {
      motifs.push({ ligne: numero, raison: `licence invalide : « ${brut.licence} ».` });
      continue;
    }

    const premiere = vues.get(licence);
    if (premiere !== undefined) {
      motifs.push({
        ligne: numero,
        raison: `licence ${licence} déjà présente ligne ${premiere}.`,
      });
      continue;
    }
    vues.set(licence, numero);

    if (!estUnSexe(brut.sexe)) {
      motifs.push({ ligne: numero, raison: `sexe attendu F ou M, trouvé « ${brut.sexe} ».` });
      continue;
    }

    if (brut.telephone === "") {
      motifs.push({ ligne: numero, raison: "téléphone vide." });
      continue;
    }

    coequipiers.push({ licence, sexe: brut.sexe, telephone: brut.telephone });
  }

  if (motifs.length > 0) throw new ImportRefuse(motifs);
  return coequipiers;
}

function decouper(ligne: string): readonly string[] {
  return ligne.split(SEPARATEUR).map((cellule) => cellule.trim());
}

/**
 * L'en-tête est comparée sans casse ni accent : un tableur français écrit
 * « Téléphone », et refuser l'import pour un accent d'en-tête serait de la
 * rigueur mal placée. Les valeurs, elles, entrent telles quelles.
 */
function sansAccent(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
