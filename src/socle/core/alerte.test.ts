import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enAlertant, estUnePanne } from "./alerte.ts";
import type { Courrier, Message } from "./courrier.ts";
import { TACHE_COURRIER } from "./courrier.ts";
import type {
  DepotRapports,
  Issue,
  RapportArchive,
  RapportExecution,
} from "./rapport-execution.ts";

const DEPART = new Date(2026, 8, 4, 1, 0);
const TACHE = "acquisition:myffbad";

function depotEnMemoire(): DepotRapports {
  const rapports: RapportArchive[] = [];
  return {
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

function courrierEnMemoire(): Courrier & { readonly deposes: () => Message[] } {
  const deposes: Message[] = [];
  return {
    deposes: () => deposes,
    deposer: (message) => {
      deposes.push(message);
      return Promise.resolve({} as never);
    },
    vider: () => Promise.resolve(null),
    etat: () => ({ configure: true, destinataire: "moi@exemple.fr", enAttente: 0, derniers: [] }),
  };
}

function atelier() {
  const courrier = courrierEnMemoire();
  const rapports = enAlertant(depotEnMemoire(), { courrier, journal: () => undefined });
  return { courrier, rapports };
}

const rapport = (issue: Issue, tache = TACHE): RapportExecution => ({
  tache,
  demarreLe: DEPART,
  termineLe: DEPART,
  issue,
  volumeExtrait: issue === "succes" ? 24 : 0,
  detail: `détail ${issue}`,
});

/** Les promesses de dépôt sont lancées sans être attendues : on rend la main. */
const laisserPartir = () => new Promise((resoudre) => setImmediate(resoudre));

describe("l'alerte de panne", () => {
  it("tient `vide` pour une panne au même titre qu'`echec`", () => {
    assert.equal(estUnePanne("vide"), true);
    assert.equal(estUnePanne("echec"), true);
    assert.equal(estUnePanne("succes"), false);
    assert.equal(estUnePanne(undefined), false);
  });

  it("ne dit rien quand tout va bien", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner(rapport("succes"));
    rapports.consigner(rapport("succes"));
    await laisserPartir();

    assert.deepEqual(courrier.deposes(), []);
  });

  /**
   * Le succès vide est le mode de panne que 019 vise en premier : la page
   * répond, le parseur ne lève rien, et il n'extrait plus rien.
   */
  it("prévient sur une extraction vide, pas seulement sur une exception", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner(rapport("succes"));
    rapports.consigner(rapport("vide"));
    await laisserPartir();

    assert.equal(courrier.deposes().length, 1);
    assert.match(courrier.deposes()[0]?.sujet ?? "", /^Panne — acquisition:myffbad$/);
    assert.match(courrier.deposes()[0]?.texte ?? "", /extraction vide/);
  });

  it("prévient dès la première exécution si elle échoue", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner(rapport("echec"));
    await laisserPartir();

    assert.equal(courrier.deposes().length, 1);
  });

  /**
   * Un parseur aveugle le reste jusqu'à correction. Un mail quotidien identique
   * se filtre en trois jours, et une alerte qu'on filtre est pire qu'une alerte
   * absente : c'est le battement hebdomadaire qui rappelle ce qui traîne.
   */
  it("n'alerte qu'à l'entrée en panne, pas à chaque exécution", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner(rapport("echec"));
    rapports.consigner(rapport("echec"));
    rapports.consigner(rapport("vide"));
    await laisserPartir();

    assert.equal(courrier.deposes().length, 1);
  });

  it("annonce la sortie de panne, faute de quoi le silence resterait ambigu", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner(rapport("echec"));
    rapports.consigner(rapport("succes"));
    await laisserPartir();

    assert.deepEqual(
      courrier.deposes().map(({ sujet }) => sujet),
      ["Panne — acquisition:myffbad", "Réparé — acquisition:myffbad"],
    );
  });

  it("suit chaque tâche séparément", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner(rapport("succes", "acquisition:badnet"));
    rapports.consigner(rapport("echec", "acquisition:myffbad"));
    rapports.consigner(rapport("succes", "acquisition:badnet"));
    await laisserPartir();

    assert.deepEqual(
      courrier.deposes().map(({ sujet }) => sujet),
      ["Panne — acquisition:myffbad"],
    );
  });

  /**
   * 016 l'écrit : un échec d'envoi ne peut pas être signalé par mail. Sans
   * cette exclusion, un vidage en échec déposerait un message, dont le dépôt
   * consignerait un rapport, qui déposerait un message.
   */
  it("ne s'alerte jamais sur le courrier lui-même", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner(rapport("echec", TACHE_COURRIER));
    await laisserPartir();

    assert.deepEqual(courrier.deposes(), []);
  });

  it("consigne toujours, que le mail parte ou non", () => {
    const courrier = courrierEnMemoire();
    const rapports = enAlertant(depotEnMemoire(), {
      courrier: { ...courrier, deposer: () => Promise.reject(new Error("SMTP mort")) },
      journal: () => undefined,
    });

    const archive = rapports.consigner(rapport("echec"));

    // Le rapport est la trace, et elle ne dépend pas du courrier : c'est
    // précisément ce qui permet de lire l'historique quand le mail est cassé.
    assert.equal(archive.issue, "echec");
    assert.equal(rapports.dernierRapport(TACHE)?.id, archive.id);
  });

  it("échappe ce qu'une source distante a écrit dans le détail", async () => {
    const { courrier, rapports } = atelier();

    rapports.consigner({ ...rapport("echec"), detail: "<script>alert(1)</script>" });
    await laisserPartir();

    const html = courrier.deposes()[0]?.html ?? "";
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});
