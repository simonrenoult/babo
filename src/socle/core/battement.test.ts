import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TACHE_BATTEMENT, battreLeCoeur, composerLeBattement } from "./battement.ts";
import type { Courrier, Message } from "./courrier.ts";
import type {
  DepotRapports,
  Issue,
  RapportArchive,
  RapportExecution,
} from "./rapport-execution.ts";

const LUNDI_8H = new Date(2026, 8, 7, 8, 0);
const JOUR = 24 * 60 * 60_000;

const TACHES = [
  { tache: "acquisition:myffbad", intitule: "Relever noms et classements (myffbad)" },
  { tache: "acquisition:badnet", intitule: "Indexer les tournois (badnet)" },
];

function depotEnMemoire(): DepotRapports & { readonly poser: (rapport: RapportExecution) => void } {
  const rapports: RapportArchive[] = [];
  return {
    poser: (rapport) => void rapports.push({ ...rapport, id: rapports.length + 1 }),
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

const rapport = (
  tache: string,
  issue: Issue,
  ilYAJours: number,
  volumeExtrait = 10,
): RapportExecution => {
  const quand = new Date(LUNDI_8H.getTime() - ilYAJours * JOUR);
  return { tache, demarreLe: quand, termineLe: quand, issue, volumeExtrait, detail: null };
};

function battement(rapports: DepotRapports) {
  return composerLeBattement({
    taches: TACHES,
    rapports,
    tailleDeLaBase: 12 * 1024 * 1024,
    captures: 431,
    maintenant: LUNDI_8H,
  });
}

describe("le battement hebdomadaire", () => {
  it("compte les exécutions de la semaine, et pas celles d'avant", () => {
    const depot = depotEnMemoire();
    depot.poser(rapport("acquisition:myffbad", "succes", 2));
    depot.poser(rapport("acquisition:myffbad", "succes", 9));

    const resultat = battement(depot);

    assert.equal(resultat.executions, 1);
    assert.equal(resultat.lignes[0]?.executions, 1);
  });

  it("nomme une tâche qui n'a jamais tourné, plutôt que de la taire", () => {
    const depot = depotEnMemoire();
    depot.poser(rapport("acquisition:myffbad", "succes", 1));

    const resultat = battement(depot);

    // Une tâche absente du rapport est une tâche dont on ne saura jamais
    // qu'elle s'est tue.
    const badnet = resultat.lignes.find(({ tache }) => tache === "acquisition:badnet");
    assert.equal(badnet?.executions, 0);
    assert.equal(badnet?.derniereReussite, null);
  });

  it("additionne les volumes extraits de la semaine", () => {
    const depot = depotEnMemoire();
    depot.poser(rapport("acquisition:myffbad", "succes", 1, 8));
    depot.poser(rapport("acquisition:myffbad", "succes", 3, 16));

    assert.equal(battement(depot).lignes[0]?.volumeExtrait, 24);
  });

  /**
   * Le trou que l'alerte laisse — elle ne prévient qu'à l'entrée en panne — est
   * fermé ici : ce qui est encore cassé est rappelé chaque semaine.
   */
  it("rappelle les pannes encore ouvertes", () => {
    const depot = depotEnMemoire();
    depot.poser(rapport("acquisition:myffbad", "vide", 3));
    depot.poser(rapport("acquisition:badnet", "succes", 1));

    const resultat = battement(depot);

    assert.equal(resultat.pannesOuvertes, 1);
    assert.deepEqual(
      resultat.lignes.find(({ tache }) => tache === "acquisition:myffbad")?.enPanneDepuis,
      new Date(LUNDI_8H.getTime() - 3 * JOUR),
    );
    assert.equal(
      resultat.lignes.find(({ tache }) => tache === "acquisition:badnet")?.enPanneDepuis,
      null,
    );
  });

  /**
   * Une passe qui échoue depuis trois semaines a tourné hier et ne rapporte
   * pourtant rien de neuf : la date qui compte est celle de la donnée.
   */
  it("date la dernière donnée, pas le dernier réveil", () => {
    const depot = depotEnMemoire();
    depot.poser(rapport("acquisition:myffbad", "succes", 20));
    depot.poser(rapport("acquisition:myffbad", "echec", 1));

    const ligne = battement(depot).lignes[0];

    assert.deepEqual(ligne?.derniereReussite, new Date(LUNDI_8H.getTime() - 20 * JOUR));
    assert.deepEqual(ligne?.enPanneDepuis, new Date(LUNDI_8H.getTime() - 1 * JOUR));
  });

  it("porte la taille de la base et le nombre de captures", () => {
    const resultat = battement(depotEnMemoire());

    assert.equal(resultat.tailleDeLaBase, 12 * 1024 * 1024);
    assert.equal(resultat.captures, 431);
  });
});

describe("la tâche du battement", () => {
  function executer(depot: ReturnType<typeof depotEnMemoire>) {
    const courrier = courrierEnMemoire();
    return battreLeCoeur({
      taches: TACHES,
      rapports: depot,
      courrier,
      horloge: { maintenant: () => LUNDI_8H },
      tailleDeLaBase: () => 3_000_000,
      captures: () => 12,
    }).then((archive) => ({ archive, courrier }));
  }

  it("dépose son message et laisse sa propre trace", async () => {
    const { archive, courrier } = await executer(depotEnMemoire());

    assert.equal(archive.tache, TACHE_BATTEMENT);
    // Une exécution automatique comme une autre : 019 demande que toutes
    // laissent un rapport, celle-ci comprise.
    assert.equal(archive.issue, "succes");
    assert.equal(courrier.deposes().length, 1);
  });

  it("annonce le nombre de pannes dans le sujet, lisible sans ouvrir", async () => {
    const calme = depotEnMemoire();
    assert.match((await executer(calme)).courrier.deposes()[0]?.sujet ?? "", /tout va bien/);

    const casse = depotEnMemoire();
    casse.poser(rapport("acquisition:myffbad", "echec", 1));
    casse.poser(rapport("acquisition:badnet", "vide", 1));
    assert.match(
      (await executer(casse)).courrier.deposes()[0]?.sujet ?? "",
      /2 pannes ouvertes/,
    );
  });

  /**
   * Qu'il annonce des pannes ne le met pas lui-même en panne : un `echec` ici
   * ferait partir une alerte pour dire qu'on a bien alerté.
   */
  it("reste un succès même quand il n'annonce que des pannes", async () => {
    const depot = depotEnMemoire();
    depot.poser(rapport("acquisition:myffbad", "echec", 1));

    const { archive } = await executer(depot);

    assert.equal(archive.issue, "succes");
    assert.match(archive.detail ?? "", /1 panne\(s\) ouverte\(s\)/);
  });

  it("porte les deux versions du message", async () => {
    const { courrier } = await executer(depotEnMemoire());
    const message = courrier.deposes()[0];

    assert.match(message?.html ?? "", /<table>/);
    assert.match(message?.texte ?? "", /Base : 2\.9 Mo/);
    // La phrase qui explique pourquoi ce mail existe voyage avec lui : c'est
    // son absence qui informe, et personne ne s'en souvient six mois plus tard.
    assert.match(message?.texte ?? "", /S'il manque, c'est le planificateur/);
  });
});
