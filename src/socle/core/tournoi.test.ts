import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { journeesLibellees } from "./tournoi.ts";

const jour = (iso: string) => new Date(`${iso}T12:00:00`);

describe("les dates d'un tournoi, telles que la page les écrit", () => {
  it("nomme le jour quand le tournoi tient sur une journée", () => {
    assert.equal(journeesLibellees([jour("2026-10-24")], jour("2026-10-24")), "samedi 24 octobre");
  });

  it("écrit l'intervalle sans répéter le mois", () => {
    // « du 24 octobre au 25 octobre » bégaie ; « du 24 au 25 octobre » se lit.
    assert.equal(
      journeesLibellees([jour("2026-10-24"), jour("2026-10-25")], jour("2026-10-24")),
      "du 24 au 25 octobre",
    );
  });

  it("répète le mois quand le tournoi l'enjambe", () => {
    assert.equal(
      journeesLibellees([jour("2026-10-31"), jour("2026-11-01")], jour("2026-10-31")),
      "du 31 octobre au 1 novembre",
    );
  });

  it("retombe sur la date de badnet quand aucune journée n'est connue", () => {
    // La date unique de `/competitions` reste vraie, même incomplète : mieux
    // vaut une date partielle qu'une case vide.
    assert.equal(journeesLibellees([], jour("2026-11-07")), "samedi 7 novembre");
  });
});
