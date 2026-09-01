import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientHttp, ModuleDAcquisition, Reponse } from "./acquisition.ts";
import type { DepotJetonMyffbad, JetonMyffbad } from "./jeton-myffbad.ts";
import type { DepotRapports, RapportArchive, RapportExecution } from "./rapport-execution.ts";
import type { Source } from "./source.ts";
import { sonder } from "./sonde.ts";
import { tacheDAcquisition } from "./acquisition.ts";

const LE_JOUR = new Date("2026-09-01T08:00:00Z");
const horlogeFigee = { maintenant: () => LE_JOUR };

function moduleTemoin(source: Source, murPartout: boolean): ModuleDAcquisition {
  return {
    source,
    pagesDeLaSonde: (jeton) => [
      { intitule: "page publique", requete: { url: `https://${source}.test/`, jeton: null } },
      {
        intitule: "page privée",
        requete: { url: `https://${source}.test/prive`, jeton },
        extraire: () => 7,
      },
    ],
    murDeConnexion: () => murPartout,
  };
}

const reseauQuiRepond: ClientHttp = {
  recuperer: (requete): Promise<Reponse> =>
    Promise.resolve({ url: requete.url, statutHttp: 200, contenu: "<html>page</html>", cookies: [] }),
};

function jetons(valeurs: Partial<Record<Source, JetonMyffbad>>): DepotJetonMyffbad {
  return {
    lire: (source) => valeurs[source] ?? null,
    enregistrer: () => {},
    effacer: () => {},
  };
}

function rapportsEnMemoire(): DepotRapports & { consignes: RapportExecution[] } {
  const consignes: RapportExecution[] = [];
  return {
    consignes,
    consigner(rapport) {
      consignes.push(rapport);
      return { ...rapport, id: consignes.length } as RapportArchive;
    },
    dernierRapport: () => null,
    derniers: () => [],
  };
}

describe("la sonde d'accès", () => {
  it("rapporte chaque page atteinte et consigne une passe par source", async () => {
    const rapports = rapportsEnMemoire();

    const resultats = await sonder({
      modules: [moduleTemoin("myffbad", false), moduleTemoin("badnet", false)],
      clientPour: () => reseauQuiRepond,
      jetons: jetons({}),
      rapports,
      horloge: horlogeFigee,
    });

    assert.equal(resultats.length, 4);
    assert.ok(resultats.every(({ verdict }) => verdict === "atteinte"));

    assert.deepEqual(
      rapports.consignes.map(({ tache, issue, volumeExtrait }) => ({
        tache,
        issue,
        volumeExtrait,
      })),
      [
        { tache: tacheDAcquisition("myffbad"), issue: "succes", volumeExtrait: 7 },
        { tache: tacheDAcquisition("badnet"), issue: "succes", volumeExtrait: 7 },
      ],
      "le volume est ce qui a été extrait, jamais le nombre de pages atteintes",
    );
  });

  it("compte le mur de connexion comme un échec, pas comme un succès vide", async () => {
    const rapports = rapportsEnMemoire();

    const resultats = await sonder({
      modules: [moduleTemoin("myffbad", true)],
      clientPour: () => reseauQuiRepond,
      jetons: jetons({}),
      rapports,
      horloge: horlogeFigee,
    });

    assert.ok(resultats.every(({ verdict }) => verdict === "mur-de-connexion"));
    assert.partialDeepStrictEqual(rapports.consignes[0], { issue: "echec", volumeExtrait: 0 });
    assert.match(rapports.consignes[0]?.detail ?? "", /mur-de-connexion/);
  });

  it("continue sur les autres sources quand l'une tombe", async () => {
    const rapports = rapportsEnMemoire();

    const resultats = await sonder({
      modules: [moduleTemoin("myffbad", true), moduleTemoin("badnet", false)],
      clientPour: () => reseauQuiRepond,
      jetons: jetons({}),
      rapports,
      horloge: horlogeFigee,
    });

    const parSource = (source: Source) => resultats.filter((resultat) => resultat.source === source);
    assert.ok(parSource("myffbad").every(({ verdict }) => verdict === "mur-de-connexion"));
    assert.ok(parSource("badnet").every(({ verdict }) => verdict === "atteinte"));
  });

  it("consigne un échec plutôt que de laisser remonter une panne réseau", async () => {
    const rapports = rapportsEnMemoire();
    const reseauMort: ClientHttp = {
      recuperer: () => Promise.reject(new Error("getaddrinfo ENOTFOUND")),
    };

    const resultats = await sonder({
      modules: [moduleTemoin("badnet", false)],
      clientPour: () => reseauMort,
      jetons: jetons({}),
      rapports,
      horloge: horlogeFigee,
    });

    assert.ok(resultats.every(({ verdict }) => verdict === "echec"));
    assert.match(resultats[0]?.detail ?? "", /ENOTFOUND/);
    assert.equal(rapports.consignes[0]?.issue, "echec");
  });

  it("passe le jeton de la source aux seules pages qui en ont besoin", async () => {
    const vues: (string | null)[] = [];
    const espion: ClientHttp = {
      recuperer(requete): Promise<Reponse> {
        vues.push(requete.jeton);
        return reseauQuiRepond.recuperer(requete);
      },
    };

    await sonder({
      modules: [moduleTemoin("badnet", false)],
      clientPour: () => espion,
      jetons: jetons({
        badnet: {
          valeur: "session=valide",
          obtenuLe: LE_JOUR,
          expireLe: new Date("2026-10-01T08:00:00Z"),
        },
      }),
      rapports: rapportsEnMemoire(),
      horloge: horlogeFigee,
    });

    assert.deepEqual(vues, [null, "session=valide"]);
  });
});

describe("le succès vide", () => {
  it("échoue quand la source répond sans plus rien rendre", async () => {
    const rapports = rapportsEnMemoire();
    const module: ModuleDAcquisition = {
      source: "myffbad",
      pagesDeLaSonde: () => [
        {
          intitule: "résultats",
          requete: { url: "https://myffbad.test/", jeton: "session=morte" },
          // Ce que myffbad fait vraiment quand la session est tombée : un
          // statut 200, aucune erreur, et une liste vide.
          extraire: () => 0,
        },
      ],
      murDeConnexion: () => false,
    };

    const hier: DepotRapports = {
      ...rapports,
      dernierRapport: () =>
        ({ id: 1, tache: "acquisition:myffbad", volumeExtrait: 14 }) as RapportArchive,
    };

    const resultats = await sonder({
      modules: [module],
      clientPour: () => reseauQuiRepond,
      jetons: jetons({}),
      rapports: hier,
      horloge: horlogeFigee,
    });

    assert.equal(resultats[0]?.verdict, "atteinte", "la page a bien répondu");
    assert.equal(resultats[0]?.extraits, 0, "mais elle n'a rien rendu");
    assert.equal(rapports.consignes[0]?.issue, "vide", "et c'est un échec, pas un succès");
  });

  it("ne crie pas au vide quand la veille ne donnait rien non plus", async () => {
    const rapports = rapportsEnMemoire();

    await sonder({
      modules: [moduleTemoin("badnet", false)],
      clientPour: () => reseauQuiRepond,
      jetons: jetons({}),
      rapports,
      horloge: horlogeFigee,
    });

    assert.equal(rapports.consignes[0]?.issue, "succes");
  });
});
