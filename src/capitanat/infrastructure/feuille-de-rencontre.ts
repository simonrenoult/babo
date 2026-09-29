import type { LigneDeFeuille } from "../core/composition.ts";

/**
 * La feuille de rencontre officielle, pré-remplie de ma composition — spec 011.
 *
 * icbad publie la feuille de chaque rencontre en PDF (TCPDF, A4 paysage, une
 * page) : deux colonnes d'équipe, la recevante à gauche, et pour chaque match
 * « Licence - Nom Prénom », classement et cote. On n'en redessine rien : on
 * écrit par-dessus, par une **mise à jour incrémentale** — de nouveaux objets
 * ajoutés en fin de fichier, le reste intact, octet pour octet. C'est la
 * feuille du comité, avec son numéro et son en-tête, pas une imitation.
 *
 * Sans bibliothèque : `pdf-lib` en tire quatre autres, l'argument qui a écarté
 * `bcrypt` (021). Il ne faut ici qu'une police standard, un flux de texte et
 * une table de renvois.
 *
 * Les coordonnées ont été relevées le 30 septembre 2026 sur la feuille de la
 * J01 du groupe B de l'ICD75 D3 Mixte : les libellés de colonne pour les
 * abscisses, ceux des matchs (SH1, DH1…) pour les ordonnées. Un match de
 * double occupe deux sous-lignes, à 10,8 points de part et d'autre du libellé.
 */
export class FeuilleIllisible extends Error {
  constructor(raison: string) {
    super(`La feuille de rencontre n'a pas pu être complétée : ${raison}`);
    this.name = "FeuilleIllisible";
  }
}

const BASES: Readonly<Record<LigneDeFeuille["match"], number>> = {
  SH1: 455.04,
  SH2: 425.86,
  SD1: 396.68,
  DH1: 360.41,
  DD1: 317.06,
  DX1: 273.71,
};
const DEMI_DOUBLE = 10.8;

/** Nom, classement, cote : le début de chaque colonne, plus une marge de 2 points. */
const COLONNES = {
  domicile: { identite: 93.2, classement: 249.0, cote: 271.6 },
  exterieur: { identite: 311.2, classement: 467.0, cote: 489.6 },
} as const;
const LARGEUR_IDENTITE = 152;
const CORPS = 7.5;

export function completerLaFeuille(
  pdf: Uint8Array,
  options: { readonly cote: "domicile" | "exterieur"; readonly lignes: readonly LigneDeFeuille[] },
): Uint8Array {
  const texte = Buffer.from(pdf).toString("latin1");
  if (!texte.startsWith("%PDF-")) throw new FeuilleIllisible("ce n'est pas un PDF.");

  const page = /(\d+) 0 obj\s*(<<\s*\/Type \/Page\b[^]*?>>)\s*endobj/u.exec(texte);
  const trailer = /trailer\s*<<([^]*?)>>\s*startxref\s*(\d+)\s*%%EOF\s*$/u.exec(texte);
  if (page === null || trailer === null) throw new FeuilleIllisible("page ou table de renvois introuvable.");
  const [, numeroDePage = "", dictionnaireDePage = ""] = page;
  const [, dictionnaireDuTrailer = "", precedente = ""] = trailer;

  const taille = Number(/\/Size (\d+)/u.exec(dictionnaireDuTrailer)?.[1]);
  const racine = /\/Root (\d+ \d+ R)/u.exec(dictionnaireDuTrailer)?.[1];
  const ressources = /\/Resources (\d+) 0 R/u.exec(dictionnaireDePage)?.[1];
  const contenus = /\/Contents (\d+ 0 R)/u.exec(dictionnaireDePage)?.[1];
  if (!Number.isInteger(taille) || racine === undefined || ressources === undefined || contenus === undefined) {
    throw new FeuilleIllisible("la page n'a pas la forme attendue (ressources ou contenu indirects).");
  }
  const dictionnaireDesRessources = new RegExp(`(?:^|\\n)${ressources} 0 obj\\s*(<<[^]*?>>)\\s*endobj`, "u").exec(
    texte,
  )?.[1];
  if (dictionnaireDesRessources === undefined) throw new FeuilleIllisible("ressources de la page introuvables.");

  // Trois objets neufs : la police, un « q » qui isole l'état graphique de la
  // page d'origine, et notre texte, qui commence par le « Q » correspondant.
  const police = taille;
  const ouverture = taille + 1;
  const notreTexte = taille + 2;

  const flux = texteDesLignes(options);
  const objets: [number, string][] = [
    [police, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"],
    [ouverture, fluxBrut("q\n")],
    [notreTexte, fluxBrut(`Q\n${flux}`)],
    [Number(ressources), ajouterLaPolice(dictionnaireDesRessources, police)],
    [
      Number(numeroDePage),
      dictionnaireDePage.replace(`/Contents ${contenus}`, `/Contents [${ouverture} 0 R ${contenus} ${notreTexte} 0 R]`),
    ],
  ];

  let ajout = texte.endsWith("\n") ? "" : "\n";
  const decalages = new Map<number, number>();
  for (const [numero, corps] of objets) {
    decalages.set(numero, pdf.length + Buffer.byteLength(ajout, "latin1"));
    ajout += `${numero} 0 obj\n${corps}\nendobj\n`;
  }

  const debutDeLaTable = pdf.length + Buffer.byteLength(ajout, "latin1");
  ajout += "xref\n";
  for (const numero of [...decalages.keys()].toSorted((un, autre) => un - autre)) {
    ajout += `${numero} 1\n${String(decalages.get(numero)).padStart(10, "0")} 00000 n \n`;
  }
  ajout += `trailer\n<< /Size ${taille + 3} /Root ${racine} /Prev ${precedente} >>\nstartxref\n${debutDeLaTable}\n%%EOF\n`;

  return Buffer.concat([Buffer.from(pdf), Buffer.from(ajout, "latin1")]);
}

function texteDesLignes(options: {
  readonly cote: "domicile" | "exterieur";
  readonly lignes: readonly LigneDeFeuille[];
}): string {
  const colonnes = COLONNES[options.cote];
  const operations: string[] = ["BT", `/FBabo ${CORPS} Tf`, "0 0 0 rg"];
  const ecrire = (x: number, y: number, valeur: string) =>
    operations.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${chaine(valeur)}) Tj`);

  for (const { match, joueurs } of options.lignes) {
    const base = BASES[match];
    const hauteurs = joueurs.length > 1 ? [base + DEMI_DOUBLE, base - DEMI_DOUBLE] : [base];
    for (const [index, joueur] of joueurs.entries()) {
      const y = hauteurs[index];
      if (joueur === null || y === undefined) continue;
      ecrire(colonnes.identite, y, tronquer(joueur.identite));
      ecrire(colonnes.classement, y, joueur.classement);
      ecrire(colonnes.cote, y, joueur.cote);
    }
  }
  operations.push("ET");
  return `${operations.join("\n")}\n`;
}

function fluxBrut(contenu: string): string {
  return `<< /Length ${Buffer.byteLength(contenu, "latin1")} >>\nstream\n${contenu}\nendstream`;
}

/** Ajoute `/FBabo` au dictionnaire `/Font` des ressources, ou le crée. */
function ajouterLaPolice(ressources: string, police: number): string {
  const entree = `/FBabo ${police} 0 R`;
  if (/\/Font\s*<</u.test(ressources)) return ressources.replace(/\/Font\s*<</u, `/Font << ${entree}`);
  if (/\/Font\s+\d+ 0 R/u.test(ressources)) {
    throw new FeuilleIllisible("les polices de la page sont indirectes, forme non prévue.");
  }
  return ressources.replace(/^<</u, `<< /Font << ${entree} >>`);
}

/**
 * Une chaîne PDF en WinAnsi : Latin-1 plus les quelques signes que Windows a
 * glissés dans 0x80-0x9F — l'apostrophe typographique d'abord, fréquente dans
 * les noms de club. Le reste devient « ? » plutôt que de casser la feuille.
 */
function chaine(valeur: string): string {
  const WINDOWS: Readonly<Record<string, string>> = {
    "’": "\x92",
    "‘": "\x91",
    "“": "\x93",
    "”": "\x94",
    "–": "\x96",
    "—": "\x97",
    œ: "\x9c",
    Œ: "\x8c",
    "€": "\x80",
    // Le séparateur de milliers que rend `toLocaleString("fr-FR")` — espace
    // fine insécable — n'existe pas en WinAnsi : une espace simple le remplace.
    "\u202f": " ",
    "\u2009": " ",
  };
  return [...valeur]
    .map((signe) => WINDOWS[signe] ?? (signe.charCodeAt(0) <= 0xff ? signe : "?"))
    .join("")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

/** Helvetica 7,5 : environ 3,9 points par signe en moyenne — on coupe avant la colonne suivante. */
function tronquer(valeur: string): string {
  const maximum = Math.floor(LARGEUR_IDENTITE / 3.9);
  return valeur.length <= maximum ? valeur : `${valeur.slice(0, maximum - 1)}…`.replace("…", ".");
}
