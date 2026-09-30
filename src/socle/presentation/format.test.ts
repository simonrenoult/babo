import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cadenceLisible } from "./format.ts";

describe("la cadence, telle qu'on la dit", () => {
  it("nomme le jour et l'heure, au format de l'heure", () => {
    assert.equal(cadenceLisible({ nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 }), "chaque vendredi à 1h");
    assert.equal(cadenceLisible({ nature: "quotidienne", heure: 5, minute: 30 }), "chaque jour à 5h30");
    assert.equal(cadenceLisible({ nature: "ponctuelle" }), "au fil de l'eau");
  });
});
