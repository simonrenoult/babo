import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fraicheur, periodeEnJours } from "./fraicheur.ts";

const MAINTENANT = new Date(2026, 8, 10, 12, 0);
const JOUR = 24 * 60 * 60_000;

const ilYA = (jours: number) => new Date(MAINTENANT.getTime() - jours * JOUR);

const HEBDOMADAIRE = { nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 } as const;
const QUOTIDIENNE = { nature: "quotidienne", heure: 6, minute: 0 } as const;

describe("la période attendue d'une cadence", () => {
  it("se lit sur la cadence, sans seuil à inventer", () => {
    assert.equal(periodeEnJours(QUOTIDIENNE), 1);
    assert.equal(periodeEnJours(HEBDOMADAIRE), 7);
  });

  it("n'existe pas pour une cadence ponctuelle", () => {
    // Ses échéances sont inscrites une par une par l'appelant (018) : il n'y a
    // pas de rythme auquel comparer quoi que ce soit.
    assert.equal(periodeEnJours({ nature: "ponctuelle" }), null);
  });
});

describe("la fraîcheur d'une donnée", () => {
  it("ne dit rien tant que la donnée tient dans sa période", () => {
    assert.equal(fraicheur(ilYA(6), HEBDOMADAIRE, MAINTENANT).perimee, false);
    assert.equal(fraicheur(ilYA(0.5), QUOTIDIENNE, MAINTENANT).perimee, false);
  });

  it("signale la donnée qui a dépassé la période de sa propre cadence", () => {
    const perimee = fraicheur(ilYA(9), HEBDOMADAIRE, MAINTENANT);

    assert.equal(perimee.perimee, true);
    assert.equal(perimee.ageEnJours, 9);
    assert.equal(perimee.periodeEnJours, 7);
  });

  /**
   * Jamais relevée n'est pas périmée : les pages le disent déjà en toutes
   * lettres plutôt que d'afficher un tableau de tirets (001, 028), et
   * confondre les deux ferait passer une mise en service pour une panne.
   */
  it("ne confond pas « jamais relevée » avec « périmée »", () => {
    const jamais = fraicheur(null, HEBDOMADAIRE, MAINTENANT);

    assert.equal(jamais.perimee, false);
    assert.equal(jamais.ageEnJours, null);
  });

  it("ne juge rien quand la cadence n'a pas de rythme", () => {
    assert.equal(fraicheur(ilYA(400), { nature: "ponctuelle" }, MAINTENANT).perimee, false);
  });

  /**
   * Une passe du vendredi lue le jeudi suivant a presque sept jours : elle n'a
   * rien manqué. Le seuil est la période, pas une marge choisie à la main.
   */
  it("laisse passer la veille du prochain tour", () => {
    assert.equal(fraicheur(ilYA(6.9), HEBDOMADAIRE, MAINTENANT).perimee, false);
    assert.equal(fraicheur(ilYA(7.1), HEBDOMADAIRE, MAINTENANT).perimee, true);
  });
});
