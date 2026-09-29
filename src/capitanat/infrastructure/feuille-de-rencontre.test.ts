import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FeuilleIllisible, completerLaFeuille } from "./feuille-de-rencontre.ts";

/**
 * Un PDF minimal de la forme que TCPDF produit pour la feuille d'icbad : une
 * page, ressources et contenu indirects, table de renvois classique. La vraie
 * feuille n'est pas versée au dépôt — elle porte le nom et la licence du
 * capitaine adverse ; elle a été vérifiée à l'œil le 30 septembre 2026.
 */
function feuilleVierge(): Buffer {
  const objets = [
    "<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>",
    "<< /ProcSet [/PDF /Text] /Font << /F1 5 0 R >> >>",
    "<< /Type /Page /Parent 1 0 R /Resources 2 0 R /MediaBox [0 0 841.89 595.276] /Contents 4 0 R /Group << /Type /Group /S /Transparency >> >>",
    "<< /Length 5 >>\nstream\nq Q\n\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Catalog /Pages 1 0 R >>",
  ];
  let pdf = "%PDF-1.7\n";
  const decalages: number[] = [];
  for (const [index, corps] of objets.entries()) {
    decalages.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${corps}\nendobj\n`;
  }
  const table = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  pdf += decalages.map((decalage) => `${String(decalage).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 6 0 R >>\nstartxref\n${table}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const LIGNES = [
  { match: "SH1", joueurs: [{ identite: "07194591 - Simon RENOULT", classement: "D9", cote: "1 311,2" }] },
  {
    match: "DX1",
    joueurs: [null, { identite: "00000002 - Bad’ (Chloé)", classement: "D8", cote: "1 400" }],
  },
] as const;

describe("la feuille de rencontre complétée", () => {
  it("garde la feuille d'origine octet pour octet, et y ajoute une mise à jour", () => {
    const vierge = feuilleVierge();
    const remplie = Buffer.from(completerLaFeuille(vierge, { cote: "exterieur", lignes: LIGNES }));

    assert.ok(remplie.subarray(0, vierge.length).equals(vierge), "rien de l'original n'est réécrit");
    const ajout = remplie.subarray(vierge.length).toString("latin1");
    assert.match(ajout, /\/Prev \d+ >>/, "la nouvelle table renvoie à l'ancienne");
    assert.match(ajout, /\/Contents \[8 0 R 4 0 R 9 0 R\]/, "notre texte s'ajoute au contenu, entre q et Q");
    assert.match(ajout, /\/Font << \/FBabo 7 0 R \/F1 5 0 R >>/, "la police rejoint celles de la page");
    assert.match(ajout, /\/Size 10 /);
  });

  it("écrit les joueurs dans la colonne de l'équipe, en WinAnsi échappé", () => {
    const ajout = Buffer.from(completerLaFeuille(feuilleVierge(), { cote: "exterieur", lignes: LIGNES }))
      .toString("latin1");

    assert.match(ajout, /1 0 0 1 311\.20 455\.04 Tm \(07194591 - Simon RENOULT\) Tj/);
    assert.match(ajout, /1 0 0 1 467\.00 455\.04 Tm \(D9\) Tj/);
    // Le mixte : place du haut vide, dame en bas ; l'apostrophe en 0x92, les
    // parenthèses échappées.
    assert.match(ajout, /1 0 0 1 311\.20 262\.91 Tm \(00000002 - Bad\x92 \\\(Chloé\\\)\) Tj/);
    assert.doesNotMatch(ajout, /284\.51 Tm/, "une place vide n'écrit rien");
  });

  it("écrit la cote telle que le français la sépare, sans point d'interrogation", () => {
    const ajout = Buffer.from(
      completerLaFeuille(feuilleVierge(), {
        cote: "exterieur",
        lignes: [
          {
            match: "SH1",
            joueurs: [{ identite: "x", classement: "D9", cote: (1311.2).toLocaleString("fr-FR") }],
          },
        ],
      }),
    ).toString("latin1");

    assert.match(ajout, /\(1 311,2\) Tj/);
    assert.doesNotMatch(ajout, /\?/);
  });

  it("écrit à gauche quand l'équipe reçoit", () => {
    const ajout = Buffer.from(completerLaFeuille(feuilleVierge(), { cote: "domicile", lignes: LIGNES }))
      .toString("latin1");

    assert.match(ajout, /1 0 0 1 93\.20 455\.04 Tm \(07194591/);
  });

  it("pointe chaque renvoi sur son objet", () => {
    const remplie = Buffer.from(completerLaFeuille(feuilleVierge(), { cote: "exterieur", lignes: LIGNES }))
      .toString("latin1");
    const table = remplie.slice(remplie.lastIndexOf("xref\n"));

    for (const [, numero, decalage] of table.matchAll(/^(\d+) 1\n(\d{10}) 00000 n/gmu)) {
      assert.ok(remplie.startsWith(`${numero} 0 obj`, Number(decalage)), `objet ${numero}`);
    }
    const debut = Number(/startxref\n(\d+)\n%%EOF\n$/u.exec(remplie)?.[1]);
    assert.ok(remplie.startsWith("xref", debut));
  });

  it("refuse ce qui n'est pas un PDF", () => {
    assert.throws(
      () => completerLaFeuille(Buffer.from("<html>Maintenance</html>"), { cote: "domicile", lignes: [] }),
      FeuilleIllisible,
    );
  });
});
