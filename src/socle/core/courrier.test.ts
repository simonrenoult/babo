import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DepotCourrier, Message, MessageDepose, Transport } from "./courrier.ts";
import {
  DELAIS_DE_REESSAI_DUN_MESSAGE,
  PREFIXE_DU_SUJET,
  TACHE_COURRIER,
  creerCourrier,
  messageDeTest,
} from "./courrier.ts";
import type { DepotEcheances, Echeance } from "./ordonnancement.ts";
import type { DepotRapports, RapportArchive, RapportExecution } from "./rapport-execution.ts";

const DEPART = new Date(2026, 8, 3, 9, 0);
const MINUTE = 60_000;

function horlogeMobile(depart: Date) {
  let maintenant = depart;
  return {
    maintenant: () => maintenant,
    avancerDe: (millisecondes: number) => {
      maintenant = new Date(maintenant.getTime() + millisecondes);
    },
  };
}

/** Le dépôt en mémoire, avec la même sémantique que l'adaptateur SQLite. */
function depotEnMemoire(): DepotCourrier & { readonly tous: () => MessageDepose[] } {
  const messages: MessageDepose[] = [];

  const remplacer = (id: number, champs: Partial<MessageDepose>): void => {
    const index = messages.findIndex((message) => message.id === id);
    messages[index] = { ...messages[index]!, ...champs };
  };

  return {
    tous: () => messages,

    deposer(message: Message, quand: Date): MessageDepose {
      const depose: MessageDepose = {
        id: messages.length + 1,
        sujet: message.sujet,
        html: message.html,
        texte: message.texte ?? null,
        deposeLe: quand,
        tentatives: 0,
        prochaineTentativeLe: quand,
        etat: "en-attente",
        dernierEchec: null,
      };
      messages.push(depose);
      return depose;
    },

    lire: (id) => messages.find((message) => message.id === id) ?? null,

    dus: (maintenant) =>
      messages.filter(
        (message) =>
          message.etat === "en-attente" && message.prochaineTentativeLe.getTime() <= maintenant.getTime(),
      ),

    marquerEnvoye: (id) => remplacer(id, { etat: "envoye" }),

    reporter: (id, tentatives, prochaineTentativeLe, echec) =>
      remplacer(id, { tentatives, prochaineTentativeLe, dernierEchec: echec }),

    abandonner: (id, tentatives, _quand, echec) =>
      remplacer(id, { etat: "abandonne", tentatives, dernierEchec: echec }),

    derniers: (combien) => [...messages].reverse().slice(0, combien),

    compterEnAttente: () => messages.filter((message) => message.etat === "en-attente").length,
  };
}

function rapportsEnMemoire(): DepotRapports & { readonly tous: () => RapportArchive[] } {
  const rapports: RapportArchive[] = [];
  return {
    tous: () => rapports,
    consigner(rapport: RapportExecution): RapportArchive {
      const archive = { ...rapport, id: rapports.length + 1 };
      rapports.push(archive);
      return archive;
    },
    dernierRapport: (tache) => rapports.findLast((rapport) => rapport.tache === tache) ?? null,
    dernierSucces: (tache) =>
      rapports.findLast((rapport) => rapport.tache === tache && rapport.issue === "succes") ?? null,
    derniers: (combien) => [...rapports].reverse().slice(0, combien),
    depuis: (quand) => rapports.filter(({ demarreLe }) => demarreLe >= quand),
  };
}

function echeancesEnMemoire(): DepotEcheances & { readonly inscrites: () => Date[] } {
  const inscrites: Date[] = [];
  const echeance = (tache: string, prevueLe: Date): Echeance => ({
    id: inscrites.length,
    tache,
    prevueLe,
    tentatives: 0,
    prochaineTentativeLe: prevueLe,
    etat: "en-attente",
  });

  return {
    inscrites: () => inscrites,
    inscrire(tache: string, prevueLe: Date): Echeance {
      // L'index (tâche, date prévue) de 018 : réinscrire la même occurrence ne
      // la duplique pas.
      if (!inscrites.some((date) => date.getTime() === prevueLe.getTime())) inscrites.push(prevueLe);
      return echeance(tache, prevueLe);
    },
    dues: () => [],
    prochaine: () => null,
    reporter: () => undefined,
    clore: () => undefined,
    annuler: () => 0,
  };
}

function transportQuiAccepte(): Transport & { readonly recus: () => Message[] } {
  const recus: Message[] = [];
  return {
    destinataire: "contact@exemple.fr",
    recus: () => recus,
    envoyer: (message) => {
      recus.push(message);
      return Promise.resolve();
    },
  };
}

function transportQuiRefuse(raison: string): Transport {
  return {
    destinataire: "contact@exemple.fr",
    envoyer: () => Promise.reject(new Error(raison)),
  };
}

function atelier(transport: Transport | null, depart = DEPART) {
  const depot = depotEnMemoire();
  const rapports = rapportsEnMemoire();
  const echeances = echeancesEnMemoire();
  const horloge = horlogeMobile(depart);
  const courrier = creerCourrier({ depot, transport, rapports, echeances, horloge });
  return { courrier, depot, rapports, echeances, horloge };
}

const UN_MESSAGE: Message = { sujet: "Panne de scraping", html: "<p>myffbad n'a rien rendu.</p>" };

describe("le courrier", () => {
  it("préfixe le sujet, écrit en base et remet aussitôt", async () => {
    const transport = transportQuiAccepte();
    const { courrier, depot } = atelier(transport);

    const depose = await courrier.deposer(UN_MESSAGE);

    assert.equal(depose.sujet, `${PREFIXE_DU_SUJET}Panne de scraping`);
    assert.equal(depose.etat, "envoye");
    assert.equal(depot.compterEnAttente(), 0);
    assert.deepEqual(
      transport.recus().map((message) => message.sujet),
      ["[Babo] Panne de scraping"],
    );
  });

  /**
   * Le mode « écrit plutôt qu'envoyé » que 016 exige en développement et en
   * test n'est pas un adaptateur de plus : c'est le cas où personne ne vide la
   * file.
   */
  it("empile sans rien tenter quand le SMTP n'est pas configuré", async () => {
    const { courrier, depot, rapports } = atelier(null);

    const depose = await courrier.deposer(UN_MESSAGE);

    assert.equal(depose.etat, "en-attente");
    // Aucune tentative consommée : les trois tentatives servent à traverser une
    // panne de Gmail, pas à punir une configuration absente.
    assert.equal(depose.tentatives, 0);
    assert.equal(depot.compterEnAttente(), 1);
    assert.deepEqual(rapports.tous(), []);
    assert.equal(courrier.etat().configure, false);
  });

  it("ne consigne rien quand il n'y a rien à faire", async () => {
    const { courrier, rapports } = atelier(transportQuiAccepte());

    assert.equal(await courrier.vider(), null);
    assert.deepEqual(rapports.tous(), []);
  });

  it("reprend à cinq puis à trente minutes, et abandonne à la troisième", async () => {
    const { courrier, depot, echeances, horloge } = atelier(transportQuiRefuse("535 refusé"));

    const apresLePremierEchec = await courrier.deposer(UN_MESSAGE);
    assert.equal(apresLePremierEchec.tentatives, 1);
    assert.equal(apresLePremierEchec.etat, "en-attente");
    assert.match(apresLePremierEchec.dernierEchec ?? "", /535 refusé/);
    assert.deepEqual(
      echeances.inscrites().map((date) => date.getTime() - DEPART.getTime()),
      [DELAIS_DE_REESSAI_DUN_MESSAGE[0]],
    );

    horloge.avancerDe(5 * MINUTE);
    await courrier.vider();
    assert.equal(depot.tous()[0]?.tentatives, 2);
    assert.equal(depot.tous()[0]?.etat, "en-attente");

    horloge.avancerDe(30 * MINUTE);
    await courrier.vider();
    // Trois tentatives, pas une de plus : au-delà, c'est une panne à voir, pas
    // à retenter, et la file ne doit pas grossir sans fin.
    assert.equal(depot.tous()[0]?.etat, "abandonne");
    assert.equal(depot.tous()[0]?.tentatives, 3);
  });

  it("ne retente pas avant l'heure de la reprise", async () => {
    const { courrier, depot, horloge } = atelier(transportQuiRefuse("timeout"));

    await courrier.deposer(UN_MESSAGE);
    horloge.avancerDe(MINUTE);

    assert.equal(await courrier.vider(), null);
    assert.equal(depot.tous()[0]?.tentatives, 1);
  });

  /**
   * L'index (tâche, date prévue) de 018 fond les reprises d'un même vidage en
   * une seule échéance : le réveil ne se déclenche qu'une fois pour dix
   * messages en panne.
   */
  it("n'inscrit qu'une échéance pour plusieurs messages tombés ensemble", async () => {
    const { courrier, echeances } = atelier(transportQuiRefuse("réseau coupé"));

    await courrier.deposer(UN_MESSAGE);
    await courrier.deposer({ sujet: "Autre", html: "<p>autre</p>" });

    assert.equal(echeances.inscrites().length, 1);
  });

  /**
   * Deux dépôts qui se chevauchent : le second tombe pendant l'aller-retour
   * SMTP du premier, donc après que le vidage en vol a lu la file. Sans
   * l'attente du vidage en cours, il dormirait jusqu'au balayage quotidien — et
   * une alerte de panne retardée d'une journée vaut une alerte perdue.
   */
  it("ne laisse pas un dépôt concurrent dormir jusqu'au lendemain", async () => {
    const depot = depotEnMemoire();
    const recus: string[] = [];
    let debloquer = (): void => undefined;
    const premierEnvoi = new Promise<void>((resoudre) => {
      debloquer = resoudre;
    });
    let premier = true;

    const courrier = creerCourrier({
      depot,
      rapports: rapportsEnMemoire(),
      echeances: echeancesEnMemoire(),
      horloge: horlogeMobile(DEPART),
      transport: {
        destinataire: "contact@exemple.fr",
        envoyer: async (message) => {
          if (premier) {
            premier = false;
            await premierEnvoi;
          }
          recus.push(message.sujet);
        },
      },
    });

    const premierDepot = courrier.deposer(UN_MESSAGE);
    const secondDepot = courrier.deposer({ sujet: "Deuxième", html: "<p>deux</p>" });
    debloquer();
    await Promise.all([premierDepot, secondDepot]);

    assert.equal(depot.compterEnAttente(), 0);
    assert.deepEqual(recus, ["[Babo] Panne de scraping", "[Babo] Deuxième"]);
  });

  it("consigne un succès dès qu'un message part, et nomme celui qui n'est pas parti", async () => {
    const depot = depotEnMemoire();
    const rapports = rapportsEnMemoire();
    const horloge = horlogeMobile(DEPART);
    let premier = true;
    const courrier = creerCourrier({
      depot,
      rapports,
      echeances: echeancesEnMemoire(),
      horloge,
      transport: {
        destinataire: "contact@exemple.fr",
        envoyer: () => {
          const echoue = premier;
          premier = false;
          return echoue ? Promise.reject(new Error("boîte pleine")) : Promise.resolve();
        },
      },
    });

    depot.deposer({ sujet: "Un", html: "<p>un</p>" }, DEPART);
    depot.deposer({ sujet: "Deux", html: "<p>deux</p>" }, DEPART);
    const rapport = await courrier.vider();

    // Échec seulement si rien n'est parti, comme la passe de 028 : un vidage
    // qui remet un message sur deux a fait son travail.
    assert.equal(rapport?.issue, "succes");
    assert.equal(rapport?.tache, TACHE_COURRIER);
    assert.equal(rapport?.volumeExtrait, 1);
    assert.match(rapport?.detail ?? "", /1 remis sur 2/);
    assert.match(rapport?.detail ?? "", /boîte pleine/);
  });

  it("consigne un échec quand rien ne part", async () => {
    const { courrier, rapports } = atelier(transportQuiRefuse("535 refusé"));

    await courrier.deposer(UN_MESSAGE);

    assert.equal(rapports.tous()[0]?.issue, "echec");
    assert.equal(rapports.tous()[0]?.volumeExtrait, 0);
  });

  it("rend l'état que l'écran affiche", async () => {
    const { courrier } = atelier(transportQuiAccepte());

    await courrier.deposer(UN_MESSAGE);
    const etat = courrier.etat();

    assert.equal(etat.configure, true);
    assert.equal(etat.destinataire, "contact@exemple.fr");
    assert.equal(etat.enAttente, 0);
    assert.equal(etat.derniers.length, 1);
  });

  it("compose un mail de test qui porte ses deux versions", () => {
    const message = messageDeTest(DEPART);

    assert.match(message.html, /<p>/);
    assert.equal(typeof message.texte, "string");
  });
});
