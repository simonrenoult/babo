import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { lireLaChargeFlight, ligneQuiPorte } from "./charge-flight.ts";

/**
 * Les exemples sont des réponses réelles de myffbad, relevées le 1er septembre
 * 2026 — le seul étalon qui vaille pour un format que personne ne documente.
 * Le fichier des résultats est raccourci à trois lignes ; le reste est
 * identique au flux.
 */
function exemple(nom: string): string {
  return readFileSync(new URL(`exemples/${nom}.txt`, import.meta.url), "utf8");
}

describe("la charge flight d'une Server Action", () => {
  it("sépare l'enveloppe de la donnée", () => {
    const charge = lireLaChargeFlight(exemple("myffbad-classement"));

    assert.deepEqual(charge.get("0"), {
      a: "$@1",
      f: "",
      q: "",
      i: false,
      b: "DQCg8nwBq71o32okRTijN",
    });
    assert.equal(charge.size, 2);
  });

  it("rend le classement tel que myffbad l'écrit", () => {
    const charge = lireLaChargeFlight(exemple("myffbad-classement"));
    const classement = ligneQuiPorte(charge, ["SimpleSubLevel", "DoubleSubLevel", "MixteSubLevel"]);

    assert.partialDeepStrictEqual(classement, {
      RankingDate: "2026-09-01",
      SimpleSubLevel: "D9",
      SimpleRate: "936.00",
      DoubleSubLevel: "D8",
      DoubleRate: "1311.00",
      MixteSubLevel: "D9",
      MixteRate: "1007.00",
      // Les seuils de montée et de descente : c'est ce que 024 veut tracer.
      SimpleUpSubLevel: "D8",
      SimpleUpRate: "1181.00",
      DoubleDownSubLevel: "D9",
    });
  });

  it("rend les résultats, tournois et interclubs mêlés", () => {
    const charge = lireLaChargeFlight(exemple("myffbad-resultats"));
    const resultats = charge.get("1") as Record<string, unknown>[];

    assert.equal(resultats.length, 3);
    assert.partialDeepStrictEqual(resultats[0], {
      Date: "2026-07-04",
      EventName: "3ème Tournoi des Plumes Givrées",
      DisciplineId: "3",
      SubName: "D8",
      MatchCount: "5",
      WinPoints: "74.0000",
    });
    // Un interclub se reconnaît à son `SubName` : deux équipes, pas une série.
    assert.match(String(resultats[2]?.["SubName"]), /contre/);
  });

  it("recolle une charge poussée en fragments dans une page", () => {
    const page = [
      '<script>self.__next_f.push([1,"1:{\\"Rank',
      'ingDate\\":\\"2026-09-01\\"}\\n"])</script>',
    ].join("");

    assert.deepEqual(lireLaChargeFlight(page).get("1"), { RankingDate: "2026-09-01" });
  });

  it("garde les lignes qui ne sont pas du JSON plutôt que de les perdre", () => {
    const charge = lireLaChargeFlight('2:I["module",["a.js"],"default"]\n3:"$Sreact.fragment"');

    // `I[…]` n'est pas du JSON : gardé tel quel, à charge de qui saura le lire.
    assert.equal(charge.get("2"), 'I["module",["a.js"],"default"]');
    assert.equal(charge.get("3"), "$Sreact.fragment");
  });

  it("ne trouve rien plutôt que d'inventer, quand la forme attendue a disparu", () => {
    const charge = lireLaChargeFlight(exemple("myffbad-resultats"));

    assert.equal(ligneQuiPorte(charge, ["SimpleSubLevel"]), null);
  });
});
