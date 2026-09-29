import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageDeGroupe, Rencontre } from "./calendrier.ts";
import { CalendrierRefuse, adversaireDe, calendrierDeLEquipe, recoitOn } from "./calendrier.ts";

const BAP = { nom: "Bad’ à Paname 5", code: "75-BAP-5" };
const RCF = { nom: "Racing Club de France 4", code: "75-RCF-4" };
const AC = { nom: "Art et Culture 15eme 2", code: "75-AC1-2" };

function rencontre(id: number, debut: string, domicile = BAP, exterieur = RCF): Rencontre {
  return { id, journee: id, debut: new Date(debut), lieu: "Gymnase", domicile, exterieur };
}

const PAGE: PageDeGroupe = {
  competition: "ICD75 D3 Mixte",
  groupe: "Groupe B",
  rencontres: [
    rencontre(2, "2026-11-24T20:30:00", AC, BAP),
    rencontre(1, "2026-11-03T20:30:00"),
    rencontre(3, "2026-11-05T19:30:00", RCF, AC),
  ],
};

const DEMANDE = { url: "https://icbad.ffbad.org/competition/1/tableau/2", importeLe: new Date() };

describe("le calendrier de mon équipe", () => {
  it("ne garde que ses rencontres, par date, quelle que soit la casse du code", () => {
    const calendrier = calendrierDeLEquipe(PAGE, { ...DEMANDE, code: " 75-bap-5 " });

    assert.deepEqual(calendrier.equipe, BAP);
    assert.deepEqual(
      calendrier.rencontres.map(({ id }) => id),
      [1, 2],
    );
  });

  it("nomme les équipes du groupe quand le code n'y est pas", () => {
    assert.throws(
      () => calendrierDeLEquipe(PAGE, { ...DEMANDE, code: "75-BAP-4" }),
      (erreur) =>
        erreur instanceof CalendrierRefuse && /75-AC1-2, 75-BAP-5, 75-RCF-4/.test(erreur.message),
    );
  });

  it("dit qui reçoit et contre qui", () => {
    const [aDomicile, aLExterieur] = calendrierDeLEquipe(PAGE, { ...DEMANDE, code: "75-BAP-5" }).rencontres;
    assert.ok(aDomicile !== undefined && aLExterieur !== undefined);

    assert.equal(recoitOn(aDomicile, BAP), true);
    assert.deepEqual(adversaireDe(aDomicile, BAP), RCF);
    assert.equal(recoitOn(aLExterieur, BAP), false);
    assert.deepEqual(adversaireDe(aLExterieur, BAP), AC);
  });
});
