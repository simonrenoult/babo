import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { issueDuVolume } from "./rapport-execution.ts";

describe("l'issue d'une exécution, déduite du volume extrait", () => {
  it("tient pour un succès une extraction non vide", () => {
    assert.equal(issueDuVolume(12, 40), "succes");
  });

  it("tient pour une panne une extraction vide alors que la précédente extrayait", () => {
    assert.equal(issueDuVolume(0, 40), "vide");
  });

  it("ne crie pas sur une extraction vide quand la précédente l'était déjà", () => {
    assert.equal(issueDuVolume(0, 0), "succes");
  });

  it("ne crie pas sur la toute première exécution", () => {
    assert.equal(issueDuVolume(0, null), "succes");
  });

  it("ne juge pas sur une variation de volume, si forte soit-elle", () => {
    // Les volumes varient légitimement beaucoup : matchs après un week-end de
    // compétition, tournois en début de saison. La règle est binaire.
    assert.equal(issueDuVolume(1, 400), "succes");
  });
});
