import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { licence } from "./licence.ts";

describe("le numéro de licence", () => {
  it("accepte un numéro fédéral et le débarrasse de ses espaces", () => {
    assert.equal(licence(" 07123456 "), "07123456");
  });

  it("complète les zéros de tête que le tableur a mangés", () => {
    // myffbad le fait lui-même : la fiche demandée pour 409390 répond pour
    // 00409390. Sans ça, les deux écritures désignent la même personne et font
    // deux clés différentes (spec 028).
    assert.equal(licence("7194591"), "07194591");
    assert.equal(licence("409390"), "00409390");
    assert.equal(licence("07194591"), "07194591", "un numéro déjà complet ne bouge pas");
  });

  it("refuse ce qui n'en est pas un", () => {
    assert.throws(() => licence("07-12-34"), /invalide/);
    assert.throws(() => licence(""), /invalide/);
    assert.throws(() => licence("123456789"), /invalide/, "neuf chiffres n'est pas une licence");
  });
});
