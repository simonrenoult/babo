import type { Horloge } from "./horloge.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";

/**
 * Le planificateur — spec 018.
 *
 * Un seul, pour les deux natures de tâches que la spec distingue : les passes
 * **périodiques** à jour et heure fixes (les acquisitions de 015, la passe de
 * classement de 001, le battement de 019) et les **échéances ponctuelles**
 * calculées au fil de l'eau (les rappels J-7 / J-1 de 014). Une seule
 * mécanique, parce que les deux posent la même question — qu'est-ce qui est dû,
 * et qu'est-ce qui a déjà été fait — et que la réponse doit survivre à un
 * redémarrage dans les deux cas.
 *
 * Il vit dans le processus, pas dans un cron système : les fréquences sont des
 * données, donc modifiables sans redéploiement, et une échéance calculée par
 * tournoi n'a pas de ligne de crontab.
 *
 * Il ne connaît aucune tâche : `main.ts` les lui donne. C'est ce qui évite de
 * loger le planificateur chez un appelant — le défaut déjà corrigé deux fois
 * dans le backlog (022).
 */

/** Lundi = 1, dimanche = 7 — la numérotation ISO, pas celle de `Date.getDay`. */
export type JourDeLaSemaine = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const JOURS: Record<JourDeLaSemaine, string> = {
  1: "lundi",
  2: "mardi",
  3: "mercredi",
  4: "jeudi",
  5: "vendredi",
  6: "samedi",
  7: "dimanche",
};

/**
 * Quand une tâche est due.
 *
 * L'heure est locale, celle du serveur : « le vendredi à 1 h du matin » se lit
 * sur une horloge murale, et une passe qui glisserait d'une heure deux fois par
 * an ne poserait de problème à personne — sauf à qui la lit.
 */
export type Cadence =
  | { readonly nature: "quotidienne"; readonly heure: number; readonly minute: number }
  | {
      readonly nature: "hebdomadaire";
      readonly jour: JourDeLaSemaine;
      readonly heure: number;
      readonly minute: number;
    }
  /** Sans récurrence : les échéances sont inscrites par l'appelant (014). */
  | { readonly nature: "ponctuelle" };

/**
 * Le réglage d'une tâche, en base et modifiable — spec 018.
 *
 * Fréquence *et* délai de grâce : les deux sont des données pour la même
 * raison, il faut pouvoir les corriger sans redéployer.
 */
export type ReglageDeTache = {
  readonly tache: string;
  readonly cadence: Cadence;
  /**
   * Retard au-delà duquel une échéance dépassée n'est plus rejouée mais
   * abandonnée. C'est ce qui distingue une passe périmée qu'on rafraîchit
   * volontiers d'un rappel J-1 envoyé à J+2, que la spec juge pire que rien.
   */
  readonly graceMinutes: number;
  readonly active: boolean;
};

export const ETATS_DECHEANCE = ["en-attente", "faite", "abandonnee"] as const;

/**
 * `faite` dit qu'elle a été exécutée, pas qu'elle a réussi : l'issue est dans
 * le rapport (019). Une échéance qui a épuisé ses trois tentatives est `faite`
 * — elle a bien tourné trois fois. `abandonnee` est réservé à ce qui n'a
 * jamais tourné : hors fenêtre de grâce, ou annulé.
 */
export type EtatDEcheance = (typeof ETATS_DECHEANCE)[number];

export type Echeance = {
  readonly id: number;
  readonly tache: string;
  readonly prevueLe: Date;
  /** Tentatives déjà consommées. Zéro tant que rien n'a tourné. */
  readonly tentatives: number;
  /** Quand rejouer. Égale `prevueLe` avant la première tentative. */
  readonly prochaineTentativeLe: Date;
  readonly etat: EtatDEcheance;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotReglages = {
  tous(): readonly ReglageDeTache[];
  lire(tache: string): ReglageDeTache | null;
  enregistrer(reglage: ReglageDeTache): void;
  /**
   * Pose le réglage seulement s'il n'existe pas encore. Les valeurs de départ
   * sont des valeurs de départ : elles ne réécrasent pas ce que quelqu'un a
   * modifié depuis l'écran.
   */
  poserSiAbsent(reglage: ReglageDeTache): void;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotEcheances = {
  /**
   * Inscrit l'échéance, ou rend celle qui existe déjà. **Idempotent sur
   * (tâche, date prévue)** : c'est cette clé, et elle seule, qui tient la
   * promesse « un redémarrage ne doit ni perdre un rappel, ni le renvoyer ».
   */
  inscrire(tache: string, prevueLe: Date, maintenant: Date): Echeance;
  /** Les échéances en attente dont l'heure de tentative est passée. */
  dues(maintenant: Date): readonly Echeance[];
  /** La prochaine échéance en attente d'une tâche — ce que l'écran affiche. */
  prochaine(tache: string): Echeance | null;
  reporter(id: number, tentatives: number, prochaineTentativeLe: Date): void;
  clore(id: number, etat: Exclude<EtatDEcheance, "en-attente">, quand: Date): void;
  /** Retire ce qui n'a pas encore tourné : un tournoi qu'on cesse de suivre (014), une cadence changée. */
  annuler(tache: string, quand: Date): number;
};

/**
 * Une tâche telle que `main.ts` la déclare.
 *
 * L'identifiant est celui sous lequel la tâche consigne son rapport (019) :
 * c'est ce qui permet à l'écran de mettre la prochaine échéance en regard de la
 * dernière exécution, sans table de correspondance.
 */
export type TacheOrdonnancee = {
  readonly tache: string;
  readonly intitule: string;
  /** Posé au premier démarrage, puis jamais réécrit : l'écran a la main ensuite. */
  readonly reglageParDefaut: Omit<ReglageDeTache, "tache">;
  /**
   * L'exécution. Elle consigne son propre rapport — c'est ce que 019 demande
   * d'une passe — et le rend. Si elle lève, l'ordonnanceur consigne l'échec à
   * sa place : un planificateur n'a personne à qui remonter une exception.
   *
   * `null` quand il n'y avait rien à faire, et rien n'est alors consigné. Une
   * tâche qui balaie une file (le courrier de 016) tournerait sinon à vide
   * chaque jour et noierait l'historique que 019 doit rendre lisible. Une passe
   * d'acquisition, elle, a toujours quelque chose à dire.
   */
  executer(): Promise<RapportArchive | null>;
};

/** Trois tentatives par échéance, pas une de plus : un scraper qui boucle vaut un compte banni (015). */
export const PLAFOND_DE_TENTATIVES = 3;

/** Une heure, puis quatre. Assez pour passer un incident réseau, pas assez pour marteler. */
export const DELAIS_DE_REESSAI = [60 * 60_000, 4 * 60 * 60_000] as const;

/** Le planificateur se réveille toutes les minutes : c'est sa précision. */
export const BATTEMENT = 60_000;

/**
 * La prochaine occurrence d'une cadence, strictement après `apres`.
 *
 * `null` pour une cadence ponctuelle : elle n'a pas de « prochaine », ses
 * échéances sont inscrites une par une par l'appelant (014).
 */
export function prochaineOccurrence(cadence: Cadence, apres: Date): Date | null {
  if (cadence.nature === "ponctuelle") return null;

  const candidat = new Date(
    apres.getFullYear(),
    apres.getMonth(),
    apres.getDate(),
    cadence.heure,
    cadence.minute,
    0,
    0,
  );

  if (cadence.nature === "hebdomadaire") {
    // `getDay` rend 0 pour dimanche ; la cadence, elle, est en numérotation ISO.
    const jourDuCandidat = candidat.getDay() === 0 ? 7 : candidat.getDay();
    candidat.setDate(candidat.getDate() + ((cadence.jour - jourDuCandidat + 7) % 7));
  }

  if (candidat.getTime() > apres.getTime()) return candidat;

  // Passé pour aujourd'hui : au tour suivant. `setDate` garde l'heure murale,
  // donc un changement d'heure ne décale pas la passe du lendemain.
  candidat.setDate(candidat.getDate() + (cadence.nature === "hebdomadaire" ? 7 : 1));
  return candidat;
}

/**
 * Une échéance dépassée tient-elle encore dans sa fenêtre de grâce ?
 *
 * La tolérance ne descend jamais sous un battement : le planificateur ne se
 * réveille qu'à la minute, et une grâce nulle voudrait sinon dire « jamais
 * exécutable ». Zéro veut donc dire « à l'heure dite », pas « impossible » —
 * c'est ce qu'attend le battement hebdomadaire de 019, qui mentirait s'il était
 * rattrapé une heure plus tard.
 */
export function estDansLaFenetre(
  echeance: Echeance,
  graceMinutes: number,
  maintenant: Date,
): boolean {
  const retard = maintenant.getTime() - echeance.prevueLe.getTime();
  return retard <= Math.max(graceMinutes * 60_000, BATTEMENT);
}

/** Le délai avant la tentative suivante, ou `null` quand le plafond est atteint. */
export function delaiDeReessai(tentativesConsommees: number): number | null {
  return DELAIS_DE_REESSAI[tentativesConsommees - 1] ?? null;
}

export type Verdict = "executee" | "reportee" | "abandonnee" | "inconnue";

export type Passage = {
  readonly tache: string;
  readonly prevueLe: Date;
  readonly verdict: Verdict;
  /** Le rapport de l'exécution, quand elle a eu lieu. */
  readonly rapport: RapportArchive | null;
};

export type EtatDeLaTache = {
  readonly tache: string;
  readonly intitule: string;
  readonly reglage: ReglageDeTache;
  readonly prochaine: Echeance | null;
  readonly dernierRapport: RapportArchive | null;
};

export type Ordonnanceur = {
  /** Pose les réglages manquants et inscrit la prochaine occurrence de chaque tâche active. */
  amorcer(): void;
  /** Exécute tout ce qui est dû. Ne lève jamais : une tâche en panne devient un rapport. */
  reveiller(): Promise<readonly Passage[]>;
  /**
   * Déclenche une tâche à la main — spec 037.
   *
   * Joue la passe comme un réveil l'aurait faite, grâce court-circuitée :
   * l'échéance est clôturée à `faite`, la suivante inscrite et le rapport
   * consigné sous l'identifiant de la tâche. Coup unique, sans réessai.
   *
   * Refuse (en levant) une tâche inconnue, suspendue ou ponctuelle.
   */
  executerMaintenant(tache: string): Promise<Passage>;
  demarrer(): void;
  arreter(): void;
  etat(): readonly EtatDeLaTache[];
  /** Réenregistre un réglage et replanifie ce qui n'a pas encore tourné. */
  regler(reglage: ReglageDeTache): void;
};

export function creerOrdonnanceur(options: {
  readonly taches: readonly TacheOrdonnancee[];
  readonly reglages: DepotReglages;
  readonly echeances: DepotEcheances;
  readonly rapports: DepotRapports;
  readonly horloge: Horloge;
  /** Injectée pour les tests : le battement réel est un `setInterval`. */
  readonly battement?: number;
}): Ordonnanceur {
  const { taches, reglages, echeances, rapports, horloge } = options;
  const battement = options.battement ?? BATTEMENT;
  const parNom = new Map(taches.map((tache) => [tache.tache, tache]));

  let minuterie: ReturnType<typeof setInterval> | null = null;
  // Un réveil à la fois. Une passe qui dure plus d'une minute ne doit pas se
  // superposer à elle-même : deux exécutions concurrentes de la même passe
  // doubleraient les requêtes sur un compte dont le bannissement est un risque
  // assumé (015). Le même verrou protège le déclenchement à la main (037).
  let enCours = false;
  // Résolue quand la passe en cours se termine ; `null` quand rien ne tourne.
  // C'est ce qui permet à `executerMaintenant` d'attendre silencieusement
  // qu'une passe — réveil ou déclenchement — finisse avant la sienne : un clic
  // pendant une passe ne la double pas, il s'enchaîne (037, 015).
  let finDeLaPasse: Promise<void> | null = null;
  let marquerLaFin: (() => void) | null = null;

  const commencerUnePasse = (): void => {
    enCours = true;
    finDeLaPasse = new Promise<void>((resoudre) => {
      marquerLaFin = () => {
        enCours = false;
        finDeLaPasse = null;
        resoudre();
      };
    });
  };

  const finirLaPasse = (): void => {
    marquerLaFin?.();
    marquerLaFin = null;
  };

  /** Joue l'exécution d'une tâche, et la consigne en échec si elle lève (018). */
  const jouer = async (tache: TacheOrdonnancee, demarreLe: Date): Promise<RapportArchive | null> => {
    try {
      return await tache.executer();
    } catch (erreur) {
      // Une passe bien écrite ne lève pas (elle consigne). Celle qui lève quand
      // même ne doit pas emporter le planificateur avec elle, ni les autres
      // tâches du même réveil : les sources sont ordonnancées séparément.
      return consigner(
        tache.tache,
        demarreLe,
        `exception non rattrapée : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      );
    }
  };

  const reglageDe = (tache: TacheOrdonnancee): ReglageDeTache =>
    reglages.lire(tache.tache) ?? { tache: tache.tache, ...tache.reglageParDefaut };

  const planifier = (tache: TacheOrdonnancee, apres: Date): void => {
    const reglage = reglageDe(tache);
    if (!reglage.active) return;
    const prochaine = prochaineOccurrence(reglage.cadence, apres);
    if (prochaine !== null) echeances.inscrire(tache.tache, prochaine, horloge.maintenant());
  };

  const consigner = (tache: string, demarreLe: Date, detail: string): RapportArchive =>
    rapports.consigner({
      tache,
      demarreLe,
      termineLe: horloge.maintenant(),
      issue: "echec",
      volumeExtrait: null,
      detail,
    });

  const executer = async (echeance: Echeance, tache: TacheOrdonnancee): Promise<Passage> => {
    const demarreLe = horloge.maintenant();
    const rapport = await jouer(tache, demarreLe);

    const tentatives = echeance.tentatives + 1;

    // Réessai sur `echec` seulement. Un `vide` est un échec au sens de 019 —
    // la page a répondu, le parseur n'a rien tiré —, mais ce n'est pas une
    // panne passagère : rejouer trois fois ne réparerait pas une classe CSS
    // qui a changé, et consommerait le plafond de 015 pour rien. Le rapport le
    // dit, c'est à 019 d'en faire un mail.
    //
    // Une tâche qui n'a rien eu à faire (`null`) n'est pas non plus rejouée :
    // il n'y avait rien à rattraper.
    const delai = rapport?.issue === "echec" ? delaiDeReessai(tentatives) : null;

    if (delai === null) {
      echeances.clore(echeance.id, "faite", horloge.maintenant());
      planifier(tache, horloge.maintenant());
      return { tache: echeance.tache, prevueLe: echeance.prevueLe, verdict: "executee", rapport };
    }

    echeances.reporter(echeance.id, tentatives, new Date(horloge.maintenant().getTime() + delai));
    return { tache: echeance.tache, prevueLe: echeance.prevueLe, verdict: "reportee", rapport };
  };

  const passer = async (echeance: Echeance): Promise<Passage> => {
    const tache = parNom.get(echeance.tache);

    if (tache === undefined) {
      // Une échéance dont la tâche n'est plus branchée : le code a changé, la
      // base non. On la ferme, en le disant, plutôt que de la voir revenir à
      // chaque réveil jusqu'à la fin des temps.
      echeances.clore(echeance.id, "abandonnee", horloge.maintenant());
      const rapport = consigner(
        echeance.tache,
        echeance.prevueLe,
        "échéance sans tâche branchée : abandonnée.",
      );
      return { tache: echeance.tache, prevueLe: echeance.prevueLe, verdict: "inconnue", rapport };
    }

    const reglage = reglageDe(tache);
    if (!estDansLaFenetre(echeance, reglage.graceMinutes, horloge.maintenant())) {
      echeances.clore(echeance.id, "abandonnee", horloge.maintenant());
      const rapport = consigner(
        echeance.tache,
        echeance.prevueLe,
        `échéance dépassée de plus de ${reglage.graceMinutes} min : abandonnée sans être exécutée.`,
      );
      // Et on repart sur la suivante : une occurrence manquée n'arrête pas la
      // récurrence, sinon un arrêt d'un week-end tuerait la passe pour de bon.
      planifier(tache, horloge.maintenant());
      return { tache: echeance.tache, prevueLe: echeance.prevueLe, verdict: "abandonnee", rapport };
    }

    return executer(echeance, tache);
  };

  const amorcer = (): void => {
    for (const tache of taches) {
      reglages.poserSiAbsent({ tache: tache.tache, ...tache.reglageParDefaut });
      if (echeances.prochaine(tache.tache) === null) planifier(tache, horloge.maintenant());
    }
  };

  const reveiller = async (): Promise<readonly Passage[]> => {
    // Un réveil pendant un réveil se laisse tomber : le réveil suivant, une
    // minute plus tard, repassera ce qui reste dû. On n'empile pas.
    if (enCours) return [];
    commencerUnePasse();
    const passages: Passage[] = [];
    try {
      // Une par une, dans l'ordre où elles étaient dues. Séquentiel parce
      // qu'une passe est faite de requêtes sortantes, et que les lancer de
      // front n'irait qu'à contre-courant du plafond de 015.
      for (const echeance of echeances.dues(horloge.maintenant())) {
        passages.push(await passer(echeance));
      }
    } finally {
      finirLaPasse();
    }
    return passages;
  };

  const executerMaintenant = async (nom: string): Promise<Passage> => {
    // Le verrou partagé avec le réveil : une passe qui dure ne se superpose ni
    // à elle-même ni à un réveil simultané (018, plafond de 015). Un clic
    // pendant une passe en cours attend — silencieusement — qu'elle finisse,
    // puis joue sa propre passe et rend son rapport (spec 037).
    while (finDeLaPasse !== null) {
      await finDeLaPasse;
    }
    commencerUnePasse();
    try {
      const tache = parNom.get(nom);

      // Une tâche inconnue n'est jamais exécutée. La route répond 404 avant
      // d'arriver ici dans le cas courant ; la consigner quand même garde une
      // trace déchiffrable d'un appel direct (037).
      if (tache === undefined) {
        const rapport = consigner(
          nom,
          horloge.maintenant(),
          "tâche inconnue : déclenchement refusé, non exécutée.",
        );
        return { tache: nom, prevueLe: horloge.maintenant(), verdict: "inconnue", rapport };
      }

      const reglage = reglageDe(tache);
      if (!reglage.active) {
        throw new Error(`Tâche inactive, non déclenchable à la main : ${nom}`);
      }
      if (reglage.cadence.nature === "ponctuelle") {
        throw new Error(`Échéance ponctuelle, non déclenchable à la main : ${nom}`);
      }

      // On repart de l'échéance en attente, comme un réveil — la fenêtre de
      // grâce est court-circuitée : on l'exécute même hors fenêtre. Faute
      // d'échéance (cas défensif d'une tâche active à cadence, qui en a
      // normalement toujours une), on en inscrit une et on rend la main.
      const echeance = echeances.prochaine(nom);
      if (echeance === null) {
        planifier(tache, horloge.maintenant());
        return { tache: nom, prevueLe: horloge.maintenant(), verdict: "executee", rapport: null };
      }

      const demarreLe = horloge.maintenant();
      const rapport = await jouer(tache, demarreLe);

      // Coup unique : l'échéance est clôturée à `faite` et la suivante
      // inscrite, même en cas d'échec — le réessai à une et quatre heures est
      // propre au réveil. Sur un déclenchement manuel, le rapport montre
      // l'échec tout de suite et on relance à la main (spec 037).
      echeances.clore(echeance.id, "faite", horloge.maintenant());
      planifier(tache, horloge.maintenant());

      return { tache: nom, prevueLe: echeance.prevueLe, verdict: "executee", rapport };
    } finally {
      finirLaPasse();
    }
  };

  const reveillerEnJournalisant = (): void => {
    void reveiller().catch((erreur: unknown) => console.error("[socle] réveil", erreur));
  };

  return {
    amorcer,
    reveiller,
    executerMaintenant,

    demarrer(): void {
      if (minuterie !== null) return;
      amorcer();
      // Le rattrapage du démarrage, c'est ce premier réveil : ce qui était dû
      // pendant l'arrêt est encore en base, et la fenêtre de grâce décide.
      reveillerEnJournalisant();
      minuterie = setInterval(reveillerEnJournalisant, battement);
    },

    arreter(): void {
      if (minuterie === null) return;
      clearInterval(minuterie);
      minuterie = null;
    },

    etat(): readonly EtatDeLaTache[] {
      return taches.map((tache) => ({
        tache: tache.tache,
        intitule: tache.intitule,
        reglage: reglageDe(tache),
        prochaine: echeances.prochaine(tache.tache),
        dernierRapport: rapports.dernierRapport(tache.tache),
      }));
    },

    regler(reglage: ReglageDeTache): void {
      const tache = parNom.get(reglage.tache);
      if (tache === undefined) throw new Error(`Tâche inconnue : ${reglage.tache}`);
      reglages.enregistrer(reglage);
      // La cadence a pu changer : ce qui était planifié sous l'ancienne n'a
      // plus lieu d'être. Rien n'est perdu — seule une échéance qui n'a pas
      // encore tourné est annulée.
      echeances.annuler(reglage.tache, horloge.maintenant());
      planifier(tache, horloge.maintenant());
    },
  };
}
