import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientHttp, ModuleDAcquisition, Reponse } from "./acquisition.ts";
import type { Classement, DepotClassements, ReleveDeClassement } from "./classement.ts";
import { ClassementIllisible } from "./classement.ts";
import type { Horloge } from "./horloge.ts";
import type { DepotJetonMyffbad, JetonMyffbad } from "./jeton-myffbad.ts";
import { licence } from "./licence.ts";
import type { DepotRapports, RapportArchive, RapportExecution } from "./rapport-execution.ts";
import { releverLeClassement } from "./passe-classement.ts";
import type { Source } from "./source.ts";

const LICENCE = licence("07194591");
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

function jetons(jeton: JetonMyffbad | null): DepotJetonMyffbad {
  return { lire: () => jeton, enregistrer: () => {}, effacer: () => {} };
}

const VIVANT: JetonMyffbad = {
  valeur: "jwt=peu-importe",
  obtenuLe: new Date("2026-08-20T08:00:00Z"),
  expireLe: new Date("2026-09-20T08:00:00Z"),
};

function depotClassements(): DepotClassements & { ecrits: [readonly Classement[], Date][] } {
  const ecrits: [readonly Classement[], Date][] = [];
  return {
    ecrits,
    relever: (_licence, classements, vuLe) => void ecrits.push([classements, vuLe]),
    derniers: (): readonly ReleveDeClassement[] => [],
  };
}

function depotRapports(precedent: number | null = null): DepotRapports & {
  consignes: RapportExecution[];
} {
  const consignes: RapportExecution[] = [];
  return {
    consignes,
    consigner: (rapport) => {
      consignes.push(rapport);
      return { ...rapport, id: consignes.length } satisfies RapportArchive;
    },
    dernierRapport: () =>
      precedent === null
        ? null
        : {
            id: 0,
            tache: "acquisition:myffbad",
            demarreLe: MAINTENANT,
            termineLe: MAINTENANT,
            issue: "succes",
            volumeExtrait: precedent,
            detail: null,
          },
    derniers: () => [],
  };
}

/** Un module myffbad réduit à ce que la passe lui demande. */
function moduleMyffbad(options: {
  readonly lire?: (reponse: Reponse) => readonly Classement[];
  readonly requete?: (jeton: string) => ReturnType<NonNullable<ModuleDAcquisition["classement"]>["requete"]>;
  readonly source?: Source;
} = {}): ModuleDAcquisition {
  return {
    source: options.source ?? "myffbad",
    pagesDeLaSonde: () => [],
    murDeConnexion: (reponse) => new URL(reponse.url).pathname.startsWith("/connexion"),
    classement: {
      requete: options.requete ?? (() => ({ url: "https://www.myffbad.fr/joueur/07194591", jeton: null })),
      lire: options.lire ?? (() => CLASSEMENT),
    },
  };
}

function client(recuperer: () => Promise<Reponse>): ClientHttp {
  return { recuperer };
}

async function passe(options: {
  readonly module?: ModuleDAcquisition;
  readonly client?: ClientHttp;
  readonly jeton?: JetonMyffbad | null;
  readonly precedent?: number | null;
}) {
  const classements = depotClassements();
  const rapports = depotRapports(options.precedent ?? null);
  const rapport = await releverLeClassement({
    client: options.client ?? client(() => Promise.resolve(reponse())),
    module: options.module ?? moduleMyffbad(),
    licence: LICENCE,
    jetons: jetons(options.jeton === undefined ? VIVANT : options.jeton),
    classements,
    rapports,
    horloge,
  });
  return { rapport, classements, rapports };
}

describe("la passe qui relève le classement", () => {
  it("écrit ce qu'elle a lu et consigne un succès", async () => {
    const { rapport, classements } = await passe({});

    assert.equal(rapport.issue, "succes");
    assert.equal(rapport.volumeExtrait, 3);
    assert.equal(rapport.tache, "acquisition:myffbad", "la tâche de la source, comme la sonde");
    assert.deepEqual(classements.ecrits, [[CLASSEMENT, MAINTENANT]]);
  });

  it("ne part pas en requête sans session valide", async () => {
    // Une requête pour rien sur un compte dont le bannissement est un risque
    // assumé (015) : la passe échoue avant de toucher au réseau.
    let requetes = 0;
    const { rapport, classements } = await passe({
      jeton: null,
      client: client(() => {
        requetes += 1;
        return Promise.resolve(reponse());
      }),
    });

    assert.equal(requetes, 0);
    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /Aucune session myffbad valide/);
    assert.deepEqual(classements.ecrits, []);
  });

  it("échoue quand la session est expirée, sans la confondre avec l'absence", async () => {
    const perime = { ...VIVANT, expireLe: new Date("2026-08-25T08:00:00Z") };

    assert.equal((await passe({ jeton: perime })).rapport.issue, "echec");
  });

  it("échoue quand le jeton ne porte pas l'identifiant du joueur", async () => {
    const { rapport } = await passe({ module: moduleMyffbad({ requete: () => null }) });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /identifiant interne du joueur/);
  });

  it("consigne la session morte au lieu de la lever", async () => {
    // Un ordonnanceur n'a personne à qui remonter une exception : toute panne
    // devient un rapport en échec (019).
    const { rapport, classements } = await passe({
      client: client(() => Promise.resolve(reponse("https://www.myffbad.fr/connexion"))),
    });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /Session myffbad tombée/);
    assert.deepEqual(classements.ecrits, []);
  });

  it("consigne la lettre hors barème plutôt que de l'écrire", async () => {
    const { rapport, classements } = await passe({
      module: moduleMyffbad({
        lire: () => {
          throw new ClassementIllisible("« D10 » n'est pas une lettre du barème (double)");
        },
      }),
    });

    assert.equal(rapport.issue, "echec");
    assert.match(rapport.detail ?? "", /barème/);
    assert.deepEqual(classements.ecrits, []);
  });

  it("appelle « vide » la fiche qui ne rend plus rien là où elle rendait quelque chose", async () => {
    const { rapport, classements } = await passe({
      module: moduleMyffbad({ lire: () => [] }),
      precedent: 3,
    });

    assert.equal(rapport.issue, "vide", "le succès vide que 019 nomme");
    assert.equal(rapport.volumeExtrait, 0);
    assert.deepEqual(classements.ecrits, [], "`vu_le` ne bouge qu'à la passe qui a vu quelque chose");
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
