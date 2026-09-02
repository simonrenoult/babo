import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jetonHmac } from "./jeton-hmac.ts";

const SECRET = "un-secret-de-signature-de-test";
const CHARGE = {
  licence: "07194591",
  connecteLe: new Date("2026-03-01T08:00:00Z"),
  expireLe: new Date("2026-03-31T08:00:00Z"),
};

describe("le jeton signé", () => {
  it("relit ce qu'il a signé, aux secondes près", () => {
    const signature = jetonHmac(SECRET);
    assert.deepEqual(signature.lire(signature.signer(CHARGE)), CHARGE);
  });

  it("refuse un jeton signé d'un autre secret", () => {
    // C'est le seul levier de révocation d'un jeton sans état : faire tourner
    // le secret invalide tout d'un coup (021).
    const jeton = jetonHmac(SECRET).signer(CHARGE);
    assert.equal(jetonHmac("un-autre-secret").lire(jeton), null);
  });

  it("refuse une charge modifiée après signature", () => {
    const signature = jetonHmac(SECRET);
    const [entete, , sceau] = signature.signer(CHARGE).split(".") as [string, string, string];
    const forgee = Buffer.from(
      JSON.stringify({ sub: "00000001", cnx: 1, exp: 9_999_999_999 }),
    ).toString("base64url");

    assert.equal(signature.lire(`${entete}.${forgee}.${sceau}`), null);
  });

  it("refuse un jeton qui prétend n'être pas signé", () => {
    // L'attaque classique sur les JWT : annoncer `alg: none` et compter sur un
    // vérificateur qui croit l'en-tête sur parole.
    const signature = jetonHmac(SECRET);
    const entete = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const charge = Buffer.from(
      JSON.stringify({ sub: "07194591", cnx: 1, exp: 9_999_999_999 }),
    ).toString("base64url");

    assert.equal(signature.lire(`${entete}.${charge}.`), null);
  });

  it("refuse ce qui n'a pas la forme d'un jeton", () => {
    const signature = jetonHmac(SECRET);
    for (const brut of ["", "abc", "a.b", "a.b.c.d", "a.b.c"]) {
      assert.equal(signature.lire(brut), null, brut);
    }
  });

  it("refuse une charge bien signée mais incomplète", () => {
    // Un jeton d'une version antérieure du format, par exemple : mieux vaut
    // redemander le mot de passe que reconstruire des dates au jugé.
    const signature = jetonHmac(SECRET);
    const entete = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const charge = Buffer.from(JSON.stringify({ sub: "07194591" })).toString("base64url");
    const corps = `${entete}.${charge}`;
    const bricole = jetonHmac(SECRET).signer(CHARGE).split(".")[2];

    assert.equal(signature.lire(`${corps}.${bricole}`), null);
  });
});
