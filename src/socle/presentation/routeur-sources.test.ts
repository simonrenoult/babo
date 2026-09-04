import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creerApplication } from "./serveur.ts";
import type { AccesAuxSources } from "./routeur-sources.ts";
import type { Configuration } from "../core/configuration.ts";
import { licence } from "../core/licence.ts";
import type { EtatDeLaSource } from "../core/acquisition.ts";
import type { MessageDepose } from "../core/courrier.ts";
import type { RapportArchive } from "../core/rapport-execution.ts";
import type { EtatDeLaTache, ReglageDeTache } from "../core/ordonnancement.ts";
import type { Source } from "../core/source.ts";
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

/** Un mail de test resté en attente : le SMTP n'est pas configuré (016). */
const MAIL_DE_TEST: MessageDepose = {
  id: 1,
  sujet: "[Bado] Mail de test",
  html: "<p>Le courrier fonctionne.</p>",
  texte: "Le courrier fonctionne.",
  deposeLe: new Date("2026-09-03T09:00:00Z"),
  tentatives: 0,
  prochaineTentativeLe: new Date("2026-09-03T09:00:00Z"),
  etat: "en-attente",
  dernierEchec: null,
};

/** Le rapport que la passe de 028 rend : une ligne par joueur, un décompte. */
const RAPPORT: RapportArchive = {
  id: 12,
  tache: "acquisition:myffbad",
  demarreLe: new Date("2026-09-01T05:00:00Z"),
  termineLe: new Date("2026-09-01T05:00:02Z"),
  issue: "succes",
  volumeExtrait: 24,
  detail: "8 relevé(s) sur 8",
};

/** Ce que l'écran affiche du planificateur — spec 018. */
const TACHES: readonly EtatDeLaTache[] = [
  {
    tache: "acquisition:myffbad",
    intitule: "Relever noms et classements (myffbad)",
    reglage: {
      tache: "acquisition:myffbad",
      cadence: { nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 },
      graceMinutes: 2880,
      active: true,
    },
    prochaine: {
      id: 3,
      tache: "acquisition:myffbad",
      prevueLe: new Date("2026-09-04T01:00:00"),
      tentatives: 0,
      prochaineTentativeLe: new Date("2026-09-04T01:00:00"),
      etat: "en-attente",
    },
    dernierRapport: RAPPORT,
  },
];

type Trace = {
  enregistres: [Source, string][];
  oublies: Source[];
  sondes: number;
  connectes: Source[];
  releves: number;
  importes: string[];
  reglages: ReglageDeTache[];
  mailsDeTest: number;
  codes: [Source, string][];
  attendus: { readonly source: Source; readonly demandeeLe: Date }[];
};

function ecran(): { acces: AccesAuxSources; trace: Trace } {
  const trace: Trace = {
    enregistres: [],
    oublies: [],
    sondes: 0,
    connectes: [],
    releves: 0,
    importes: [],
    reglages: [],
    mailsDeTest: 0,
    codes: [],
    attendus: [],
  };
  return {
    trace,
    acces: {
      etats: () => ETATS,
      // Un courrier non configuré : c'est l'état que l'écran doit savoir
      // annoncer, faute de quoi on croirait alerter sans alerter (016).
      courrier: () => ({
        configure: false,
        destinataire: null,
        enAttente: trace.mailsDeTest,
        derniers: Array.from({ length: trace.mailsDeTest }, () => MAIL_DE_TEST),
      }),
      envoyerUnMailDeTest: () => {
        trace.mailsDeTest += 1;
        return Promise.resolve(MAIL_DE_TEST);
      },
      rapports: () => [],
      ordonnancement: () => TACHES,
      reglerLaTache: (reglage) => void trace.reglages.push(reglage),
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
        // (022) : la doublure rend ce que `main.ts` rendrait — import puis
        // passe enchaînée (028).
        return Promise.resolve(
          csv.includes("licence")
            ? { issue: "importee", membres: 8, releve: { ...RAPPORT, detail: "8 relevé(s) sur 8" } }
            : { issue: "refusee", motifs: [{ ligne: 1, raison: "colonne « licence » absente." }] },
        );
      },
      oublier: (source) => void trace.oublies.push(source),
      connecter: (source) => {
        trace.connectes.push(source);
        // myffbad n'a pas de 2FA : sa connexion aboutit en un temps (015).
        return Promise.resolve("ouverte" as const);
      },
      confirmerLeCode: (source, code) => {
        trace.codes.push([source, code]);
        return Promise.resolve();
      },
      codesAttendus: () => trace.attendus,
      releverLesEngagements: () =>
        Promise.resolve({ statutHttp: 200, octets: 4096, capture: 12, murDeConnexion: false }),
      relever: () => {
        trace.releves += 1;
        return Promise.resolve(RAPPORT);
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
    authentification: porteOuverte,
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

  /**
   * Le bouton passe par la boîte d'envoi — spec 016. Sans lui, on découvrirait
   * un mot de passe d'application faux au moment de la première panne.
   */
  it("dépose un mail de test et rend son état", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/courrier", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.equal(trace.mailsDeTest, 1);
    assert.match(reponse.corps, /Mail de test <strong>en attente<\/strong>/);
  });

  it("annonce un courrier non configuré plutôt que de laisser croire qu'il alerte", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.match(reponse.corps, /Courrier non configuré/);
    assert.match(reponse.corps, /BABO_SMTP_MOT_DE_PASSE/);
  });

  /**
   * L'écran doit dire dans lequel des deux temps on est — spec 027. C'est cette
   * bascule qui distingue « le code n'est pas encore parti » de « le code est
   * faux ».
   */
  it("bascule sur le champ du code quand la source en réclame un", async () => {
    const { acces, trace } = ecran();
    trace.attendus.push({ source: "badnet", demandeeLe: new Date("2026-09-05T09:00:00Z") });

    const reponse = await interroger(acces, "/sources");

    assert.match(reponse.corps, /Code demandé/);
    assert.match(reponse.corps, /name="code"/);
    assert.match(reponse.corps, /dix minutes/, "et l'écran dit que l'attente tombe");
  });

  it("poste le code sur la source visée", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/sources/badnet/code",
      new URLSearchParams({ code: " 123456 " }),
    );

    assert.equal(reponse.statut, 302);
    assert.deepEqual(trace.codes, [["badnet", "123456"]]);
  });

  it("refuse un code vide plutôt que de le poster", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/badnet/code", new URLSearchParams({ code: "  " }));

    assert.equal(reponse.statut, 400);
    assert.deepEqual(trace.codes, []);
  });

  /**
   * Premier temps de 027 : on obtient la page et on l'archive, on n'en lit
   * rien. La capture est ce sur quoi le schéma se dessinera.
   */
  it("relève les engagements et annonce la capture archivée", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources/engagements", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /Page relevée : statut 200/);
    assert.match(reponse.corps, /npm run capture -- 12/);
  });

  it("rend le résultat de la sonde dans la page", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/sonde", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.equal(trace.sondes, 1);
    assert.match(reponse.corps, /accueil public/);
    assert.match(reponse.corps, /atteinte/);
  });

  it("lance la passe et rend son rapport, ligne par ligne", async () => {
    // Le bouton est ici, sur l'écran d'exploitation, et non sur « Mon profil » :
    // 001 écarte le « rafraîchir maintenant » entre les mains de l'utilisateur.
    // 018 déclenchera la même passe, et ce bouton n'aura plus qu'à dépanner.
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/classement", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.equal(trace.releves, 1);
    assert.match(reponse.corps, /8 relevé\(s\) sur 8/, "le décompte que 028 exige");
    assert.match(reponse.corps, /24 disciplines relevées/, "le volume, pas le nombre de pages");
  });
});

describe("l'ordonnancement", () => {
  it("affiche la cadence, la grâce et la prochaine échéance", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /chaque vendredi à 01 h 00/);
    assert.match(reponse.corps, /2880 min/, "la grâce se lit en minutes");
    assert.match(reponse.corps, /04\/09\/2026/, "la prochaine échéance est datée");
  });

  it("enregistre une cadence changée depuis l'écran, sans redéploiement", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/sources/ordonnancement",
      new URLSearchParams({
        tache: "acquisition:myffbad",
        nature: "hebdomadaire",
        jour: "6",
        heure: "3",
        minute: "30",
        grace: "120",
        active: "on",
      }),
    );

    assert.equal(reponse.redirection, "/sources");
    assert.deepEqual(trace.reglages, [
      {
        tache: "acquisition:myffbad",
        cadence: { nature: "hebdomadaire", jour: 6, heure: 3, minute: 30 },
        graceMinutes: 120,
        active: true,
      },
    ]);
  });

  it("suspend une tâche quand la case n'est pas cochée", async () => {
    const { acces, trace } = ecran();
    await interroger(
      acces,
      "/sources/ordonnancement",
      new URLSearchParams({
        tache: "acquisition:myffbad",
        nature: "quotidienne",
        heure: "1",
        minute: "0",
        grace: "720",
      }),
    );

    assert.deepEqual(trace.reglages[0]?.cadence, { nature: "quotidienne", heure: 1, minute: 0 });
    assert.equal(trace.reglages[0]?.active, false);
  });

  it("refuse une cadence hors bornes plutôt que d'écrire n'importe quelle heure", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/sources/ordonnancement",
      new URLSearchParams({
        tache: "acquisition:myffbad",
        nature: "hebdomadaire",
        jour: "5",
        heure: "25",
        minute: "0",
        grace: "60",
      }),
    );

    assert.equal(reponse.statut, 400);
    assert.deepEqual(trace.reglages, [], "rien n'est écrit sur un refus");
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

  /**
   * Jamais de redirection muette : au premier essai réel, badnet a ouvert la
   * session sans réclamer de code, et l'écran n'en disait rien — on cherchait
   * un champ de code qui n'existait pas.
   */
  it("dit que la session s'est ouverte sans code", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/sources/myffbad/connexion", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /Session myffbad ouverte/);
    assert.match(reponse.corps, /Aucun code n'a\s+été demandé/);
    assert.deepEqual(trace.connectes, ["myffbad"]);
  });

  it("laisse remonter l'échec au lieu de prétendre que tout va bien", async () => {
    const { acces } = ecran();
    const cassee = { ...acces, connecter: () => Promise.reject(new Error("identifiants refusés")) };
    const reponse = await interroger(cassee, "/sources/myffbad/connexion", new URLSearchParams());

    assert.equal(reponse.statut, 500);
  });
});
