import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DepotRapports, RapportArchive, RapportExecution } from "./rapport-execution.ts";
import type { DepotTournois, TournoiDeLaRecherche } from "./tournoi.ts";
import type { AccesALaRecherche, DepotAppartenances, RechercheDeTournois } from "./passe-veilles.ts";
import { releverLesVeilles, tacheDesVeilles } from "./passe-veilles.ts";

const MAINTENANT = new Date("2026-09-09T05:15:00.000Z");
const horloge = { maintenant: () => MAINTENANT };

function depotRapports(): DepotRapports & { readonly consignes: RapportExecution[] } {
  const consignes: RapportExecution[] = [];
  return {
    consignes,
    consigner: (rapport) => {
      consignes.push(rapport);
      return { ...rapport, id: consignes.length } as RapportArchive;
    },
    dernierRapport: () => null,
    dernierSucces: () => null,
    derniers: () => [],
    depuis: () => [],
  };
}

function depotTournois(): DepotTournois & { readonly ecrits: TournoiDeLaRecherche[] } {
  const ecrits: TournoiDeLaRecherche[] = [];
  return {
    ecrits,
    enregistrerLaFiche: () => {},
    enregistrerDepuisLaRecherche: (tournois) => ecrits.push(...tournois),
    parEvenement: () => new Map(),
    connus: () => new Set(),
    sansFiche: () => [],
  };
}

function depotAppartenances(dedans: Record<number, readonly number[]> = {}): DepotAppartenances {
  const etat = new Map(Object.entries(dedans).map(([veille, liste]) => [Number(veille), [...liste]]));
  return {
    constater(veille, evenements) {
      const avant = etat.get(veille) ?? [];
      const entres = evenements.filter((evenement) => !avant.includes(evenement));
      const sortis = avant.filter((evenement) => !evenements.includes(evenement));
      etat.set(veille, [...evenements]);
      return { entres, sortis };
    },
    tournoisDe: (veille) => etat.get(veille) ?? [],
  };
}

const recherche = (id: number, intitule: string): RechercheDeTournois => ({
  id,
  intitule,
  autourDe: { longitude: 2.3488, latitude: 48.8534 },
  rayonKm: 50,
  disciplines: ["double"],
  categories: [],
});

const trouve = (evenement: number): TournoiDeLaRecherche => ({
  evenement,
  nom: `Tournoi ${evenement}`,
  latitude: 48.9,
  longitude: 2.3,
  dateLimite: null,
  familles: "D, P, NC",
  categories: "Seniors",
});

function acces(
  reponses: Record<number, readonly number[] | Error>,
  annonces: Record<number, number> = {},
): AccesALaRecherche {
  return {
    chercher(recherche) {
      const reponse = reponses[recherche.id];
      if (reponse instanceof Error) return Promise.reject(reponse);
      return Promise.resolve({
        tournois: (reponse ?? []).map(trouve),
        annonces: annonces[recherche.id] ?? null,
      });
    },
  };
}

describe("la passe des veilles", () => {
  it("range ce que chaque veille voit, sous son propre identifiant", async () => {
    const tournois = depotTournois();
    const appartenances = depotAppartenances();
    const rapports = depotRapports();

    await releverLesVeilles({
      recherches: [recherche(1, "DH avec Louis"), recherche(2, "En région")],
      tournois,
      appartenances,
      rapports,
      horloge,
      acces: acces({ 1: [50750, 50898], 2: [50898] }),
    });

    // Le tournoi 50898 est vu par les deux veilles, et n'existe qu'une fois
    // dans l'index : c'est l'argument que 002 a écrit en séparant `tournoi`
    // d'`engagement`.
    assert.deepEqual(appartenances.tournoisDe(1), [50750, 50898]);
    assert.deepEqual(appartenances.tournoisDe(2), [50898]);
    assert.equal(rapports.consignes[0]?.tache, tacheDesVeilles());
    assert.equal(rapports.consignes[0]?.issue, "succes");
  });

  it("n'arrête pas les autres pour une veille muette", async () => {
    // La clémence de la passe de classement : sans elle, une veille dont les
    // coordonnées sont fausses priverait les quatre autres de leur relevé.
    const rapports = depotRapports();

    const rapport = await releverLesVeilles({
      recherches: [recherche(1, "DH avec Louis"), recherche(2, "En région")],
      tournois: depotTournois(),
      appartenances: depotAppartenances(),
      rapports,
      horloge,
      acces: acces({ 1: [50750], 2: new Error("badnet n'a rien rendu") }),
    });

    assert.equal(rapport.issue, "succes");
    assert.match(rapport.detail ?? "", /1 veille\(s\) relevée\(s\) sur 2/);
    assert.match(rapport.detail ?? "", /« En région » muette : badnet n'a rien rendu/);
  });

  it("échoue seulement quand aucune veille ne répond", async () => {
    const rapport = await releverLesVeilles({
      recherches: [recherche(1, "DH avec Louis")],
      tournois: depotTournois(),
      appartenances: depotAppartenances(),
      rapports: depotRapports(),
      horloge,
      acces: acces({ 1: new Error("badnet n'a rien rendu") }),
    });

    assert.equal(rapport.issue, "echec");
  });

  it("consigne l'écart entre l'annonce et la carte", async () => {
    // `data-markers` ne porte que les tournois géolocalisés. On les ignore,
    // mais le jour où badnet cesse de géolocaliser, le rapport le dit — au lieu
    // que l'index maigrisse en silence (019).
    const rapport = await releverLesVeilles({
      recherches: [recherche(1, "DH avec Louis")],
      tournois: depotTournois(),
      appartenances: depotAppartenances(),
      rapports: depotRapports(),
      horloge,
      acces: acces({ 1: [50750, 50898] }, { 1: 8 }),
    });

    assert.match(rapport.detail ?? "", /8 annoncé\(s\), 2 géolocalisé\(s\)/);
  });

  it("se tait sur l'écart quand il n'y en a pas", async () => {
    // L'écrire à chaque ligne en ferait un élément de décor — le reproche que
    // 019 fait déjà au « donnée fraîche » permanent.
    const rapport = await releverLesVeilles({
      recherches: [recherche(1, "DH avec Louis")],
      tournois: depotTournois(),
      appartenances: depotAppartenances(),
      rapports: depotRapports(),
      horloge,
      acces: acces({ 1: [50750] }, { 1: 1 }),
    });

    assert.doesNotMatch(rapport.detail ?? "", /annoncé/);
  });

  it("nomme les entrées et les sorties, pas seulement le total", async () => {
    const rapport = await releverLesVeilles({
      recherches: [recherche(1, "DH avec Louis")],
      tournois: depotTournois(),
      appartenances: depotAppartenances({ 1: [50750, 51245] }),
      rapports: depotRapports(),
      horloge,
      acces: acces({ 1: [50750, 50898] }),
    });

    assert.match(rapport.detail ?? "", /1 nouveau\(x\) et 1 sorti\(s\)/);
  });

  it("dit qu'aucune veille n'est active, plutôt que de se taire", async () => {
    // Une passe muette est indistinguable d'une passe morte, et c'est le trou
    // que 019 a passé une spec entière à boucher.
    const rapport = await releverLesVeilles({
      recherches: [],
      tournois: depotTournois(),
      appartenances: depotAppartenances(),
      rapports: depotRapports(),
      horloge,
      acces: acces({}),
    });

    assert.equal(rapport.issue, "succes");
    assert.match(rapport.detail ?? "", /aucune veille active/);
  });
});
