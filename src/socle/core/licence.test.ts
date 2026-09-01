import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { licence } from "./licence.ts";

describe("le numéro de licence", () => {
  it("accepte un numéro fédéral et le débarrasse de ses espaces", () => {
    assert.equal(licence(" 07123456 "), "07123456");
  });

  it("refuse ce qui n'en est pas un", () => {
    assert.throws(() => licence("07-12-34"), /invalide/);
    assert.throws(() => licence(""), /invalide/);
  });
});
