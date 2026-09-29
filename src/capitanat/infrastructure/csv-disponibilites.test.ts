import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { MotifDeRefus } from "../core/coequipier.ts";
import { DisponibilitesRefusees } from "../core/disponibilite.ts";
import { lireLeCsvDesDisponibilites } from "./csv-disponibilites.ts";

/**
 * La forme exacte de l'export du sondage J1-J5 de 2026-2027 : en-tête,
 * remarque entre parenthèses, « Si besoin ». Les noms sont inventés.
 */
const SONDAGE = readFileSync(new URL("exemples/sondage-disponibilites.csv", import.meta.url), "utf8");

const ENTETE = "Nom;J1 - jeu. 05/11/2026 20h-22h30 (Ext. BAD18-5);J2 - sam. 14/11/2026 17h30-20h30 (Dom. BAP-5)";

function refus(contenu: string): readonly MotifDeRefus[] {
  try {
    lireLeCsvDesDisponibilites(contenu);
  } catch (erreur) {
    assert.ok(erreur instanceof DisponibilitesRefusees, `attendu un refus, reçu ${String(erreur)}`);
    return erreur.motifs;
  }
  return assert.fail("l'import aurait dû être refusé");
}

describe("l'export du sondage de disponibilités", () => {
  it("lit les journées par numéro et par date, en ignorant horaire et adversaire", () => {
    const { journees } = lireLeCsvDesDisponibilites(SONDAGE);

    assert.deepEqual(journees, [
      { journee: 1, date: "2026-11-05" },
      { journee: 2, date: "2026-11-14" },
      { journee: 3, date: "2026-11-16" },
      { journee: 4, date: "2026-11-28" },
      { journee: 5, date: "2026-12-01" },
    ]);
  });

  it("sépare le nom de sa remarque, et lit les trois réponses", () => {
    const { repondants } = lireLeCsvDesDisponibilites(SONDAGE);
    const [, pepette, anne] = repondants;

    assert.equal(repondants.length, 5);
    assert.equal(pepette?.nom, "Pépette");
    assert.equal(pepette?.remarque, "qui est blessée et qui changera son vote si elle est réparée");
    assert.deepEqual(
      [...(anne?.reponses ?? [])],
      [
        [1, "oui"],
        [2, "oui"],
        [3, "si-besoin"],
        [4, "oui"],
        [5, "non"],
      ],
    );
    assert.equal(repondants[4]?.nom, "Louis de la Butte", "un nom composé reste entier");
  });

  it("ne prend pas une case vide pour une réponse", () => {
    const { repondants } = lireLeCsvDesDisponibilites(`${ENTETE}\nSimon;;Oui\n`);

    assert.deepEqual([...(repondants[0]?.reponses ?? [])], [[2, "oui"]]);
  });

  it("refuse une réponse inconnue, en nommant la ligne", () => {
    assert.deepEqual(refus(`${ENTETE}\nSimon;Peut-être;Oui\n`), [
      { ligne: 2, raison: "« Peut-être » : attendu Oui, Non ou Si besoin." },
    ]);
  });

  it("refuse un nom en double, casse et accents confondus", () => {
    assert.deepEqual(refus(`${ENTETE}\nMélanie;Oui;Oui\nmelanie;Non;Non\n`), [
      { ligne: 3, raison: "« melanie » déjà présent ligne 2." },
    ]);
  });

  it("refuse une colonne qui n'est pas une journée datée", () => {
    const [motif] = refus("Nom;Commentaire\nSimon;rien\n");
    assert.match(motif?.raison ?? "", /ni journée ni date/);
  });

  it("refuse un fichier qui n'est pas en UTF-8", () => {
    const [motif] = refus(`${ENTETE}\nM�lanie;Oui;Oui\n`);
    assert.match(motif?.raison ?? "", /UTF-8/);
  });
});
