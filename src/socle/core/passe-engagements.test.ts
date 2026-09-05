import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DepotEngagements, Engagement } from "./engagement.ts";
import { memeJour, tableauEngage } from "./engagement.ts";
import type { AccesAuxEngagements, TournoiEngage } from "./passe-engagements.ts";
import { releverLesEngagements } from "./passe-engagements.ts";
import type { DepotRapports, RapportArchive, RapportExecution } from "./rapport-execution.ts";

const MAINTENANT = new Date(2026, 8, 5, 5, 0);
const horloge = { maintenant: () => MAINTENANT };

const UN: TournoiEngage = { evenement: 1, nom: "Villeneuve", date: new Date(2026, 9, 24, 12) };
const AUTRE: TournoiEngage = { evenement: 2, nom: "Printemps", date: new Date(2026, 10, 7, 12) };

const fiche = (tournoi: TournoiEngage): Engagement => ({
  ...tournoi,
  statut: "Inscription payée",
  tableaux: [{ tableau: "DH", serie: "S4", partenaire: { licence: null, nom: "MARTIN Claire" } }],
});

function depotEngagements(): DepotEngagements & { readonly ecrits: Engagement[][] } {
  const ecrits: Engagement[][] = [];
  return {
    ecrits,
    remplacer: (engagements) => void ecrits.push([...engagements]),
    tous: () => ecrits.at(-1) ?? [],
    compter: () => (ecrits.at(-1) ?? []).length,
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

function acces(options: {
  readonly tournois?: readonly TournoiEngage[];
  readonly ficheDe?: (tournoi: TournoiEngage) => Promise<Engagement | null>;
  readonly listeLeve?: string;
}): AccesAuxEngagements {
  return {
    listerLesTournois: () =>
      options.listeLeve === undefined
        ? Promise.resolve(options.tournois ?? [])
        : Promise.reject(new Error(options.listeLeve)),
    ficheDe: options.ficheDe ?? ((tournoi) => Promise.resolve(fiche(tournoi))),
  };
}

function passe(options: {
  readonly jeton?: string | null;
  readonly acces: AccesAuxEngagements;
}) {
  const engagements = depotEngagements();
  const rapports = depotRapports();
  return releverLesEngagements({
    jeton: options.jeton === undefined ? "PHPSESSID=x" : options.jeton,
    engagements,
    rapports,
    horloge,
    acces: options.acces,
  }).then((rapport) => ({ rapport, engagements, rapports }));
}

describe("la passe des engagements", () => {
  it("écrit ce qu'elle relève et consigne son rapport", async () => {
    const { rapport, engagements } = await passe({ acces: acces({ tournois: [UN, AUTRE] }) });

    assert.equal(rapport.issue, "succes");
    assert.equal(rapport.tache, "acquisition:badnet:engagements");
    assert.equal(rapport.volumeExtrait, 2);
    assert.deepEqual(
      engagements.ecrits[0]?.map(({ evenement }) => evenement),
      [1, 2],
    );
  });

  it("s'arrête net sans session, plutôt que d'échouer requête par requête", async () => {
    const { rapport, engagements } = await passe({ jeton: null, acces: acces({}) });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /aucune session badnet/);
    assert.deepEqual(engagements.ecrits, [], "et rien n'est effacé en base");
  });

  /**
   * On ne s'engage pas toute l'année. Un `vide` au sens de 019 dirait qu'une
   * source s'est tue, ce qui serait faux — et ferait partir une alerte chaque
   * intersaison.
   */
  it("tient l'absence d'engagement pour un succès, pas pour une extraction vide", async () => {
    const { rapport, engagements } = await passe({ acces: acces({ tournois: [] }) });

    assert.equal(rapport.issue, "succes");
    assert.equal(rapport.volumeExtrait, 0);
    // Et la base est vidée : la saison précédente ne doit pas traîner.
    assert.deepEqual(engagements.ecrits, [[]]);
  });

  it("continue quand une seule fiche est illisible, et la nomme", async () => {
    const { rapport, engagements } = await passe({
      acces: acces({
        tournois: [UN, AUTRE],
        ficheDe: (tournoi) =>
          tournoi.evenement === 1
            ? Promise.reject(new Error("autoload introuvable"))
            : Promise.resolve(fiche(tournoi)),
      }),
    });

    assert.equal(rapport.issue, "succes");
    assert.match(rapport.detail ?? "", /1 engagement\(s\) sur 2/);
    assert.match(rapport.detail ?? "", /Villeneuve : autoload introuvable/);
    assert.deepEqual(
      engagements.ecrits[0]?.map(({ evenement }) => evenement),
      [2],
    );
  });

  it("échoue quand aucune fiche n'aboutit, sans rien effacer", async () => {
    const { rapport, engagements } = await passe({
      acces: acces({ tournois: [UN], ficheDe: () => Promise.reject(new Error("mur")) }),
    });

    assert.equal(rapport.issue, "echec");
    // Ne rien écrire est le point : une passe entièrement muette ne doit pas
    // vider l'agenda de la veille.
    assert.deepEqual(engagements.ecrits, []);
  });

  it("consigne l'échec de la liste au lieu de lever", async () => {
    const { rapport } = await passe({ acces: acces({ listeLeve: "session morte" }) });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /session morte/);
  });
});

describe("les notions d'engagement", () => {
  it("lit le tableau et sa série sur le libellé de badnet", () => {
    assert.deepEqual(tableauEngage("DH S4"), { tableau: "DH", serie: "S4" });
    assert.deepEqual(tableauEngage("MX S3 "), { tableau: "MX", serie: "S3" });
    assert.deepEqual(tableauEngage("SH"), { tableau: "SH", serie: null });
  });

  it("refuse ce qui n'est pas un engagement", () => {
    // « Non » dit qu'on ne joue pas ; « Clt. trop élevé » qu'on ne peut pas.
    assert.equal(tableauEngage("Non"), null);
    assert.equal(tableauEngage("DH S5 - Clt. trop élevé"), null);
  });

  it("signale deux tournois le même jour", () => {
    const matin = fiche({ ...UN, date: new Date(2026, 9, 24, 8) });
    const soir = fiche({ ...AUTRE, date: new Date(2026, 9, 24, 20) });

    assert.equal(memeJour(matin, soir), true);
    assert.equal(memeJour(fiche(UN), fiche(AUTRE)), false);
  });
});
