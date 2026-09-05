import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DepotEngagements, Engagement } from "../../socle/core/engagement.ts";
import type { DepotTournois, Tournoi } from "../../socle/core/tournoi.ts";
import { licence } from "../../socle/core/licence.ts";
import { intituleDeLEngagement, prochainsTournois } from "./prochains-tournois.ts";

const MAINTENANT = new Date("2026-09-05T14:30:00");

function engagement(options: {
  evenement: number;
  nom?: string;
  date: string;
  statut?: string | null;
  tableaux?: Engagement["tableaux"];
}): Engagement {
  return {
    evenement: options.evenement,
    nom: options.nom ?? `TOURNOI ${options.evenement}`,
    // Midi, comme 027 l'écrit en base : une date de tournoi n'a pas d'heure.
    date: new Date(`${options.date}T12:00:00`),
    statut: options.statut ?? null,
    tableaux: options.tableaux ?? [],
  };
}

function depot(engagements: readonly Engagement[]): DepotEngagements {
  return {
    remplacer: () => {},
    tous: () => engagements,
    compter: () => engagements.length,
  };
}

function lieux(tournois: readonly Tournoi[] = []): DepotTournois {
  return {
    enregistrer: () => {},
    parEvenement: () => new Map(tournois.map((tournoi) => [tournoi.evenement, tournoi])),
    connus: () => new Set(tournois.map(({ evenement }) => evenement)),
  };
}

function tournoi(evenement: number, jours: readonly string[]): Tournoi {
  return {
    evenement,
    gymnase: "Armand Silvestre",
    adresse: "188 Rue Armand Silvestre 92400 Courbevoie",
    ville: "Courbevoie",
    journees: jours.map((jour) => new Date(`${jour}T12:00:00`)),
  };
}

describe("mes prochains tournois, tels que la page les montre", () => {
  it("range les tournois par date croissante", () => {
    const affiches = prochainsTournois(
      depot([
        engagement({ evenement: 3, date: "2026-11-07" }),
        engagement({ evenement: 1, date: "2026-09-19" }),
        engagement({ evenement: 2, date: "2026-10-24" }),
      ]),
      lieux(),
      MAINTENANT,
    );

    assert.deepEqual(
      affiches.map(({ evenement }) => evenement),
      [1, 2, 3],
    );
  });

  it("départage deux tournois du même jour sur leur identifiant", () => {
    // Sans second critère, deux tournois du même jour changeraient de place
    // d'un rendu à l'autre : le tri ne serait pas un ordre.
    const affiches = prochainsTournois(
      depot([
        engagement({ evenement: 90, date: "2026-10-24" }),
        engagement({ evenement: 12, date: "2026-10-24" }),
      ]),
      lieux(),
      MAINTENANT,
    );

    assert.deepEqual(
      affiches.map(({ evenement }) => evenement),
      [12, 90],
    );
  });

  it("écarte les tournois passés", () => {
    const affiches = prochainsTournois(
      depot([
        engagement({ evenement: 1, date: "2026-05-30" }),
        engagement({ evenement: 2, date: "2026-10-24" }),
      ]),
      lieux(),
      MAINTENANT,
    );

    assert.deepEqual(
      affiches.map(({ evenement }) => evenement),
      [2],
    );
  });

  it("garde le tournoi du jour, même consulté l'après-midi", () => {
    // Le seuil est le début du jour et non l'instant : un tournoi se joue toute
    // la journée, et le faire disparaître à midi une — le matin même où on
    // consulte la page pour savoir où l'on va — serait le contraire du but.
    const affiches = prochainsTournois(
      depot([engagement({ evenement: 7, date: "2026-09-05" })]),
      lieux(),
      MAINTENANT,
    );

    assert.deepEqual(
      affiches.map(({ evenement }) => evenement),
      [7],
    );
  });

  it("ne rend aucun lieu tant que la fiche publique n'est pas relevée", () => {
    // `/competitions` ne porte pas la ville. La page le dit en toutes lettres
    // plutôt que d'aligner des tirets muets (001).
    const [affiche] = prochainsTournois(
      depot([engagement({ evenement: 1, date: "2026-10-24" })]),
      lieux(),
      MAINTENANT,
    );

    assert.equal(affiche?.lieu, null);
  });

  it("sert la ville relevée sur la fiche publique", () => {
    const [affiche] = prochainsTournois(
      depot([engagement({ evenement: 1, date: "2026-10-24" })]),
      lieux([tournoi(1, ["2026-10-24", "2026-10-25"])]),
      MAINTENANT,
    );

    assert.equal(affiche?.lieu, "Courbevoie");
  });

  it("écrit l'intervalle quand la fiche publique rend plusieurs journées", () => {
    // `/competitions` ne rend qu'une date : afficher « 24 octobre » perdrait la
    // moitié d'un tournoi qui se joue le samedi *et* le dimanche.
    const [affiche] = prochainsTournois(
      depot([engagement({ evenement: 1, date: "2026-10-24" })]),
      lieux([tournoi(1, ["2026-10-24", "2026-10-25"])]),
      MAINTENANT,
    );

    assert.equal(affiche?.quand, "du 24 au 25 octobre");
  });

  it("retombe sur la date unique de badnet tant que le lieu manque", () => {
    const [affiche] = prochainsTournois(
      depot([engagement({ evenement: 1, date: "2026-10-24" })]),
      lieux(),
      MAINTENANT,
    );

    assert.equal(affiche?.quand, "samedi 24 octobre");
  });

  it("mène à la fiche badnet du tournoi", () => {
    // C'est le seul endroit où une inscription se modifie ou s'annule.
    const [affiche] = prochainsTournois(
      depot([engagement({ evenement: 50750, date: "2026-10-24" })]),
      lieux(),
      MAINTENANT,
    );

    assert.equal(affiche?.fiche, "https://badnet.fr/joueur/tournoi?eventid=50750");
  });

  it("sert le statut tel que badnet l'écrit, sans en tirer de règle", () => {
    // 002 et 027 se sont renvoyé la question d'une échelle des statuts. La
    // réponse est qu'il n'y en a pas : trois phrases observées sur un tournoi
    // ne font pas une taxonomie.
    const [affiche] = prochainsTournois(
      depot([engagement({ evenement: 1, date: "2026-10-24", statut: "Inscription payée" })]),
      lieux(),
      MAINTENANT,
    );

    assert.equal(affiche?.statut, "Inscription payée");
  });
});

describe("l'intitulé d'un engagement", () => {
  it("réunit le tableau, la série et le partenaire", () => {
    // Ensemble et non en deux colonnes : un même tournoi se joue en double et
    // en mixte avec deux partenaires, et deux listes parallèles obligeraient le
    // lecteur à les réapparier lui-même.
    assert.equal(
      intituleDeLEngagement({
        tableau: "DH",
        serie: "S4",
        partenaire: { licence: licence("06571233"), nom: "MARTIN Claire" },
      }),
      "DH S4 avec MARTIN Claire",
    );
  });

  it("tait le partenaire d'un simple", () => {
    assert.equal(
      intituleDeLEngagement({ tableau: "SH", serie: "S3", partenaire: null }),
      "SH S3",
    );
  });

  it("tait la série que badnet n'annonce pas", () => {
    assert.equal(intituleDeLEngagement({ tableau: "MX", serie: null, partenaire: null }), "MX");
  });
});
