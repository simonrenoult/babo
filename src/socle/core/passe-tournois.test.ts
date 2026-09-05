import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DepotEngagements, Engagement } from "./engagement.ts";
import type { DepotRapports, RapportArchive, RapportExecution } from "./rapport-execution.ts";
import type { DepotTournois, Tournoi } from "./tournoi.ts";
import type { AccesAuxFichesPubliques } from "./passe-tournois.ts";
import { releverLesTournois } from "./passe-tournois.ts";

const MAINTENANT = new Date("2026-09-05T05:00:00Z");

function engagement(evenement: number): Engagement {
  return {
    evenement,
    nom: `TOURNOI ${evenement}`,
    date: new Date("2026-10-24T12:00:00"),
    statut: null,
    tableaux: [],
  };
}

function depotEngagements(evenements: readonly number[]): DepotEngagements {
  const engagements = evenements.map(engagement);
  return {
    remplacer: () => {},
    tous: () => engagements,
    compter: () => engagements.length,
  };
}

function depotRapports(): DepotRapports & { readonly consignes: RapportExecution[] } {
  const consignes: RapportExecution[] = [];
  return {
    consignes,
    consigner: (rapport) => {
      consignes.push(rapport);
      return { ...rapport, id: consignes.length } satisfies RapportArchive;
    },
    dernierRapport: () => null,
    dernierSucces: () => null,
    derniers: () => [],
    depuis: () => [],
  };
}

function depotTournois(
  deja: readonly number[] = [],
): DepotTournois & { readonly ecrits: Tournoi[] } {
  const ecrits: Tournoi[] = [];
  const connus = new Set(deja);
  return {
    ecrits,
    enregistrer: (tournoi) => {
      ecrits.push(tournoi);
      connus.add(tournoi.evenement);
    },
    parEvenement: () => new Map(),
    connus: () => connus,
  };
}

function acces(
  echecs: Record<number, Error> = {},
): AccesAuxFichesPubliques & { readonly demandes: number[] } {
  const demandes: number[] = [];
  return {
    demandes,
    ficheDe: (evenement) => {
      demandes.push(evenement);
      const echec = echecs[evenement];
      if (echec !== undefined) return Promise.reject(echec);
      return Promise.resolve({
        evenement,
        gymnase: "Armand Silvestre",
        adresse: "188 Rue Armand Silvestre 92400 Courbevoie",
        ville: "Courbevoie",
        journees: [new Date("2026-10-24T12:00:00")],
      });
    },
  };
}

function passe(options: {
  readonly evenements: readonly number[];
  readonly dejaConnus?: readonly number[];
  readonly echecs?: Record<number, Error>;
}) {
  const rapports = depotRapports();
  const chaine = acces(options.echecs ?? {});
  const tournois = depotTournois(options.dejaConnus);
  return {
    rapports,
    chaine,
    tournois,
    lancer: () =>
      releverLesTournois({
        engagements: depotEngagements(options.evenements),
        tournois,
        rapports,
        horloge: { maintenant: () => MAINTENANT },
        acces: chaine,
      }),
  };
}

describe("la passe des fiches publiques de tournoi", () => {
  it("part de mes engagements, et d'eux seuls", async () => {
    // La recherche publique de badnet est géographique : elle rend les tournois
    // d'un rayon, pas les miens. Partir des engagements est le seul chemin qui
    // réponde pour un tournoi où qu'il ait lieu.
    const { chaine, lancer } = passe({ evenements: [50750, 50902] });
    await lancer();

    assert.deepEqual(chaine.demandes, [50750, 50902]);
  });

  it("ne redemande pas un tournoi déjà connu : une ville ne change pas", async () => {
    // Relire douze fiches par jour pour une donnée figée est exactement le
    // genre de passe qui fait bannir un compte (015).
    const { chaine, lancer } = passe({ evenements: [50750, 50902], dejaConnus: [50750] });
    await lancer();

    assert.deepEqual(chaine.demandes, [50902]);
  });

  it("écrit le lieu relevé", async () => {
    const { tournois, lancer } = passe({ evenements: [50750] });
    await lancer();

    assert.equal(tournois.ecrits[0]?.ville, "Courbevoie");
  });

  it("consigne « rien à relever » plutôt que de se taire", async () => {
    // Une passe d'acquisition muette est indistinguable d'une passe morte, et
    // c'est le trou que 019 a passé une spec entière à boucher.
    const { rapports, chaine, lancer } = passe({ evenements: [] });
    const rapport = await lancer();

    assert.equal(chaine.demandes.length, 0, "aucune requête sans engagement");
    assert.equal(rapport.issue, "succes");
    assert.equal(rapport.volumeExtrait, 0);
    assert.match(rapport.detail ?? "", /aucun à relever/);
    assert.equal(rapports.consignes.length, 1);
  });

  it("consigne sous une tâche à elle, distincte des engagements", async () => {
    // Elle est anonyme : la consigner avec les engagements ferait passer pour
    // morte une chaîne qui va très bien le jour où la session tombe.
    const { lancer } = passe({ evenements: [50750] });
    const rapport = await lancer();

    assert.equal(rapport.tache, "acquisition:badnet:tournois");
  });

  it("n'échoue pas pour une fiche muette quand les autres répondent", async () => {
    // La clémence de 027 et 028 : un tournoi supprimé de badnet ne doit pas
    // faire disparaître le relevé des autres.
    const { lancer } = passe({
      evenements: [1, 2, 3],
      echecs: { 2: new Error("coupure réseau") },
    });
    const rapport = await lancer();

    assert.equal(rapport.issue, "succes");
    assert.equal(rapport.volumeExtrait, 2);
    assert.match(rapport.detail ?? "", /2 lieu\(x\) relevé\(s\) sur 3/);
    assert.match(rapport.detail ?? "", /2 : coupure réseau/);
  });

  it("échoue quand aucune fiche n'aboutit", async () => {
    const { lancer } = passe({
      evenements: [1, 2],
      echecs: { 1: new Error("coupure"), 2: new Error("coupure") },
    });
    const rapport = await lancer();

    assert.equal(rapport.issue, "echec");
    assert.equal(rapport.volumeExtrait, 0);
  });

  it("nomme le tournoi muet et sa raison dans le rapport", async () => {
    // C'est sur ce texte qu'on décide si la page a changé ou si un tournoi a
    // disparu, sans avoir à rouvrir une capture.
    const { lancer } = passe({
      evenements: [50750],
      echecs: { 50750: new Error("badnet n'a pas rendu l'action interne") },
    });
    const rapport = await lancer();

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /50750 : badnet n'a pas rendu l'action interne/);
  });

  it("ne lève jamais : toute panne devient un rapport", async () => {
    // La règle de 019, et celle des deux autres passes.
    const { lancer } = passe({ evenements: [1], echecs: { 1: new Error("badnet ne répond pas") } });

    await assert.doesNotReject(lancer);
  });
});
