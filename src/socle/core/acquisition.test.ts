import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CaptureArchivee, DepotCaptures } from "./capture.ts";
import type { ClientHttp, ModuleDAcquisition, Reponse, Requete } from "./acquisition.ts";
import {
  ActionIntrouvable,
  DUREE_DE_SESSION_PAR_DEFAUT,
  actionsPeutEtrePerimees,
  enObservantLeBuild,
  PlafondAtteint,
  SessionMorte,
  enArchivant,
  echeanceDeLaSession,
  etatDeLaSource,
  recupererSousSession,
  sousPlafond,
} from "./acquisition.ts";

const LE_JOUR = new Date("2026-09-01T08:00:00Z");
const horlogeFigee = { maintenant: () => LE_JOUR };

function clientQuiRepond(reponse: Partial<Reponse> = {}): ClientHttp & { vues: Requete[] } {
  const vues: Requete[] = [];
  return {
    vues,
    recuperer(requete: Requete): Promise<Reponse> {
      vues.push(requete);
      return Promise.resolve({
        url: requete.url,
        statutHttp: 200,
        contenu: "<html>une page</html>",
        cookies: [],
        ...reponse,
      });
    },
  };
}

function depotEnMemoire(): DepotCaptures & { archivees: CaptureArchivee[] } {
  const archivees: CaptureArchivee[] = [];
  return {
    archivees,
    archiver(capture) {
      const archivee = { ...capture, id: archivees.length + 1 };
      archivees.push(archivee);
      return archivee;
    },
    dernieres: () => archivees,
    parIdentifiant: () => null,
    compter: () => archivees.length,
  };
}

describe("l'archivage avant analyse", () => {
  it("écrit une capture pour chaque réponse", async () => {
    const captures = depotEnMemoire();
    const client = enArchivant(clientQuiRepond(), {
      source: "badnet",
      captures,
      horloge: horlogeFigee,
    });

    await client.recuperer({ url: "https://badnet.fr/", jeton: null });

    assert.equal(captures.archivees.length, 1);
    assert.partialDeepStrictEqual(captures.archivees[0], {
      source: "badnet",
      url: "https://badnet.fr/",
      statutHttp: 200,
      captureeLe: LE_JOUR,
    });
  });

  it("archive aussi la réponse en erreur, qui est celle qu'on voudra relire", async () => {
    const captures = depotEnMemoire();
    const client = enArchivant(clientQuiRepond({ statutHttp: 503, contenu: "maintenance" }), {
      source: "myffbad",
      captures,
      horloge: horlogeFigee,
    });

    await client.recuperer({ url: "https://www.myffbad.fr/", jeton: "session=x" });

    assert.equal(captures.archivees[0]?.statutHttp, 503);
  });
});

describe("le plafond de requêtes", () => {
  it("laisse passer les requêtes de la passe puis s'arrête", async () => {
    const reseau = clientQuiRepond();
    const client = sousPlafond(reseau, 2);

    await client.recuperer({ url: "https://badnet.fr/1", jeton: null });
    await client.recuperer({ url: "https://badnet.fr/2", jeton: null });

    assert.throws(
      () => client.recuperer({ url: "https://badnet.fr/3", jeton: null }),
      PlafondAtteint,
    );
    assert.equal(reseau.vues.length, 2, "la requête de trop ne doit pas atteindre le réseau");
  });
});

const moduleTemoin: ModuleDAcquisition = {
  source: "myffbad",
  pagesDeLaSonde: () => [],
  murDeConnexion: (reponse) => reponse.url.includes("/connexion"),
};

describe("la récupération sous session", () => {
  it("refuse le mur de connexion plutôt que de rendre une page vide", async () => {
    const client = clientQuiRepond({ url: "https://www.myffbad.fr/connexion" });

    await assert.rejects(
      recupererSousSession(client, moduleTemoin, {
        intitule: "accueil",
        requete: { url: "https://www.myffbad.fr/", jeton: "session=morte" },
      }),
      SessionMorte,
    );
  });

  it("joue la requête telle que le module l'a composée", async () => {
    const client = clientQuiRepond();

    await recupererSousSession(client, { ...moduleTemoin, source: "badnet" }, {
      intitule: "accueil public",
      requete: { url: "https://badnet.fr/", jeton: null },
    });

    assert.equal(client.vues[0]?.jeton, null, "une page publique n'engage pas le compte");
  });

  it("nomme l'identifiant d'action périmé, qui ne se répare pas comme une session", async () => {
    const client = clientQuiRepond({ statutHttp: 404, contenu: "Server action not found." });

    await assert.rejects(
      recupererSousSession(client, moduleTemoin, {
        intitule: "classement",
        requete: { url: "https://www.myffbad.fr/joueur/1", jeton: "session=valide" },
      }),
      ActionIntrouvable,
    );
  });
});

describe("l'état d'une source", () => {
  const jeton = {
    valeur: "session=x",
    obtenuLe: new Date("2026-08-01T08:00:00Z"),
    expireLe: new Date("2026-08-31T08:00:00Z"),
  };

  it("distingue la session absente, expirée et valide", () => {
    assert.equal(etatDeLaSource("myffbad", null, null, LE_JOUR).session, "absente");
    assert.equal(etatDeLaSource("myffbad", jeton, null, LE_JOUR).session, "expiree");
    assert.equal(
      etatDeLaSource("myffbad", jeton, null, new Date("2026-08-15T08:00:00Z")).session,
      "valide",
    );
  });

  it("dit depuis quand la session est là, et combien de jours il lui reste", () => {
    const etat = etatDeLaSource("myffbad", jeton, null, new Date("2026-08-25T20:00:00Z"));

    assert.deepEqual(etat.enregistreeLe, new Date("2026-08-01T08:00:00Z"));
    assert.equal(etat.joursRestants, 6, "un jour entamé compte : il reste 5 j 12 h");
  });

  it("ne compte plus les jours d'une session absente ou morte", () => {
    assert.equal(etatDeLaSource("myffbad", null, null, LE_JOUR).joursRestants, null);
    assert.equal(etatDeLaSource("myffbad", jeton, null, LE_JOUR).joursRestants, null);
    assert.equal(etatDeLaSource("myffbad", null, null, LE_JOUR).enregistreeLe, null);
  });

  it("rend l'ancienneté même quand la donnée est périmée", () => {
    const etat = etatDeLaSource(
      "badnet",
      jeton,
      { termineLe: new Date("2026-08-30T06:00:00Z"), issue: "vide" },
      LE_JOUR,
    );

    assert.deepEqual(etat.derniereAcquisition, new Date("2026-08-30T06:00:00Z"));
    assert.equal(etat.derniereIssue, "vide");
  });
});

describe("l'échéance d'une session", () => {
  it("suit le jeton quand il porte sa propre date", () => {
    const module: ModuleDAcquisition = {
      ...moduleTemoin,
      expirationDuJeton: () => new Date("2026-10-01T15:43:35Z"),
    };

    assert.deepEqual(
      echeanceDeLaSession(module, "jwt=peu-importe", LE_JOUR),
      new Date("2026-10-01T15:43:35Z"),
    );
  });

  it("ne devine un mois que si le jeton ne dit rien de lui-même", () => {
    assert.deepEqual(
      echeanceDeLaSession(moduleTemoin, "session=opaque", LE_JOUR),
      new Date(LE_JOUR.getTime() + DUREE_DE_SESSION_PAR_DEFAUT),
    );
  });

  it("retombe sur le défaut plutôt que de refuser un jeton illisible", () => {
    const module: ModuleDAcquisition = { ...moduleTemoin, expirationDuJeton: () => null };

    assert.deepEqual(
      echeanceDeLaSession(module, "jwt=n-importe-quoi", LE_JOUR),
      new Date(LE_JOUR.getTime() + DUREE_DE_SESSION_PAR_DEFAUT),
    );
  });
});

describe("l'observation des déploiements", () => {
  const moduleQuiAnnonce: ModuleDAcquisition = {
    ...moduleTemoin,
    buildDeLaReponse: (reponse) => (reponse.contenu.startsWith("build:") ? reponse.contenu.slice(6) : null),
    buildDesActions: "BUILD-DU-RELEVE",
  };

  function depotBuilds() {
    const vus: [string, string][] = [];
    return {
      vus,
      observer: (source: string, build: string) => {
        vus.push([source, build]);
        return true;
      },
      courant: () => null,
      historique: () => [],
    };
  }

  it("consigne le build que la réponse annonce", async () => {
    const builds = depotBuilds();
    const client = enObservantLeBuild(clientQuiRepond({ contenu: "build:ABC123" }), {
      module: moduleQuiAnnonce,
      builds,
      horloge: horlogeFigee,
    });

    await client.recuperer({ url: "https://www.myffbad.fr/", jeton: null });

    assert.deepEqual(builds.vus, [["myffbad", "ABC123"]]);
  });

  it("laisse passer sans frais la source qui n'annonce rien", async () => {
    const builds = depotBuilds();
    const reseau = clientQuiRepond();
    const client = enObservantLeBuild(reseau, {
      module: moduleTemoin,
      builds,
      horloge: horlogeFigee,
    });

    await client.recuperer({ url: "https://badnet.fr/", jeton: null });

    assert.deepEqual(builds.vus, []);
    assert.equal(client, reseau, "aucun décorateur inutile ne s'interpose");
  });

  it("signale un risque de péremption, sans le confondre avec une panne", () => {
    assert.equal(actionsPeutEtrePerimees(moduleQuiAnnonce, "UN-AUTRE-BUILD"), true);
    assert.equal(actionsPeutEtrePerimees(moduleQuiAnnonce, "BUILD-DU-RELEVE"), false);
    assert.equal(actionsPeutEtrePerimees(moduleQuiAnnonce, null), false, "rien vu, rien à dire");
    assert.equal(actionsPeutEtrePerimees(moduleTemoin, "N-IMPORTE"), false, "pas d'actions ici");
  });
});
