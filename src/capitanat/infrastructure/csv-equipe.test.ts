import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ImportRefuse } from "../core/coequipier.ts";
import { lireLeCsvDeLEquipe } from "./csv-equipe.ts";

const ENTETE = "licence;sexe;telephone";

function refus(contenu: string): readonly { ligne: number | null; raison: string }[] {
  try {
    lireLeCsvDeLEquipe(contenu);
  } catch (erreur) {
    assert.ok(erreur instanceof ImportRefuse, `attendu un refus, reçu ${String(erreur)}`);
    return erreur.motifs;
  }
  return assert.fail("l'import aurait dû être refusé");
}

describe("le fichier d'équipe", () => {
  it("lit les trois colonnes, téléphone tel quel", () => {
    const equipe = lireLeCsvDeLEquipe(
      `${ENTETE}\n07194591;M;06 12 34 56 78\n02345678;F;+32 475 12 34 56\n`,
    );

    assert.deepEqual(equipe, [
      { licence: "07194591", sexe: "M", telephone: "06 12 34 56 78" },
      // Le numéro belge entre tel quel : on vérifie qu'il existe, jamais sa
      // forme, sinon c'est lui qu'on rejette.
      { licence: "02345678", sexe: "F", telephone: "+32 475 12 34 56" },
    ]);
  });

  it("garde l'ordre du fichier et tolère CRLF, BOM et lignes vides", () => {
    // Ce que rend un tableur : BOM, fins de ligne Windows, ligne finale vide.
    const equipe = lireLeCsvDeLEquipe(`﻿${ENTETE}\r\n07194591;M;0612345678\r\n\r\n`);

    assert.equal(equipe.length, 1);
    assert.equal(equipe[0]?.licence, "07194591");
  });

  it("lit l'en-tête plutôt que l'ordre des colonnes", () => {
    // C'est la raison d'être de l'en-tête : trois colonnes anonymes finissent
    // par s'inverser, et un sexe pris pour un téléphone ne se voit qu'au
    // moment d'appeler.
    const equipe = lireLeCsvDeLEquipe("Téléphone;Licence;Sexe\n0612345678;07194591;M\n");

    assert.deepEqual(equipe, [{ licence: "07194591", sexe: "M", telephone: "0612345678" }]);
  });

  it("exige l'en-tête, et nomme la colonne manquante", () => {
    const motifs = refus("licence;telephone\n07194591;0612345678\n");

    assert.equal(motifs.length, 1);
    assert.match(motifs[0]?.raison ?? "", /sexe/);
    assert.equal(motifs[0]?.ligne, 1);
  });

  it("prend la première ligne pour une en-tête, jamais pour un joueur", () => {
    // Sans en-tête obligatoire, la première ligne de données serait avalée en
    // silence : l'équipe arriverait amputée d'un joueur sans une erreur.
    const motifs = refus("07194591;M;0612345678\n02345678;F;0612345679\n");

    assert.equal(motifs[0]?.ligne, 1, "l'en-tête est la ligne 1, fautive ici");
  });

  it("refuse tout l'import pour une seule ligne fautive", () => {
    const motifs = refus(
      `${ENTETE}\n07194591;M;0612345678\n0719;M;0612345679\n02345678;F;0612345670\n`,
    );

    assert.equal(motifs.length, 1);
    assert.equal(motifs[0]?.ligne, 3);
    assert.match(motifs[0]?.raison ?? "", /licence invalide/);
  });

  it("rend toutes les anomalies d'un coup, pas seulement la première", () => {
    // La correction se fait dans le tableur : une anomalie par aller-retour
    // ferait recommencer l'import cinq fois.
    const motifs = refus(
      `${ENTETE}\n07194591;X;0612345678\n02345678;F;\n03456789;M\n07194591;M;0612345671\n`,
    );

    assert.deepEqual(
      motifs.map(({ ligne }) => ligne),
      [2, 3, 4, 5],
    );
    assert.match(motifs[0]?.raison ?? "", /F ou M/);
    assert.match(motifs[1]?.raison ?? "", /téléphone vide/);
    assert.match(motifs[2]?.raison ?? "", /3 colonne\(s\) attendue\(s\), 2 trouvée\(s\)/);
    assert.match(motifs[3]?.raison ?? "", /déjà présente ligne 2/);
  });

  it("refuse un fichier qui n'est pas en UTF-8, plutôt que de garder « NoÃ«l »", () => {
    // Un décodage UTF-8 sur du Latin-1 ne rend pas d'erreur : il rend
    // U+FFFD. C'est la seule trace, et sans elle un accent abîmé se découvre
    // à l'usage, des mois plus tard.
    const latin1 = Buffer.from(`${ENTETE}\n07194591;M;06 12 34 56 78 (No\xebl)\n`, "latin1");
    const motifs = refus(latin1.toString("utf8"));

    assert.equal(motifs[0]?.ligne, 2);
    assert.match(motifs[0]?.raison ?? "", /UTF-8/);
  });

  it("refuse un fichier sans ligne de données, qui effacerait l'équipe en silence", () => {
    const motifs = refus(`${ENTETE}\n`);

    assert.equal(motifs.length, 1);
    assert.equal(motifs[0]?.ligne, null);
    assert.match(motifs[0]?.raison ?? "", /aucune ligne/);
  });

  it("refuse un fichier vide", () => {
    assert.match(refus("")[0]?.raison ?? "", /vide/);
  });
});
