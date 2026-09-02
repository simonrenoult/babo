import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  DepotEcheances,
  Echeance,
  EtatDEcheance,
  ReglageDeTache,
  TacheOrdonnancee,
} from "./ordonnancement.ts";
import { creerOrdonnanceur, prochaineOccurrence } from "./ordonnancement.ts";
import type { DepotRapports, Issue, RapportArchive, RapportExecution } from "./rapport-execution.ts";

/**
 * Toutes les dates sont construites en heure locale — `new Date(2026, 8, 4, 1)`
 * et non une chaîne ISO en `Z`. La cadence de 018 se lit sur une horloge
 * murale : « le vendredi à 1 h du matin » ne veut rien dire en UTC, et un test
 * écrit en UTC ne passerait que sur une machine réglée à Greenwich.
 */
const VENDREDI_1H = new Date(2026, 8, 4, 1, 0);
const MERCREDI_MIDI = new Date(2026, 8, 2, 12, 0);
const HEURE = 60 * 60_000;

function horlogeMobile(depart: Date) {
  let maintenant = depart;
  return {
    maintenant: () => maintenant,
    avancerDe: (millisecondes: number) => {
      maintenant = new Date(maintenant.getTime() + millisecondes);
    },
    aller: (quand: Date) => {
      maintenant = quand;
    },
  };
}

function reglagesEnMemoire() {
  const parTache = new Map<string, ReglageDeTache>();
  return {
    tous: () => [...parTache.values()],
    lire: (tache: string) => parTache.get(tache) ?? null,
    enregistrer: (reglage: ReglageDeTache) => void parTache.set(reglage.tache, reglage),
    poserSiAbsent: (reglage: ReglageDeTache) => {
      if (!parTache.has(reglage.tache)) parTache.set(reglage.tache, reglage);
    },
  };
}

/** Même sémantique que l'adaptateur SQLite, index d'unicité compris. */
function echeancesEnMemoire(): DepotEcheances & { lignes: Echeance[] } {
  const lignes: Echeance[] = [];
  const remplacer = (id: number, champs: Partial<Echeance>): void => {
    const indice = lignes.findIndex((ligne) => ligne.id === id);
    lignes[indice] = { ...lignes[indice]!, ...champs };
  };

  return {
    lignes,
    inscrire(tache, prevueLe) {
      const existante = lignes.find(
        (ligne) => ligne.tache === tache && ligne.prevueLe.getTime() === prevueLe.getTime(),
      );
      if (existante !== undefined) return existante;
      const echeance: Echeance = {
        id: lignes.length + 1,
        tache,
        prevueLe,
        tentatives: 0,
        prochaineTentativeLe: prevueLe,
        etat: "en-attente",
      };
      lignes.push(echeance);
      return echeance;
    },
    dues: (maintenant) =>
      lignes
        .filter(
          (ligne) =>
            ligne.etat === "en-attente" && ligne.prochaineTentativeLe.getTime() <= maintenant.getTime(),
        )
        .sort((a, b) => a.prevueLe.getTime() - b.prevueLe.getTime() || a.id - b.id),
    prochaine: (tache) =>
      lignes
        .filter((ligne) => ligne.tache === tache && ligne.etat === "en-attente")
        .sort((a, b) => a.prevueLe.getTime() - b.prevueLe.getTime())[0] ?? null,
    reporter: (id, tentatives, prochaineTentativeLe) =>
      remplacer(id, { tentatives, prochaineTentativeLe }),
    clore: (id, etat: Exclude<EtatDEcheance, "en-attente">) => remplacer(id, { etat }),
    annuler: (tache) => {
      let annulees = 0;
      for (const ligne of lignes.filter((l) => l.tache === tache && l.etat === "en-attente")) {
        remplacer(ligne.id, { etat: "abandonnee" });
        annulees += 1;
      }
      return annulees;
    },
  };
}

function rapportsEnMemoire(): DepotRapports & { consignes: RapportExecution[] } {
  const consignes: RapportExecution[] = [];
  return {
    consignes,
    consigner(rapport) {
      consignes.push(rapport);
      return { ...rapport, id: consignes.length };
    },
    dernierRapport: (tache) => {
      const pourLaTache = consignes.filter((rapport) => rapport.tache === tache);
      const dernier = pourLaTache[pourLaTache.length - 1];
      return dernier === undefined ? null : { ...dernier, id: consignes.indexOf(dernier) + 1 };
    },
    derniers: () => [],
  };
}

/** Une tâche dont on choisit l'issue à chaque passage, et qui compte ses appels. */
function tacheTemoin(
  tache: string,
  issues: readonly Issue[],
  reglageParDefaut: TacheOrdonnancee["reglageParDefaut"],
): TacheOrdonnancee & { appels: number } {
  let appels = 0;
  return {
    tache,
    intitule: tache,
    reglageParDefaut,
    get appels() {
      return appels;
    },
    executer: () => {
      const issue = issues[appels] ?? issues[issues.length - 1] ?? "succes";
      appels += 1;
      const rapport: RapportArchive = {
        id: appels,
        tache,
        demarreLe: new Date(),
        termineLe: new Date(),
        issue,
        volumeExtrait: issue === "succes" ? 24 : 0,
        detail: null,
      };
      return Promise.resolve(rapport);
    },
  };
}

const CLASSEMENT = {
  cadence: { nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 },
  graceMinutes: 48 * 60,
  active: true,
} as const;

function monter(taches: readonly TacheOrdonnancee[], depart: Date) {
  const horloge = horlogeMobile(depart);
  const reglages = reglagesEnMemoire();
  const echeances = echeancesEnMemoire();
  const rapports = rapportsEnMemoire();
  const ordonnanceur = creerOrdonnanceur({ taches, reglages, echeances, rapports, horloge });
  return { ordonnanceur, horloge, reglages, echeances, rapports };
}

describe("la prochaine occurrence", () => {
  it("tombe au prochain vendredi 1 h quand on est mercredi", () => {
    assert.deepEqual(
      prochaineOccurrence(CLASSEMENT.cadence, MERCREDI_MIDI),
      new Date(2026, 8, 4, 1, 0),
    );
  });

  it("reste sur le jour même tant que l'heure n'est pas passée", () => {
    assert.deepEqual(
      prochaineOccurrence(CLASSEMENT.cadence, new Date(2026, 8, 4, 0, 30)),
      VENDREDI_1H,
    );
  });

  it("passe à la semaine suivante à l'heure pile — jamais deux fois la même", () => {
    // Strictement après : sans ça, clore l'échéance du vendredi 1 h à 1 h 00
    // pile réinscrirait la même occurrence, et la passe tournerait en boucle.
    assert.deepEqual(prochaineOccurrence(CLASSEMENT.cadence, VENDREDI_1H), new Date(2026, 8, 11, 1, 0));
  });

  it("revient chaque jour pour une cadence quotidienne", () => {
    const cadence = { nature: "quotidienne", heure: 6, minute: 15 } as const;
    assert.deepEqual(prochaineOccurrence(cadence, new Date(2026, 8, 2, 7, 0)), new Date(2026, 8, 3, 6, 15));
    assert.deepEqual(prochaineOccurrence(cadence, new Date(2026, 8, 2, 5, 0)), new Date(2026, 8, 2, 6, 15));
  });

  it("n'en a pas pour une cadence ponctuelle : c'est l'appelant qui inscrit (014)", () => {
    assert.equal(prochaineOccurrence({ nature: "ponctuelle" }, MERCREDI_MIDI), null);
  });
});

describe("l'ordonnanceur", () => {
  it("pose les réglages par défaut et inscrit la prochaine occurrence", () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, echeances, reglages } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();

    assert.equal(reglages.lire("acquisition:myffbad")?.graceMinutes, 2880);
    assert.deepEqual(echeances.prochaine("acquisition:myffbad")?.prevueLe, VENDREDI_1H);
  });

  it("amorcé deux fois, n'inscrit qu'une échéance", () => {
    // Le mode de panne que 018 refuse : un redémarrage qui renvoie un rappel.
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, echeances } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    ordonnanceur.amorcer();

    assert.equal(echeances.lignes.length, 1);
  });

  it("ne réécrit pas un réglage modifié depuis l'écran", () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, reglages } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    ordonnanceur.regler({
      tache: "acquisition:myffbad",
      cadence: { nature: "quotidienne", heure: 3, minute: 0 },
      graceMinutes: 60,
      active: true,
    });
    ordonnanceur.amorcer();

    assert.deepEqual(reglages.lire("acquisition:myffbad")?.cadence, {
      nature: "quotidienne",
      heure: 3,
      minute: 0,
    });
  });

  it("n'exécute rien tant que l'heure n'est pas venue", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    assert.deepEqual(await ordonnanceur.reveiller(), []);
    assert.equal(tache.appels, 0);
  });

  it("exécute à l'heure dite, puis replanifie la semaine suivante", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, horloge, echeances } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(VENDREDI_1H);
    const passages = await ordonnanceur.reveiller();

    assert.equal(tache.appels, 1);
    assert.equal(passages[0]?.verdict, "executee");
    assert.deepEqual(echeances.prochaine("acquisition:myffbad")?.prevueLe, new Date(2026, 8, 11, 1, 0));
  });

  it("ne rejoue pas ce qui a déjà tourné, même après un redémarrage", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, horloge } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(VENDREDI_1H);
    await ordonnanceur.reveiller();

    // Le redémarrage, c'est exactement ça : on réamorce sur la même base.
    ordonnanceur.amorcer();
    horloge.avancerDe(5 * 60_000);
    await ordonnanceur.reveiller();

    assert.equal(tache.appels, 1, "la passe du vendredi 1 h a eu lieu une fois et une seule");
  });
});

describe("le rattrapage après un arrêt", () => {
  it("rejoue une échéance dépassée qui tient encore dans sa fenêtre", async () => {
    // Arrêt du vendredi soir, redémarrage le dimanche : la donnée est périmée,
    // pas fausse — attendre la passe suivante coûterait une semaine.
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, horloge } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(new Date(2026, 8, 5, 12, 0));
    const passages = await ordonnanceur.reveiller();

    assert.equal(tache.appels, 1);
    assert.equal(passages[0]?.verdict, "executee");
  });

  it("abandonne, sans l'exécuter, une échéance hors fenêtre — et le consigne", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, horloge, rapports, echeances } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(new Date(2026, 8, 8, 12, 0)); // mardi : plus de 48 h de retard
    const passages = await ordonnanceur.reveiller();

    assert.equal(tache.appels, 0, "un rappel J-1 envoyé à J+2 est pire qu'un rappel manquant");
    assert.equal(passages[0]?.verdict, "abandonnee");
    assert.equal(rapports.consignes[0]?.issue, "echec");
    assert.match(rapports.consignes[0]?.detail ?? "", /abandonnée sans être exécutée/);
    // La récurrence continue : une occurrence manquée ne tue pas la tâche.
    assert.deepEqual(echeances.prochaine("acquisition:myffbad")?.prevueLe, new Date(2026, 8, 11, 1, 0));
  });

  it("prend une grâce nulle au pied de la lettre : le battement de 019 ne se rattrape pas", async () => {
    const battement = tacheTemoin("battement", ["succes"], {
      cadence: { nature: "hebdomadaire", jour: 1, heure: 9, minute: 0 },
      graceMinutes: 0,
      active: true,
    });
    const { ordonnanceur, horloge } = monter([battement], new Date(2026, 8, 6, 12, 0));

    ordonnanceur.amorcer();
    horloge.aller(new Date(2026, 8, 7, 10, 0)); // une heure de retard
    const passages = await ordonnanceur.reveiller();

    assert.equal(battement.appels, 0, "rattrapé, il attesterait d'une santé qu'il n'a pas constatée");
    assert.equal(passages[0]?.verdict, "abandonnee");
  });

  it("tolère malgré tout un battement de retard : une grâce nulle n'est pas une impossibilité", async () => {
    const battement = tacheTemoin("battement", ["succes"], {
      cadence: { nature: "hebdomadaire", jour: 1, heure: 9, minute: 0 },
      graceMinutes: 0,
      active: true,
    });
    const { ordonnanceur, horloge } = monter([battement], new Date(2026, 8, 6, 12, 0));

    ordonnanceur.amorcer();
    horloge.aller(new Date(2026, 8, 7, 9, 0, 30));
    await ordonnanceur.reveiller();

    assert.equal(battement.appels, 1, "le planificateur ne se réveille qu'à la minute");
  });
});

describe("le réessai", () => {
  it("rejoue un échec à une heure, puis à quatre, puis abandonne", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["echec", "echec", "echec"], CLASSEMENT);
    const { ordonnanceur, horloge, echeances } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(VENDREDI_1H);

    assert.equal((await ordonnanceur.reveiller())[0]?.verdict, "reportee");
    assert.equal(tache.appels, 1);
    assert.deepEqual(
      echeances.prochaine("acquisition:myffbad")?.prochaineTentativeLe,
      new Date(VENDREDI_1H.getTime() + HEURE),
    );

    // Une minute avant l'heure du réessai : rien ne bouge.
    horloge.avancerDe(HEURE - 60_000);
    assert.deepEqual(await ordonnanceur.reveiller(), []);
    assert.equal(tache.appels, 1);

    horloge.avancerDe(60_000);
    assert.equal((await ordonnanceur.reveiller())[0]?.verdict, "reportee");
    assert.equal(tache.appels, 2);

    horloge.avancerDe(4 * HEURE);
    assert.equal((await ordonnanceur.reveiller())[0]?.verdict, "executee");
    assert.equal(tache.appels, 3, "trois tentatives, pas une de plus : un scraper qui boucle vaut un ban");

    // Épuisée, elle laisse la place à l'occurrence suivante.
    assert.deepEqual(echeances.prochaine("acquisition:myffbad")?.prevueLe, new Date(2026, 8, 11, 1, 0));
    horloge.avancerDe(24 * HEURE);
    assert.deepEqual(await ordonnanceur.reveiller(), []);
    assert.equal(tache.appels, 3);
  });

  it("s'arrête au premier succès", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["echec", "succes"], CLASSEMENT);
    const { ordonnanceur, horloge } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(VENDREDI_1H);
    await ordonnanceur.reveiller();
    horloge.avancerDe(HEURE);
    await ordonnanceur.reveiller();
    horloge.avancerDe(4 * HEURE);
    await ordonnanceur.reveiller();

    assert.equal(tache.appels, 2);
  });

  it("ne rejoue pas un succès vide : ce n'est pas une panne passagère (019)", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["vide"], CLASSEMENT);
    const { ordonnanceur, horloge } = monter([tache], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(VENDREDI_1H);
    assert.equal((await ordonnanceur.reveiller())[0]?.verdict, "executee");

    horloge.avancerDe(HEURE);
    await ordonnanceur.reveiller();
    assert.equal(tache.appels, 1, "une classe CSS qui a changé ne se répare pas en réessayant");
  });

  it("consigne l'exception d'une tâche qui lève, et la traite comme un échec", async () => {
    const quiLeve: TacheOrdonnancee = {
      tache: "acquisition:myffbad",
      intitule: "tâche qui lève",
      reglageParDefaut: CLASSEMENT,
      executer: () => Promise.reject(new Error("le réseau est tombé")),
    };
    const { ordonnanceur, horloge, rapports } = monter([quiLeve], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(VENDREDI_1H);
    const passages = await ordonnanceur.reveiller();

    assert.equal(passages[0]?.verdict, "reportee");
    assert.equal(rapports.consignes[0]?.issue, "echec");
    assert.match(rapports.consignes[0]?.detail ?? "", /le réseau est tombé/);
  });
});

describe("les tâches entre elles", () => {
  it("une source en panne n'empêche pas l'autre de tourner", async () => {
    // La contrainte de 018 : « un scraping myffbad en échec, par exemple faute
    // de session valide, n'empêche pas l'indexation badnet ».
    const quotidienne = {
      cadence: { nature: "quotidienne", heure: 1, minute: 0 },
      graceMinutes: 12 * 60,
      active: true,
    } as const;
    const myffbad: TacheOrdonnancee = {
      tache: "acquisition:myffbad",
      intitule: "myffbad",
      reglageParDefaut: quotidienne,
      executer: () => Promise.reject(new Error("session morte")),
    };
    const badnet = tacheTemoin("acquisition:badnet", ["succes"], quotidienne);
    const { ordonnanceur, horloge } = monter([myffbad, badnet], MERCREDI_MIDI);

    ordonnanceur.amorcer();
    horloge.aller(new Date(2026, 8, 3, 1, 0));
    const passages = await ordonnanceur.reveiller();

    assert.equal(passages.length, 2);
    assert.equal(badnet.appels, 1);
  });

  it("ferme une échéance dont la tâche n'est plus branchée", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, horloge, echeances, rapports } = monter([tache], MERCREDI_MIDI);
    ordonnanceur.amorcer();

    // La tâche disparaît du code, l'échéance reste en base.
    const debranche = creerOrdonnanceur({
      taches: [],
      reglages: reglagesEnMemoire(),
      echeances,
      rapports,
      horloge,
    });
    horloge.aller(VENDREDI_1H);
    const passages = await debranche.reveiller();

    assert.equal(passages[0]?.verdict, "inconnue");
    assert.equal(echeances.lignes[0]?.etat, "abandonnee");
    // Et elle ne revient pas au réveil suivant.
    horloge.avancerDe(HEURE);
    assert.deepEqual(await debranche.reveiller(), []);
  });

  it("replanifie quand on change la cadence depuis l'écran", () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, echeances } = monter([tache], MERCREDI_MIDI);
    ordonnanceur.amorcer();

    ordonnanceur.regler({
      tache: "acquisition:myffbad",
      cadence: { nature: "hebdomadaire", jour: 6, heure: 3, minute: 0 },
      graceMinutes: 60,
      active: true,
    });

    assert.deepEqual(echeances.prochaine("acquisition:myffbad")?.prevueLe, new Date(2026, 8, 5, 3, 0));
    assert.equal(echeances.lignes[0]?.etat, "abandonnee", "l'ancienne échéance ne survit pas");
  });

  it("n'inscrit plus rien pour une tâche suspendue", () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, echeances } = monter([tache], MERCREDI_MIDI);
    ordonnanceur.amorcer();

    ordonnanceur.regler({ tache: "acquisition:myffbad", ...CLASSEMENT, active: false });

    assert.equal(echeances.prochaine("acquisition:myffbad"), null);
  });

  it("rend l'état que l'écran affiche : cadence, prochaine échéance, dernier rapport", async () => {
    const tache = tacheTemoin("acquisition:myffbad", ["succes"], CLASSEMENT);
    const { ordonnanceur, horloge } = monter([tache], MERCREDI_MIDI);
    ordonnanceur.amorcer();
    horloge.aller(VENDREDI_1H);
    await ordonnanceur.reveiller();

    const [etat] = ordonnanceur.etat();
    assert.equal(etat?.reglage.graceMinutes, 2880);
    assert.deepEqual(etat?.prochaine?.prevueLe, new Date(2026, 8, 11, 1, 0));
    assert.equal(etat?.dernierRapport, null, "la passe consigne elle-même, la doublure ne le fait pas");
  });
});
