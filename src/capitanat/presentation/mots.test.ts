import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enJoueurs, joueursRequis } from "./mots.ts";

describe("les places, écrites comme on les dit", () => {
  it("accorde le nombre et le genre", () => {
    assert.equal(enJoueurs([{ sexe: "M", nombre: 2 }]), "deux hommes");
    assert.equal(enJoueurs([{ sexe: "F", nombre: 1 }]), "une femme");
    assert.equal(enJoueurs([{ sexe: "F", nombre: 2 }]), "deux femmes");
  });

  it("joint les deux sexes du mixte", () => {
    assert.equal(
      enJoueurs([
        { sexe: "M", nombre: 1 },
        { sexe: "F", nombre: 1 },
      ]),
      "un homme et une femme",
    );
  });

  it("accorde le participe sur le groupe entier", () => {
    // Une page qui écrit mal ce qu'elle a compté fait douter du compte.
    assert.equal(
      joueursRequis([{ sexe: "F", nombre: 1 }], "double"),
      "une femme classée en double",
    );
    assert.equal(
      joueursRequis([{ sexe: "F", nombre: 2 }], "double"),
      "deux femmes classées en double",
    );
    assert.equal(
      joueursRequis([{ sexe: "M", nombre: 2 }], "simple"),
      "deux hommes classés en simple",
    );
    assert.equal(
      joueursRequis(
        [
          { sexe: "M", nombre: 1 },
          { sexe: "F", nombre: 1 },
        ],
        "mixte",
      ),
      "un homme et une femme classés en mixte",
      "le masculin l'emporte dès qu'un homme est dans le groupe",
    );
  });
});
