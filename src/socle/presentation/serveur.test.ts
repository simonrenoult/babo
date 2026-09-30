import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Router } from "express";
import { creerApplication, pannesDesSources, type ModuleWeb } from "./serveur.ts";
import type { Configuration } from "../core/configuration.ts";
import { licence } from "../core/licence.ts";
import type { AccesAuxSources } from "./routeur-sources.ts";
import type { Authentification } from "../core/authentification.ts";

const CONFIGURATION: Configuration = {
  port: 0,
  base: { chemin: ":memory:", cle: "peu-importe" },
  licence: licence("07194591"),
  motDePasseMyffbad: null,
  motDePasseBadnet: null,
  motDePasse: "le-mot-de-passe-de-test",
  secretDuJeton: "secret-de-test",
  derriereUnProxy: true,
  courrier: null,
};

// Le socle ne connaît aucune feature : il sait monter ce qu'on lui donne, et
// ce test lui donne un module qui n'existe pas (spec 022).
const moduleQuelconque: ModuleWeb = {
  intitule: "Module témoin",
  chemin: "/temoin",
  routeur: Router().get("/", (_requete, reponse) => {
    reponse.send("page du module témoin");
  }),
  vues: new URL("vues/", import.meta.url).pathname,
};

/**
 * La porte, grande ouverte — spec 021.
 *
 * Ces tests portent sur autre chose, et 021 se vérifie avec le vrai garde
 * ailleurs. Une doublure ici évite d'ajouter un cookie à chaque requête pour
 * tester un formulaire de session.
 */
const porteOuverte: Authentification = {
  poserLeCompte: () => false,
  connecter: () => ({ issue: "refusee" }),
  reconnaitre: () => ({ verdict: "valide", renouvele: null }),
};

// Aucune source branchée : l'écran de 015 se teste avec ses propres doublures,
// ici on vérifie seulement que le socle le monte.
const aucuneSource: AccesAuxSources = {
  etats: () => [],
  deploiements: () => [],
  enregistrer: () => {},
  oublier: () => {},
  connecter: () => Promise.resolve("ouverte" as const),
  confirmerLeCode: () => Promise.resolve(),
  codesAttendus: () => [],
  engagements: () => 0,
  executerMaintenant: () =>
    Promise.reject(new Error("déclenchement non branché dans ce test")),
  sonder: () => Promise.resolve([]),
  importerLEquipe: () => Promise.resolve({ issue: "refusee", motifs: [] }),
  calendrier: () => null,
  importerLesDisponibilites: () => Promise.resolve({ issue: "refusees", motifs: [] }),
  importerLeCalendrier: () => Promise.reject(new Error("pas de calendrier dans ce test")),
  courrier: () => ({
    configure: false,
    destinataire: null,
    enAttente: 0,
    derniers: [],
  }),
  envoyerUnMailDeTest: () => Promise.reject(new Error("pas de courrier dans ce test")),
  rapports: () => [],
  ordonnancement: () => [],
  reglerLaTache: () => {},
};

function applicationDEssai() {
  return creerApplication({
    configuration: CONFIGURATION,
    modules: [moduleQuelconque],
    etatDuSocle: () => ({ tailleDeLaBase: 40960, captures: 3 }),
    sources: aucuneSource,
    authentification: porteOuverte,
  });
}

async function interroger(chemin: string) {
  const application = applicationDEssai();
  const serveur = application.listen(0);
  try {
    await new Promise((resoudre) => serveur.once("listening", resoudre));
    const adresse = serveur.address();
    if (adresse === null || typeof adresse === "string") throw new Error("port inattendu");
    const reponse = await fetch(`http://127.0.0.1:${adresse.port}${chemin}`);
    return { statut: reponse.status, entetes: reponse.headers, corps: await reponse.text() };
  } finally {
    serveur.close();
  }
}

describe("l'interface du socle", () => {
  it("sert une page d'accueil qui affiche l'état de la base", async () => {
    const reponse = await interroger("/");
    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /40 Ko/);
    assert.match(reponse.corps, /captures archivées/);
  });

  it("ne signale les sources que quand l'une demande un geste", () => {
    const etat = {
      source: "myffbad",
      session: "absente",
      autonome: false,
      enregistreeLe: null,
      expireLe: null,
      joursRestants: null,
      derniereAcquisition: null,
      derniereIssue: "succes",
    } as const;

    // Jamais configurée n'est pas en panne ; expirée mais autonome se rouvre seule.
    assert.deepEqual(pannesDesSources([etat, { ...etat, session: "expiree", autonome: true }]), []);
    assert.deepEqual(pannesDesSources([{ ...etat, derniereIssue: "vide" }]), [
      "myffbad : la dernière passe n'a rien rendu",
    ]);
    assert.deepEqual(pannesDesSources([{ ...etat, derniereIssue: "echec", session: "expiree" }]), [
      "myffbad : la dernière passe a échoué",
      "myffbad : session expirée",
    ]);
  });

  it("propose dans sa navigation les modules qu'on lui a montés", async () => {
    const reponse = await interroger("/");
    assert.match(reponse.corps, /href="\/temoin"[^>]*>\s*Module témoin/);
  });

  it("monte le routeur d'un module sur son chemin", async () => {
    const reponse = await interroger("/temoin");
    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /page du module témoin/);
  });

  it("expose une sonde de vie pour le superviseur", async () => {
    const reponse = await interroger("/sante");
    assert.equal(reponse.statut, 200);
    assert.deepEqual(JSON.parse(reponse.corps), {
      statut: "ok",
      tailleDeLaBase: 40960,
      captures: 3,
    });
  });

  it("demande à ne pas être indexé, sur toute réponse", async () => {
    const reponse = await interroger("/");
    assert.equal(reponse.entetes.get("x-robots-tag"), "noindex, nofollow");
  });

  it("répond une page, pas une trace, sur une adresse inconnue", async () => {
    const reponse = await interroger("/ce-qui-n-existe-pas");
    assert.equal(reponse.statut, 404);
    assert.match(reponse.corps, /Page inconnue/);
  });
});
