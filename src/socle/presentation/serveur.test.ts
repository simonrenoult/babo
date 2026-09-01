import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Router } from "express";
import { creerApplication, type ModuleWeb } from "./serveur.ts";
import type { Configuration } from "../core/configuration.ts";
import { licence } from "../core/licence.ts";
import type { AccesAuxSources } from "./routeur-sources.ts";

const CONFIGURATION: Configuration = {
  port: 0,
  base: { chemin: ":memory:", cle: "peu-importe" },
  licence: licence("07194591"),
  motDePasseMyffbad: null,
  derriereUnProxy: true,
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

// Aucune source branchée : l'écran de 015 se teste avec ses propres doublures,
// ici on vérifie seulement que le socle le monte.
const aucuneSource: AccesAuxSources = {
  etats: () => [],
  deploiements: () => [],
  enregistrer: () => {},
  oublier: () => {},
  connecter: () => Promise.resolve(),
  sonder: () => Promise.resolve([]),
  relever: () => Promise.reject(new Error("passe non branchée dans ce test")),
};

function applicationDEssai() {
  return creerApplication({
    configuration: CONFIGURATION,
    modules: [moduleQuelconque],
    etatDuSocle: () => ({ tailleDeLaBase: 40960, captures: 3 }),
    sources: aucuneSource,
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
    assert.match(reponse.corps, /Captures archivées/);
  });

  it("propose dans sa navigation les modules qu'on lui a montés", async () => {
    const reponse = await interroger("/");
    assert.match(reponse.corps, /href="\/temoin">\s*Module témoin/);
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
