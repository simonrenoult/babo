import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creerApplication } from "./serveur.ts";
import type { AccesAuxSources } from "./routeur-sources.ts";
import type { Configuration } from "../core/configuration.ts";
import { licence } from "../core/licence.ts";
import type { EtatDeLaSource } from "../core/acquisition.ts";
import type { Source } from "../core/source.ts";

const CONFIGURATION: Configuration = {
  port: 0,
  base: { chemin: ":memory:", cle: "peu-importe" },
  licence: licence("07194591"),
  motDePasseMyffbad: null,
  derriereUnProxy: true,
};

const ETATS: readonly EtatDeLaSource[] = [
  {
    source: "myffbad",
    autonome: true,
    session: "expiree",
    enregistreeLe: new Date("2026-07-16T08:00:00Z"),
    expireLe: new Date("2026-08-15T08:00:00Z"),
    joursRestants: null,
    derniereAcquisition: new Date("2026-08-14T06:00:00Z"),
    derniereIssue: "echec",
  },
  {
    source: "badnet",
    autonome: false,
    session: "absente",
    enregistreeLe: null,
    expireLe: null,
    joursRestants: null,
    derniereAcquisition: null,
    derniereIssue: null,
  },
];

type Trace = {
  enregistres: [Source, string][];
  oublies: Source[];
  sondes: number;
  connectes: Source[];
  releves: number;
  importes: string[];
};

function ecran(): { acces: AccesAuxSources; trace: Trace } {
  const trace: Trace = {
    enregistres: [],
    oublies: [],
    sondes: 0,
    connectes: [],
    releves: 0,
    importes: [],
  };
  return {
    trace,
    acces: {
      etats: () => ETATS,
      deploiements: () => [
        {
          source: "myffbad",
          build: "NOUVEAUBUILD",
          depuis: new Date("2026-08-28T09:00:00Z"),
          builds: 3,
          actionsPeutEtrePerimees: true,
        },
        {
          source: "badnet",
          build: null,
          depuis: null,
          builds: 0,
          actionsPeutEtrePerimees: false,
        },
      ],
      enregistrer: (source, valeur) => void trace.enregistres.push([source, valeur]),
      importerLEquipe: (csv) => {
        trace.importes.push(csv);
        // Le socle ne sait pas lire un CSV d'équipe et n'a pas à l'apprendre
        // (022) : la doublure rend ce que `main.ts` rendrait.
        return csv.includes("licence")
          ? { issue: "importee", membres: 8 }
          : { issue: "refusee", motifs: [{ ligne: 1, raison: "colonne « licence » absente." }] };
      },
      oublier: (source) => void trace.oublies.push(source),
      connecter: (source) => {
        trace.connectes.push(source);
        return Promise.resolve();
      },
      relever: () => {
        trace.releves += 1;
        return Promise.resolve({
          id: 12,
          tache: "acquisition:myffbad",
          demarreLe: new Date("2026-09-01T05:00:00Z"),
          termineLe: new Date("2026-09-01T05:00:02Z"),
          issue: "succes",
          volumeExtrait: 3,
          detail: "classement : simple D9, double D8, mixte D9",
        });
      },
      sonder: () => {
        trace.sondes += 1;
        return Promise.resolve([
          {
            source: "badnet",
            page: {
              intitule: "accueil public",
              requete: { url: "https://badnet.fr/", jeton: null },
            },
            verdict: "atteinte",
            statutHttp: 200,
            octets: 8205,
            extraits: 17,
            detail: null,
          },
        ]);
      },
    },
  };
}

async function interroger(
  acces: AccesAuxSources,
  chemin: string,
  corps?: URLSearchParams | string,
): Promise<{ statut: number; corps: string; redirection: string | null }> {
  const application = creerApplication({
    configuration: CONFIGURATION,
    modules: [],
    etatDuSocle: () => ({ tailleDeLaBase: 0, captures: 0 }),
    sources: acces,
  });
  const serveur = application.listen(0);
  try {
    await new Promise((resoudre) => serveur.once("listening", resoudre));
    const adresse = serveur.address();
    if (adresse === null || typeof adresse === "string") throw new Error("port inattendu");

    const reponse = await fetch(`http://127.0.0.1:${adresse.port}${chemin}`, {
      redirect: "manual",
      ...(corps === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "content-type":
                typeof corps === "string"
                  ? "text/csv; charset=utf-8"
                  : "application/x-www-form-urlencoded",
            },
            body: corps,
          }),
    });
    return {
      statut: reponse.status,
      corps: await reponse.text(),
      redirection: reponse.headers.get("location"),
    };
  } finally {
    serveur.close();
  }
}

describe("l'écran des sources", () => {
  it("affiche l'état de chaque source, ancienneté comprise", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /myffbad/);
    assert.match(reponse.corps, /badnet/);
    assert.match(reponse.corps, /expirée/);
    assert.match(reponse.corps, /jamais/, "une source jamais acquise doit le dire");
  });

  it("dit à côté du champ si une session existe déjà, et jusqu'à quand", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.match(reponse.corps, /Aucune session enregistrée/, "badnet n'en a pas");
    assert.match(reponse.corps, /Session enregistrée le 16\/07\/2026/, "myffbad en a une");
    assert.match(reponse.corps, /expirée<\/strong> depuis le 15\/08\/2026/);
  });

  it("ne réaffiche jamais le jeton qu'on lui a confié", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    // Le champ reste vide par construction : un jeton rendu dans le HTML
    // repartirait dans le cache et l'historique du navigateur.
    assert.doesNotMatch(reponse.corps, /name="valeur"[^>]*value=/);
  });

  it("ne demande jamais le mot de passe fédéral, seulement le cookie déjà obtenu", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.doesNotMatch(reponse.corps, /type="password"/);
    assert.match(reponse.corps, /Cookie de session/);
  });

  it("enregistre une session et revient à l'écran", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/sources/myffbad/jeton",
      new URLSearchParams({ valeur: "  session=abc  " }),
    );

    assert.equal(reponse.statut, 302);
    assert.equal(reponse.redirection, "/sources");
    assert.deepEqual(trace.enregistres, [["myffbad", "session=abc"]]);
  });

  it("refuse un jeton vide plutôt que d'écrire une session morte", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/sources/myffbad/jeton",
      new URLSearchParams({ valeur: "   " }),
    );

    assert.equal(reponse.statut, 400);
    assert.deepEqual(trace.enregistres, []);
  });

  it("oublie un jeton sur demande", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/badnet/oubli", new URLSearchParams());

    assert.equal(reponse.statut, 302);
    assert.deepEqual(trace.oublies, ["badnet"]);
  });

  it("ne connaît que les deux sources de la spec 015", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/sources/poona/jeton",
      new URLSearchParams({ valeur: "session=abc" }),
    );

    assert.equal(reponse.statut, 404);
    assert.deepEqual(trace.enregistres, []);
  });

  it("rend le résultat de la sonde dans la page", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/sonde", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.equal(trace.sondes, 1);
    assert.match(reponse.corps, /accueil public/);
    assert.match(reponse.corps, /atteinte/);
  });

  it("lance la passe de classement et rend son rapport", async () => {
    // Le bouton est ici, sur l'écran d'exploitation, et non sur « Mon profil » :
    // 001 écarte le « rafraîchir maintenant » entre les mains de l'utilisateur.
    // 018 déclenchera la même passe, et ce bouton n'aura plus qu'à dépanner.
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/classement", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.equal(trace.releves, 1);
    assert.match(reponse.corps, /simple D9, double D8, mixte D9/);
  });
});

describe("l'import de l'équipe", () => {
  it("passe le contenu du CSV et rend le décompte", async () => {
    // Le fichier n'atterrit jamais sur le serveur : c'est son contenu qui est
    // posté en `text/csv`, sans multipart et sans `multer` (spec 005).
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/equipe", "licence;sexe;telephone\n");

    assert.equal(reponse.statut, 200);
    assert.deepEqual(trace.importes, ["licence;sexe;telephone\n"]);
    assert.match(reponse.corps, /8<\/strong>\s*membres importés/);
  });

  it("rend chaque anomalie avec sa ligne, et refuse en 400", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources/equipe", "n'importe quoi\n");

    assert.equal(reponse.statut, 400);
    assert.match(reponse.corps, /rien n'a été écrit/);
    assert.match(reponse.corps, /colonne « licence » absente/);
  });

  it("dit à l'écran que l'import remplace la liste entière", async () => {
    // La suppression du partant, relevés compris, est la contrepartie assumée
    // de 005 : elle doit être écrite là où on clique, pas seulement en spec.
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.match(reponse.corps, /remplace la liste entière/);
  });
});

describe("la connexion autonome", () => {
  it("propose le bouton à la source qui sait se connecter, et à elle seule", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.match(reponse.corps, /action="\/sources\/myffbad\/connexion"/);
    assert.doesNotMatch(reponse.corps, /action="\/sources\/badnet\/connexion"/);
  });

  it("déclenche la connexion et revient à l'écran", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/myffbad/connexion", new URLSearchParams());

    assert.equal(reponse.statut, 302);
    assert.equal(reponse.redirection, "/sources");
    assert.deepEqual(trace.connectes, ["myffbad"]);
  });

  it("laisse remonter l'échec au lieu de prétendre que tout va bien", async () => {
    const { acces } = ecran();
    const cassee = { ...acces, connecter: () => Promise.reject(new Error("identifiants refusés")) };
    const reponse = await interroger(cassee, "/sources/myffbad/connexion", new URLSearchParams());

    assert.equal(reponse.statut, 500);
  });
});
