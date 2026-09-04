import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientHttp, ModuleDAcquisition, Reponse, Requete } from "./acquisition.ts";
import type { Classement, DepotClassements, ReleveDeClassement } from "./classement.ts";
import { ClassementIllisible } from "./classement.ts";
import type { DepotIdentites, Identite } from "./identite.ts";
import type { Horloge } from "./horloge.ts";
import { licence } from "./licence.ts";
import type { Licence } from "./licence.ts";
import type { DepotRapports, RapportArchive, RapportExecution } from "./rapport-execution.ts";
import { plafondDeLaPasse, releverLesClassements } from "./passe-classement.ts";

const MOI = licence("07194591");
const AUTRE = licence("02345678");
const MAINTENANT = new Date("2026-09-01T05:00:00Z");

const horloge: Horloge = { maintenant: () => MAINTENANT };

const CLASSEMENT: readonly Classement[] = [
  { discipline: "simple", lettre: "D9", cpph: 936 },
  { discipline: "double", lettre: "D8", cpph: 1311 },
  { discipline: "mixte", lettre: "D9", cpph: 1007 },
];

function reponse(url = "https://www.myffbad.fr/joueur/07194591"): Reponse {
  return { url, statutHttp: 200, contenu: "peu importe : le module la lit", cookies: [] };
}

function depotClassements(): DepotClassements & { ecrits: [Licence, readonly Classement[]][] } {
  const ecrits: [Licence, readonly Classement[]][] = [];
  return {
    ecrits,
    relever: (licenceEcrite, classements) => void ecrits.push([licenceEcrite, classements]),
    derniers: (): readonly ReleveDeClassement[] => [],
  };
}

function depotIdentites(connues: readonly Identite[] = []): DepotIdentites & {
  ecrites: Identite[];
} {
  const cache = new Map(connues.map((identite) => [String(identite.licence), identite]));
  const ecrites: Identite[] = [];
  return {
    ecrites,
    enregistrer: (identite) => {
      ecrites.push(identite);
      cache.set(String(identite.licence), identite);
    },
    lire: (licenceLue) => cache.get(String(licenceLue)) ?? null,
  };
}

function depotRapports(): DepotRapports & { consignes: RapportExecution[] } {
  const consignes: RapportExecution[] = [];
  return {
    consignes,
    consigner: (rapport) => {
      consignes.push(rapport);
      return { ...rapport, id: consignes.length } satisfies RapportArchive;
    },
    dernierRapport: () => null,
    derniers: () => [],
    depuis: () => [],
  };
}

/**
 * Un module myffbad réduit à ce que la passe lui demande — la fiche puis
 * l'action, toutes deux anonymes.
 */
function moduleMyffbad(
  options: {
    readonly lireLeClassement?: (reponse: Reponse) => readonly Classement[];
    readonly lireLIdentite?: (reponse: Reponse, licence: Licence) => Identite;
  } = {},
): ModuleDAcquisition {
  return {
    source: "myffbad",
    pagesDeLaSonde: () => [],
    murDeConnexion: (reponse) => new URL(reponse.url).pathname.startsWith("/connexion"),
    identite: {
      requete: (licenceVisee) => ({ url: `https://www.myffbad.fr/joueur/${licenceVisee}`, jeton: null }),
      lire:
        options.lireLIdentite ??
        ((_reponse, licenceVisee) => ({ licence: licenceVisee, nom: "Simon RENOULT", personId: 1083591 })),
    },
    classement: {
      requete: (licenceVisee) => ({
        url: `https://www.myffbad.fr/joueur/${licenceVisee}`,
        jeton: null,
        methode: "POST",
      }),
      lire: options.lireLeClassement ?? (() => CLASSEMENT),
    },
  };
}

/** Un client qui note ce qu'on lui demande : c'est la trace que les tests lisent. */
function clientTracant(
  reponsePour: (requete: Requete, appels: number) => Reponse | Error = () => reponse(),
): ClientHttp & { requetes: Requete[] } {
  const requetes: Requete[] = [];
  return {
    requetes,
    recuperer: (requete) => {
      requetes.push(requete);
      const rendue = reponsePour(requete, requetes.length);
      return rendue instanceof Error ? Promise.reject(rendue) : Promise.resolve(rendue);
    },
  };
}

async function passe(options: {
  readonly module?: ModuleDAcquisition;
  readonly client?: ClientHttp;
  readonly licences?: readonly Licence[];
  readonly identites?: ReturnType<typeof depotIdentites>;
}) {
  const classements = depotClassements();
  const identites = options.identites ?? depotIdentites();
  const rapports = depotRapports();
  const rapport = await releverLesClassements({
    client: options.client ?? clientTracant(),
    module: options.module ?? moduleMyffbad(),
    licences: options.licences ?? [MOI],
    identites,
    classements,
    rapports,
    horloge,
  });
  return { rapport, classements, identites, rapports };
}

describe("la passe qui relève noms et classements", () => {
  it("lit la fiche puis l'action, et écrit les deux", async () => {
    const client = clientTracant();
    const { rapport, classements, identites } = await passe({ client });

    assert.equal(rapport.issue, "succes");
    assert.equal(rapport.volumeExtrait, 3, "trois disciplines");
    assert.equal(rapport.tache, "acquisition:myffbad", "la tâche de la source, comme la sonde");
    assert.deepEqual(identites.ecrites, [{ licence: MOI, nom: "Simon RENOULT", personId: 1083591 }]);
    assert.deepEqual(classements.ecrits, [[MOI, CLASSEMENT]]);
    assert.equal(client.requetes.length, 2, "la fiche, puis l'action");
  });

  it("ne présente aucun cookie, ni sur la fiche ni sur l'action", async () => {
    // Le cœur de 028 : 015 croyait la session indispensable, elle ne l'est pas.
    // Un jeton qui repasserait ici remettrait la passe hebdomadaire sous le
    // risque de bannissement qu'elle vient justement de quitter.
    const client = clientTracant();
    await passe({ client, licences: [MOI, AUTRE] });

    assert.equal(client.requetes.length, 4);
    assert.deepEqual(
      client.requetes.map(({ jeton }) => jeton),
      [null, null, null, null],
    );
  });

  it("ne redemande pas la fiche d'un joueur déjà connu", async () => {
    // Le cache de `personId` : c'est ce qui ramène le régime de croisière à une
    // requête par joueur et par semaine.
    const client = clientTracant();
    const identites = depotIdentites([{ licence: MOI, nom: "Simon RENOULT", personId: 1083591 }]);
    await passe({ client, identites, licences: [MOI] });

    assert.equal(client.requetes.length, 1, "l'action seule");
    assert.deepEqual(identites.ecrites, [], "rien à réécrire");
  });

  it("relit la fiche et retente une fois quand le cache rend une réponse vide", async () => {
    // Un cache qui ne se répare pas laisse un joueur muet jusqu'à ce que
    // quelqu'un lise un rapport.
    const client = clientTracant();
    const identites = depotIdentites([{ licence: MOI, nom: "Simon RENOULT", personId: 42 }]);
    let appels = 0;
    const module = moduleMyffbad({
      lireLeClassement: () => (++appels === 1 ? [] : CLASSEMENT),
    });

    const { rapport, classements } = await passe({ client, identites, module });

    assert.equal(rapport.issue, "succes");
    assert.equal(client.requetes.length, 3, "action vide, fiche relue, action retentée");
    assert.deepEqual(identites.ecrites.length, 1, "le cache est réparé");
    assert.deepEqual(classements.ecrits, [[MOI, CLASSEMENT]]);
  });

  it("ne retente pas quand la fiche venait d'être lue", async () => {
    // Sinon la même requête partirait deux fois pour rien, et un scraper qui
    // boucle vaut un compte banni (015).
    const client = clientTracant();
    const { rapport, classements } = await passe({
      client,
      module: moduleMyffbad({ lireLeClassement: () => [] }),
    });

    assert.equal(client.requetes.length, 2);
    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /aucune discipline/);
    assert.deepEqual(classements.ecrits, []);
  });

  it("continue sur les autres quand un coéquipier est muet, et le nomme", async () => {
    // Sans cette clémence, un seul coéquipier qui change de club ferait tomber
    // le classement de toute l'équipe, le mien compris.
    const module = moduleMyffbad({
      lireLIdentite: (_reponse, licenceVisee) => {
        if (licenceVisee === AUTRE) throw new Error("aucun bloc d'identité");
        return { licence: licenceVisee, nom: "Simon RENOULT", personId: 1083591 };
      },
    });

    const { rapport, classements } = await passe({ module, licences: [MOI, AUTRE] });

    assert.equal(rapport.issue, "succes");
    assert.equal(rapport.volumeExtrait, 3);
    assert.match(rapport.detail ?? "", /1 relevé\(s\) sur 2/);
    assert.match(rapport.detail ?? "", /02345678 : aucun bloc d'identité/);
    assert.deepEqual(
      classements.ecrits.map(([licenceEcrite]) => licenceEcrite),
      [MOI],
    );
  });

  it("échoue quand personne ne répond", async () => {
    const { rapport } = await passe({
      module: moduleMyffbad({
        lireLeClassement: () => {
          throw new ClassementIllisible("« D10 » n'est pas une lettre du barème (double)");
        },
      }),
      licences: [MOI, AUTRE],
    });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /0 relevé\(s\) sur 2/);
    assert.match(rapport.detail ?? "", /barème/);
  });

  it("consigne la panne au lieu de la lever", async () => {
    // Un ordonnanceur n'a personne à qui remonter une exception (019).
    const { rapport } = await passe({
      client: clientTracant(() => new Error("ECONNREFUSED")),
    });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /ECONNREFUSED/);
  });

  it("dit qu'il n'y a personne à relever plutôt que de consigner un succès à zéro", async () => {
    const { rapport } = await passe({ licences: [] });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /aucune licence suivie/);
  });

  it("refuse une source qui ne porte pas le classement", async () => {
    const badnet: ModuleDAcquisition = {
      source: "badnet",
      pagesDeLaSonde: () => [],
      murDeConnexion: () => false,
    };

    const { rapport } = await passe({ module: badnet });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /c'est myffbad qui en est la source/);
  });
});

describe("le plafond de la passe", () => {
  it("laisse deux requêtes par joueur, plus une de marge", () => {
    // Le premier passage lit la fiche et l'action pour chacun ; la marge couvre
    // la relecture qui répare un cache.
    assert.equal(plafondDeLaPasse(8), 18);
    assert.equal(plafondDeLaPasse(1), 4);
  });
});
