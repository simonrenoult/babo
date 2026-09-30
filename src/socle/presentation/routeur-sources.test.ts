import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creerApplication } from "./serveur.ts";
import type { AccesAuxSources, DemandeDeCalendrier } from "./routeur-sources.ts";
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
  sujet: "[Babo] Mail de test",
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

/** Ce que l'écran affiche du planificateur — spec 018, complété pour 037. */
const TACHES: readonly EtatDeLaTache[] = [
  {
    tache: "acquisition:myffbad",
    intitule: "Relever noms et classements (myffbad)",
    description: "Le nom et le classement de chaque membre, lus sur myffbad.",
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
  {
    // Un rappel de veille (014) : une échéance ponctuelle n'est pas une passe.
    tache: "rappel:veille",
    intitule: "Rappel d'ouverture (ponctuel)",
    description: "",
    reglage: {
      tache: "rappel:veille",
      cadence: { nature: "ponctuelle" },
      graceMinutes: 60,
      active: true,
    },
    prochaine: null,
    dernierRapport: null,
  },
  {
    // Une tâche suspendue : pas de bouton, elle ne se lance pas non plus.
    tache: "acquisition:badnet",
    intitule: "Acquisition badnet (suspendue)",
    description: "",
    reglage: {
      tache: "acquisition:badnet",
      cadence: { nature: "quotidienne", heure: 2, minute: 0 },
      graceMinutes: 720,
      active: false,
    },
    prochaine: null,
    dernierRapport: null,
  },
  {
    // Le battement de 019 : son silence est l'information, donc pas de bouton.
    tache: "battement",
    intitule: "Battement hebdomadaire",
    description: "",
    reglage: {
      tache: "battement",
      cadence: { nature: "hebdomadaire", jour: 1, heure: 8, minute: 0 },
      graceMinutes: 0,
      active: true,
    },
    prochaine: null,
    dernierRapport: null,
  },
];

type Trace = {
  enregistres: [Source, string][];
  oublies: Source[];
  sondes: number;
  connectes: Source[];
  declenchements: string[];
  importes: string[];
  reglages: ReglageDeTache[];
  mailsDeTest: number;
  codes: [Source, string][];
  attendus: { readonly source: Source; readonly demandeeLe: Date }[];
  engagements: number;
  calendriers: DemandeDeCalendrier[];
};

function ecran(): { acces: AccesAuxSources; trace: Trace } {
  const trace: Trace = {
    enregistres: [],
    oublies: [],
    sondes: 0,
    connectes: [],
    declenchements: [],
    importes: [],
    reglages: [],
    mailsDeTest: 0,
    codes: [],
    attendus: [],
    engagements: 0,
    calendriers: [],
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
      // L'historique d'une tâche : le rapport de classement, et rien pour les autres.
      rapports: (tache?: string) => (tache === undefined || tache === RAPPORT.tache ? [RAPPORT] : []),
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
      calendrier: () => null,
      importerLesDisponibilites: (csv) =>
        Promise.resolve(
          csv.startsWith("Nom;")
            ? { issue: "importees", repondants: 14, journees: [1, 2, 3, 4, 5], aRattacher: 3 }
            : { issue: "refusees", motifs: [{ ligne: 1, raison: "colonne « x » : ni journée ni date." }] },
        ),
      importerLeCalendrier: (demande) => {
        trace.calendriers.push(demande);
        return Promise.resolve(
          demande.equipe === "75-BAP-5"
            ? {
                issue: "importe",
                calendrier: {
                  ...demande,
                  nomEquipe: "Bad’ à Paname 5",
                  competition: "ICD75 D3 Mixte",
                  groupe: "Groupe B",
                  rencontres: 10,
                  importeLe: new Date("2026-09-30T10:00:00Z"),
                },
              }
            : { issue: "refuse", raison: "Aucune rencontre pour « 75-BAP-4 » dans ce groupe.", demande },
        );
      },
      engagements: () => trace.engagements,
      executerMaintenant: (tache) => {
        trace.declenchements.push(tache);
        // La doublure rend ce que `main.ts` rendrait : le rapport du
        // déclenchement, sous l'identifiant que la route a lié au chemin (037).
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
  it("ouvre la racine et le groupe sur les tâches", async () => {
    const { acces } = ecran();

    for (const chemin of ["/parametres", "/parametres/scrapping"]) {
      const reponse = await interroger(acces, chemin);
      assert.equal(reponse.statut, 302, chemin);
      assert.equal(reponse.redirection, "/parametres/scrapping/ordonnancement", chemin);
    }
  });

  it("garde l'ancienne adresse /sources, redirigée", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/sources");

    assert.equal(reponse.statut, 302);
    assert.equal(reponse.redirection, "/parametres");
  });

  it("ne rend que l'onglet demandé, et refuse un onglet inconnu", async () => {
    const { acces } = ecran();

    const sessions = await interroger(acces, "/parametres/scrapping/sessions");
    assert.match(sessions.corps, /<title>Paramètres/);
    assert.match(sessions.corps, /Enregistrer une session/);
    assert.match(sessions.corps, /href="\/parametres\/scrapping\/emails"/, "les onglets sont des liens");
    assert.doesNotMatch(sessions.corps, /<h3>Courrier/, "le courrier a son propre onglet");

    const courrier = await interroger(acces, "/parametres/scrapping/emails");
    assert.match(courrier.corps, /<h3>Courrier/);
    assert.match(courrier.corps, /<h2>Paramètres<\/h2>/, "le titre de la section, au-dessus des onglets");
    assert.doesNotMatch(courrier.corps, /Enregistrer une session/);

    const inconnu = await interroger(acces, "/parametres/scrapping/pouet");
    assert.equal(inconnu.statut, 404);
  });

  it("affiche l'état de chaque source, ancienneté comprise", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sources");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /myffbad/);
    assert.match(reponse.corps, /badnet/);
    assert.match(reponse.corps, /expirée/);
    assert.match(reponse.corps, /jamais/, "une source jamais acquise doit le dire");
  });

  it("dit à côté du champ si une session existe déjà, et jusqu'à quand", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sessions");

    assert.match(reponse.corps, /Aucune session enregistrée/, "badnet n'en a pas");
    assert.match(reponse.corps, /Session enregistrée le 16\/07\/2026/, "myffbad en a une");
    assert.match(reponse.corps, /expirée<\/strong> depuis le 15\/08\/2026/);
  });

  it("ne réaffiche jamais le jeton qu'on lui a confié", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sessions");

    // Le champ reste vide par construction : un jeton rendu dans le HTML
    // repartirait dans le cache et l'historique du navigateur.
    assert.doesNotMatch(reponse.corps, /name="valeur"[^>]*value=/);
  });

  it("ne demande jamais le mot de passe fédéral, seulement le cookie déjà obtenu", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sessions");

    assert.doesNotMatch(reponse.corps, /type="password"/);
    assert.match(reponse.corps, /Cookie de session/);
  });

  it("enregistre une session et revient à l'écran", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/scrapping/sessions/myffbad/jeton",
      new URLSearchParams({ valeur: "  session=abc  " }),
    );

    assert.equal(reponse.statut, 302);
    assert.equal(reponse.redirection, "/parametres/scrapping/sessions");
    assert.deepEqual(trace.enregistres, [["myffbad", "session=abc"]]);
  });

  it("refuse un jeton vide plutôt que d'écrire une session morte", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/scrapping/sessions/myffbad/jeton",
      new URLSearchParams({ valeur: "   " }),
    );

    assert.equal(reponse.statut, 400);
    assert.deepEqual(trace.enregistres, []);
  });

  it("oublie un jeton sur demande", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sessions/badnet/oubli", new URLSearchParams());

    assert.equal(reponse.statut, 302);
    assert.deepEqual(trace.oublies, ["badnet"]);
  });

  it("ne connaît que les deux sources de la spec 015", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/scrapping/sessions/poona/jeton",
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
    const reponse = await interroger(acces, "/parametres/scrapping/emails", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.equal(trace.mailsDeTest, 1);
    assert.match(reponse.corps, /Mail de test <strong>en attente<\/strong>/);
  });

  it("annonce un courrier non configuré plutôt que de laisser croire qu'il alerte", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/emails");

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

    const reponse = await interroger(acces, "/parametres/scrapping/sessions");

    assert.match(reponse.corps, /Code demandé/);
    assert.match(reponse.corps, /name="code"/);
    assert.match(reponse.corps, /dix minutes/, "et l'écran dit que l'attente tombe");
  });

  it("poste le code sur la source visée", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/scrapping/sessions/badnet/code",
      new URLSearchParams({ code: " 123456 " }),
    );

    assert.equal(reponse.statut, 302);
    assert.deepEqual(trace.codes, [["badnet", "123456"]]);
  });

  it("refuse un code vide plutôt que de le poster", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sessions/badnet/code", new URLSearchParams({ code: "  " }));

    assert.equal(reponse.statut, 400);
    assert.deepEqual(trace.codes, []);
  });

  it("renvoie la liste des engagements sur la feature, et n'en garde que le décompte", async () => {
    // La frontière de 030 : `/sources` porte l'exploitation, la feature porte
    // la donnée. Deux écrans qui affichent la même table en affichent deux
    // versions le jour où l'une bouge.
    const { acces, trace } = ecran();
    trace.engagements = 3;

    const reponse = await interroger(acces, "/parametres/engagements");

    assert.match(reponse.corps, /3<\/strong>\s*engagements/);
    assert.match(reponse.corps, /\/mon-profil/);
  });

  it("rend le résultat de la sonde dans la page", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sondes", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.equal(trace.sondes, 1);
    assert.match(reponse.corps, /accueil public/);
    assert.match(reponse.corps, /atteinte/);
  });

  it("déclenche une tâche du tableau par le geste unique, et rend son rapport", async () => {
    // Le bouton est sur le tableau d'ordonnancement, et tout passe par le même
    // geste : la route lie la tâche du chemin, appelle `executerMaintenant`, et
    // réaffiche l'écran avec le rapport du déclenchement (spec 037).
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/scrapping/ordonnancement/acquisition:myffbad/executer",
      new URLSearchParams(),
    );

    assert.equal(reponse.statut, 200);
    assert.deepEqual(trace.declenchements, ["acquisition:myffbad"], "la tâche est lue dans le chemin");
    assert.match(reponse.corps, /Dernier déclenchement/, "sur la page de la tâche");
    assert.match(reponse.corps, /<code>acquisition:myffbad<\/code>/);
    assert.match(reponse.corps, /8 relevé\(s\) sur 8/, "le décompte que 028 exige");
    assert.match(reponse.corps, /24 disciplines relevées/, "le volume, pas le nombre de pages");
  });

  it("refuse une tâche inconnue en 404, sans rien déclencher", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/scrapping/ordonnancement/inconnue:pouet/executer",
      new URLSearchParams(),
    );

    assert.equal(reponse.statut, 404);
    assert.deepEqual(trace.declenchements, []);
  });

  it("refuse le battement, une tâche suspendue et une échéance ponctuelle", async () => {
    for (const cible of ["battement", "acquisition:badnet", "rappel:veille"]) {
      const { acces, trace } = ecran();
      const reponse = await interroger(
        acces,
        `/parametres/scrapping/ordonnancement/${cible}/executer`,
        new URLSearchParams(),
      );

      assert.equal(reponse.statut, 400, cible);
      assert.deepEqual(trace.declenchements, [], cible);
    }
  });
});

describe("le tableau d'ordonnancement", () => {
  it("porte un bouton Lancer par tâche active à cadence, sauf le battement", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/ordonnancement");

    // La tâche de classement relève d'une cadence : elle porte le bouton.
    const classe = /action="\/parametres\/scrapping\/ordonnancement\/acquisition:myffbad\/executer"/.exec(
      reponse.corps,
    );
    assert.ok(classe, "la tâche à cadence porte un bouton Lancer");

    // Le battement (019), la ponctuelle (014) et la suspendue n'en portent pas.
    assert.doesNotMatch(reponse.corps, /action="[^"]*battement[^"]*executer"/);
    assert.doesNotMatch(reponse.corps, /action="[^"]*rappel:veille[^"]*executer"/);
    assert.doesNotMatch(reponse.corps, /action="[^"]*acquisition:badnet[^"]*executer"/);
  });
});

describe("l'ordonnancement", () => {
  it("liste les tâches par nom brut, cadence, échéance et dernier résultat, sans réglage", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/ordonnancement");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /<th>Nom<\/th><th>Cadence<\/th><th>Prochaine échéance<\/th><th>Dernier résultat<\/th><th>Actions<\/th>/);
    assert.match(reponse.corps, /<code>acquisition:myffbad<\/code>/);
    assert.match(reponse.corps, /chaque vendredi à 1h/);
    assert.match(reponse.corps, /04\/09\/2026/, "la prochaine échéance est datée");
    assert.match(reponse.corps, /href="\/parametres\/scrapping\/ordonnancement\/acquisition%3Amyffbad">Voir/);
    assert.doesNotMatch(reponse.corps, /name="grace"/, "la cadence se règle sur la page de la tâche");
  });

  it("détaille une tâche : description, grâce, tentatives, réglage et historique", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/ordonnancement/acquisition:myffbad");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /<h2>Paramètres<\/h2>/);
    assert.match(reponse.corps, /Le nom et le classement de chaque membre, lus sur myffbad\./, "sa description");
    assert.match(reponse.corps, /48 h/, "la grâce, lisible");
    assert.match(reponse.corps, /3 au plus par échéance/, "le plafond de tentatives");
    assert.match(reponse.corps, /name="grace" type="number" min="0" size="5" value="2880"/, "le réglage, pré-rempli");
    assert.match(reponse.corps, /8 relevé\(s\) sur 8/, "l'historique de ses exécutions");
    assert.match(reponse.corps, /Lancer maintenant/);
  });

  it("ne propose pas de lancer le battement depuis sa page, et 404 sur une tâche inconnue", async () => {
    const { acces } = ecran();
    const battement = await interroger(acces, "/parametres/scrapping/ordonnancement/battement");
    assert.equal(battement.statut, 200);
    assert.doesNotMatch(battement.corps, /Lancer maintenant/);
    assert.match(battement.corps, /Aucune exécution consignée pour cette tâche/);

    const inconnue = await interroger(acces, "/parametres/scrapping/ordonnancement/inconnue:pouet");
    assert.equal(inconnue.statut, 404);
  });

  it("enregistre une cadence changée depuis l'écran, sans redéploiement", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/scrapping/ordonnancement",
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

    assert.equal(reponse.redirection, "/parametres/scrapping/ordonnancement/acquisition%3Amyffbad", "retour sur la page de la tâche");
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
      "/parametres/scrapping/ordonnancement",
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
      "/parametres/scrapping/ordonnancement",
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
    const reponse = await interroger(acces, "/parametres/equipe", "licence;sexe;telephone\n");

    assert.equal(reponse.statut, 200);
    assert.deepEqual(trace.importes, ["licence;sexe;telephone\n"]);
    assert.match(reponse.corps, /8<\/strong>\s*membres importés/);
  });

  it("rend chaque anomalie avec sa ligne, et refuse en 400", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/equipe", "n'importe quoi\n");

    assert.equal(reponse.statut, 400);
    assert.match(reponse.corps, /rien n'a été écrit/);
    assert.match(reponse.corps, /colonne « licence » absente/);
  });

  it("dit à l'écran que l'import remplace la liste entière", async () => {
    // La suppression du partant, relevés compris, est la contrepartie assumée
    // de 005 : elle doit être écrite là où on clique, pas seulement en spec.
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/equipe");

    assert.match(reponse.corps, /remplace la liste entière/);
  });
});

describe("la connexion autonome", () => {
  it("propose le bouton à la source qui sait se connecter, et à elle seule", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sessions");

    assert.match(reponse.corps, /action="\/parametres\/scrapping\/sessions\/myffbad\/connexion"/);
    assert.doesNotMatch(reponse.corps, /action="\/parametres\/scrapping\/sessions\/badnet\/connexion"/);
  });

  /**
   * Jamais de redirection muette : au premier essai réel, badnet a ouvert la
   * session sans réclamer de code, et l'écran n'en disait rien — on cherchait
   * un champ de code qui n'existait pas.
   */
  it("dit que la session s'est ouverte sans code", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(acces, "/parametres/scrapping/sessions/myffbad/connexion", new URLSearchParams());

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /Session myffbad ouverte/);
    assert.match(reponse.corps, /Aucun code n'a\s+été demandé/);
    assert.deepEqual(trace.connectes, ["myffbad"]);
  });

  it("laisse remonter l'échec au lieu de prétendre que tout va bien", async () => {
    const { acces } = ecran();
    const cassee = { ...acces, connecter: () => Promise.reject(new Error("identifiants refusés")) };
    const reponse = await interroger(cassee, "/parametres/scrapping/sessions/myffbad/connexion", new URLSearchParams());

    assert.equal(reponse.statut, 500);
  });
});

describe("l'import du calendrier d'interclub", () => {
  const GROUPE = "https://icbad.ffbad.org/competition/2601367/tableau/19107";

  it("a son onglet, qui dit qu'aucun calendrier n'est importé", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/calendrier");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /aria-current="page">Import calendrier/);
    assert.match(reponse.corps, /Aucun calendrier importé/);
    assert.match(reponse.corps, /action="\/parametres\/calendrier"/);    assert.match(reponse.corps, /value="https:\/\/icbad\.ffbad\.org\/competition\/2601367\/tableau\/19107"/);
    assert.match(reponse.corps, /value="75-CPS10-5"/, "pré-rempli tant qu'aucun calendrier n'est importé");
  });

  it("importe et renvoie vers la liste sur le capitanat", async () => {
    const { acces, trace } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/calendrier",
      new URLSearchParams({ url: ` ${GROUPE} `, equipe: " 75-BAP-5 " }),
    );

    assert.equal(reponse.statut, 200);
    assert.deepEqual(trace.calendriers, [{ url: GROUPE, equipe: "75-BAP-5" }]);
    assert.match(reponse.corps, /<strong>10<\/strong>\s*rencontres/);
    assert.match(reponse.corps, /href="\/capitanat"/);
  });

  it("dit pourquoi il refuse, et rend la saisie pour la corriger", async () => {
    const { acces } = ecran();
    const reponse = await interroger(
      acces,
      "/parametres/calendrier",
      new URLSearchParams({ url: GROUPE, equipe: "75-BAP-4" }),
    );

    assert.equal(reponse.statut, 400);
    assert.match(reponse.corps, /rien n'a été écrit/);
    assert.match(reponse.corps, /Aucune rencontre pour « 75-BAP-4 »/);
    assert.match(reponse.corps, /value="75-BAP-4"/);
  });
});

describe("l'import des disponibilités", () => {
  it("a son onglet, qui renvoie vers la grille du capitanat", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/disponibilites");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /aria-current="page">Import disponibilités/);
    assert.match(reponse.corps, /href="\/capitanat\/disponibilites"/);
  });

  it("dit combien de noms restent à rattacher", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/disponibilites", "Nom;J1 - jeu. 05/11/2026\n");

    assert.equal(reponse.statut, 200);
    assert.match(reponse.corps, /<strong>14<\/strong>\s*répondants sur\s*J1, J2, J3, J4, J5/);
    assert.match(reponse.corps, /<strong>3<\/strong>\s*noms à rattacher/);
  });

  it("refuse en nommant la ligne, sans rien écrire", async () => {
    const { acces } = ecran();
    const reponse = await interroger(acces, "/parametres/disponibilites", "x;y\n");

    assert.equal(reponse.statut, 400);
    assert.match(reponse.corps, /rien n'a été écrit/);
    assert.match(reponse.corps, /ni journée ni date/);
  });
});
