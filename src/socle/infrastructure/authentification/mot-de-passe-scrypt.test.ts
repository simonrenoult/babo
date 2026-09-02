import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { motDePasseScrypt } from "./mot-de-passe-scrypt.ts";

const CLAIR = "un-mot-de-passe-de-test";

describe("le haché du mot de passe", () => {
  it("reconnaît le mot de passe, et lui seul", () => {
    const hachage = motDePasseScrypt();
    const hache = hachage.hacher(CLAIR);

    assert.equal(hachage.verifier(CLAIR, hache), true);
    assert.equal(hachage.verifier(`${CLAIR} `, hache), false);
    assert.equal(hachage.verifier("", hache), false);
  });

  it("ne contient jamais le clair, et porte ses paramètres", () => {
    const hache = motDePasseScrypt().hacher(CLAIR);

    assert.doesNotMatch(hache, /un-mot-de-passe/);
    assert.match(hache, /^scrypt\$16384\$8\$1\$/, "durcissables plus tard sans invalider l'existant");
  });

  it("sale chaque haché : deux fois le même mot de passe, deux écritures", () => {
    const hachage = motDePasseScrypt();
    assert.notEqual(hachage.hacher(CLAIR), hachage.hacher(CLAIR));
  });

  it("rend faux sur un haché illisible, sans lever", () => {
    // Le chemin emprunté quand aucun compte n'existe : l'appelant compare
    // contre du vide, et ne doit pas apprendre par une exception que le compte
    // manque (021).
    const hachage = motDePasseScrypt();
    for (const hache of ["", "n'importe quoi", "scrypt$1$2$3", "bcrypt$a$b$c$d$e"]) {
      assert.equal(hachage.verifier(CLAIR, hache), false, hache);
    }
  });
});
