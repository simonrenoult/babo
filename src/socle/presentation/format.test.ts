import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cadenceLisible, heure } from "./format.ts";

describe("l'heure, telle qu'on l'écrit", () => {
  it("tait les minutes d'une heure pile", () => {
    assert.equal(heure(new Date(2026, 10, 5, 20, 0)), "20h");
  });

  it("colle les minutes à l'heure, sans zéro devant l'heure", () => {
    assert.equal(heure(new Date(2026, 10, 5, 20, 30)), "20h30");
    assert.equal(heure(new Date(2026, 10, 5, 8, 5)), "8h05");
  });
});

describe("la cadence, telle qu'on la dit", () => {
  it("nomme le jour et l'heure, au format de l'heure", () => {
    assert.equal(cadenceLisible({ nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 }), "chaque vendredi à 1h");
    assert.equal(cadenceLisible({ nature: "quotidienne", heure: 5, minute: 30 }), "chaque jour à 5h30");
    assert.equal(cadenceLisible({ nature: "ponctuelle" }), "au fil de l'eau");
  });
});
