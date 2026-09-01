import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { ouvrirLaPersistance } from "../src/socle/infrastructure/base/persistance.ts";
import { creerApplication } from "../src/socle/presentation/serveur.ts";
import { creerModuleMonProfil } from "../src/mon-profil/presentation/module-web.ts";
import { moduleCapitanat } from "../src/capitanat/presentation/module-web.ts";
import { moduleVeille } from "../src/veille/presentation/module-web.ts";
import { etatDeLaSource, tacheDAcquisition } from "../src/socle/core/acquisition.ts";
import { SOURCES } from "../src/socle/core/source.ts";
import { licence } from "../src/socle/core/licence.ts";

/**
 * L'assemblage réel, tel que `main.ts` le monte : c'est le seul endroit du
 * dépôt, avec le point de composition, qui a le droit de tout connaître.
 */
describe("l'application assemblée", () => {
  let dossier: string;
  let serveur: Server;
  let base: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;

  before(async () => {
    dossier = mkdtempSync(join(tmpdir(), "babo-interface-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });

    const application = creerApplication({
      configuration: {
        port: 0,
        base: { chemin: join(dossier, "babo.db"), cle: "clé-de-test" },
        licence: licence("07194591"),
        motDePasseMyffbad: null,
        derriereUnProxy: true,
      },
      modules: [
        creerModuleMonProfil({
          licence: licence("07194591"),
          classements: persistance.classements,
        }),
        moduleCapitanat,
        moduleVeille,
      ],
      etatDuSocle: () => ({
        tailleDeLaBase: persistance.taille(),
        captures: persistance.captures.compter(),
      }),
      sources: {
        etats: () =>
          SOURCES.map((source) =>
            etatDeLaSource(
              source,
              persistance.jetonMyffbad.lire(source),
              persistance.rapports.dernierRapport(tacheDAcquisition(source)),
              new Date(),
            ),
          ),
        enregistrer: (source, valeur) =>
          persistance.jetonMyffbad.enregistrer(source, {
            valeur,
            obtenuLe: new Date(),
            expireLe: new Date(Date.now() + 86_400_000),
          }),
        oublier: (source) => persistance.jetonMyffbad.effacer(source),
        deploiements: () => [],
        // La connexion touche au réseau : l'assemblage vérifie le montage.
        connecter: () => Promise.resolve(),
        // La sonde touche au réseau : l'assemblage vérifie qu'elle est montée,
        // pas qu'elle atteint les sites fédéraux.
        sonder: () => Promise.resolve([]),
        // La passe touche au réseau : idem, l'assemblage vérifie le montage.
        relever: () => Promise.reject(new Error("passe non branchée dans ce test")),
      },
    });

    serveur = application.listen(0);
    await new Promise((resoudre) => serveur.once("listening", resoudre));
    const adresse = serveur.address();
    if (adresse === null || typeof adresse === "string") throw new Error("port inattendu");
    base = `http://127.0.0.1:${adresse.port}`;
  });

  after(() => {
    serveur.close();
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("sert l'accueil avec l'état réel de la base", async () => {
    const reponse = await fetch(`${base}/`);
    assert.equal(reponse.status, 200);
    assert.match(await reponse.text(), /Captures archivées/);
  });

  it("dit sur mon profil qu'aucune passe n'a abouti, plutôt qu'un tableau de tirets", async () => {
    // Un tableau de tirets se confondrait avec un joueur non classé (spec 001).
    const reponse = await fetch(`${base}/mon-profil`);

    assert.match(await reponse.text(), /aucun relevé/i);
  });

  it("sert sur mon profil ce que la passe a écrit en base", async () => {
    // La chaîne base → page, celle que le parseur rejoué seul ne prouve pas.
    persistance.classements.relever(
      licence("07194591"),
      [
        { discipline: "simple", lettre: "D9", cpph: 936 },
        { discipline: "double", lettre: "D8", cpph: 1311 },
        { discipline: "mixte", lettre: "D9", cpph: 1007 },
      ],
      new Date("2026-09-01T05:00:00Z"),
    );

    const corps = await (await fetch(`${base}/mon-profil`)).text();

    assert.match(corps, /07194591/);
    assert.match(corps, /D9/);
    assert.match(corps, /1\s?311/, "le CPPH, formaté en français");
    assert.doesNotMatch(corps, /aucun relevé/i);
  });

  for (const [chemin, attendu] of [
    ["/mon-profil", /Mon profil/],
    ["/capitanat", /Capitanat/],
    ["/veille", /Veille de tournois/],
  ] as const) {
    it(`sert ${chemin}, monté par le point de composition`, async () => {
      const reponse = await fetch(`${base}${chemin}`);
      assert.equal(reponse.status, 200);
      assert.match(await reponse.text(), attendu);
    });
  }
});
