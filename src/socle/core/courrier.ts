import type { Horloge } from "./horloge.ts";
import type { DepotEcheances } from "./ordonnancement.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";

/**
 * L'envoi de mail — spec 016.
 *
 * Une brique du socle, et non un morceau de feature : 013, 014 et 019 en ont
 * tous besoin, et la loger chez l'un d'eux refermait le backlog sur lui-même
 * (022). Elle ignore le contenu métier — elle envoie un message, elle ne décide
 * ni quand ni pourquoi.
 *
 * **Tout message est écrit en base avant d'être envoyé.** Un seul chemin de
 * code en développement comme en production : le mode « écrit plutôt
 * qu'envoyé » que 016 exige en test n'est pas un adaptateur de plus, c'est le
 * cas où personne ne vide la file. Et c'est ce qui rend le réessai possible
 * sans rejouer la tâche appelante — un mail raté pendant une passe de scraping
 * ne doit surtout pas relancer le scraping, ni le compte qui va avec (015).
 *
 * **Un échec d'envoi ne peut pas être signalé par mail.** Il vit dans le
 * rapport d'exécution (019) et sur `/sources`, nulle part ailleurs.
 */

/** La tâche sous laquelle le vidage consigne ses rapports — specs 018 et 019. */
export const TACHE_COURRIER = "courrier";

/**
 * Tous ces mails arrivent dans la même boîte, mêlés au reste. Un préfixe
 * constant, et un filtre s'y pose une fois pour toutes — là où un préfixe par
 * nature figerait une taxonomie que 013, 014 et 019 n'ont pas encore écrite.
 */
export const PREFIXE_DU_SUJET = "[Babo] ";

/**
 * Trois tentatives, puis abandon.
 *
 * Ce qu'on rattrape ici est une coupure réseau ou un Gmail momentanément
 * indisponible : cinq minutes en couvrent la majorité, trente ferment le cas de
 * la panne d'une demi-heure. Volontairement plus serré que les délais de 018,
 * calibrés pour une passe dont la donnée est simplement périmée — quatre heures
 * de retard sur une alerte de tournoi, c'est l'alerte perdue.
 */
export const DELAIS_DE_REESSAI_DUN_MESSAGE = [5 * 60_000, 30 * 60_000] as const;

export const TENTATIVES_PAR_MESSAGE = DELAIS_DE_REESSAI_DUN_MESSAGE.length + 1;

/**
 * Ce qu'un appelant compose.
 *
 * HTML obligatoire, texte facultatif. Aucun client grand public ne refuse le
 * HTML, et `nodemailer` ne sait pas dériver le texte tout seul — l'option qui
 * le faisait a disparu avec sa version 2. Exiger les deux versions de chaque
 * message serait donc du travail d'écriture perpétuel pour un risque quasi
 * inexistant : les alertes de 019 tiennent en deux lignes et fournissent les
 * deux sans effort, le tableau de tournois de 013 n'aura que le HTML.
 */
export type Message = {
  readonly sujet: string;
  readonly html: string;
  readonly texte?: string;
};

export const ETATS_DU_MESSAGE = ["en-attente", "envoye", "abandonne"] as const;

export type EtatDuMessage = (typeof ETATS_DU_MESSAGE)[number];

/** Un message tel qu'il vit en base, du dépôt à l'envoi ou à l'abandon. */
export type MessageDepose = {
  readonly id: number;
  readonly sujet: string;
  readonly html: string;
  readonly texte: string | null;
  readonly deposeLe: Date;
  /** Tentatives consommées. Zéro tant que rien n'a été tenté. */
  readonly tentatives: number;
  readonly prochaineTentativeLe: Date;
  readonly etat: EtatDuMessage;
  /** La dernière raison d'échec, gardée même après un envoi réussi au coup suivant. */
  readonly dernierEchec: string | null;
};

/**
 * Port : `infrastructure` en fournit l'adaptateur, `nodemailer` sur le SMTP de
 * Gmail. Le `core` ne sait ni ce qu'est un port 465 ni ce qu'est un mot de
 * passe d'application.
 */
export type Transport = {
  readonly destinataire: string;
  envoyer(message: Message): Promise<void>;
};

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotCourrier = {
  deposer(message: Message, quand: Date): MessageDepose;
  lire(id: number): MessageDepose | null;
  /** Les messages en attente dont l'heure de tentative est passée. */
  dus(maintenant: Date): readonly MessageDepose[];
  marquerEnvoye(id: number, quand: Date): void;
  reporter(id: number, tentatives: number, prochaineTentativeLe: Date, echec: string): void;
  abandonner(id: number, tentatives: number, quand: Date, echec: string): void;
  /** Ce que l'écran affiche : envoyés et abandonnés compris, du plus récent au plus ancien. */
  derniers(combien: number): readonly MessageDepose[];
  compterEnAttente(): number;
};

export type EtatDuCourrier = {
  /** Faux quand la configuration SMTP est absente : les messages s'empilent, rien ne part. */
  readonly configure: boolean;
  readonly destinataire: string | null;
  readonly enAttente: number;
  readonly derniers: readonly MessageDepose[];
};

export type Courrier = {
  /**
   * Écrit le message en base, puis tente aussitôt de le remettre. L'attente
   * immédiate est voulue : une alerte de tournoi (013) vaut par les heures
   * qu'elle fait gagner, et la faire patienter jusqu'au prochain réveil du
   * planificateur serait une symétrie payée cher.
   */
  deposer(message: Message): Promise<MessageDepose>;
  /**
   * Remet ce qui est dû, replanifie ce qui a échoué, abandonne ce qui a épuisé
   * ses tentatives.
   *
   * Rend `null` quand il n'y avait rien à faire — et c'est tout l'intérêt :
   * une tâche qui ne rapporte que lorsqu'il s'est passé quelque chose ne noie
   * pas l'historique que 019 doit rendre lisible.
   */
  vider(): Promise<RapportArchive | null>;
  etat(): EtatDuCourrier;
};

export function creerCourrier(options: {
  readonly depot: DepotCourrier;
  /** `null` quand la configuration SMTP est absente — développement, tests, oubli. */
  readonly transport: Transport | null;
  readonly rapports: DepotRapports;
  /**
   * Les reprises sont des échéances **ponctuelles**, inscrites par le courrier
   * lui-même — c'est ce qui donne l'espacement exact sans ajouter de cadence
   * périodique à 018, et ce qui les fait survivre à un redémarrage, puisque ce
   * sont des lignes en base.
   */
  readonly echeances: DepotEcheances;
  readonly horloge: Horloge;
}): Courrier {
  const { depot, transport, rapports, echeances, horloge } = options;

  // Un vidage à la fois : deux vidages concurrents sur la même file feraient
  // partir le même message deux fois. Le vidage en vol est gardé plutôt qu'un
  // simple drapeau, pour qu'un dépôt puisse l'attendre — voir `deposer`.
  let enCours: Promise<RapportArchive | null> | null = null;

  const vider = (): Promise<RapportArchive | null> => {
    // Sans transport, aucune tentative n'est consommée : les trois tentatives
    // d'un message servent à traverser une panne de Gmail, pas à punir une
    // configuration absente. Les messages attendent, et l'écran le dit.
    if (transport === null) return Promise.resolve(null);
    if (enCours !== null) return enCours;

    const passe = viderVraiment().finally(() => {
      enCours = null;
    });
    enCours = passe;
    return passe;
  };

  const viderVraiment = async (): Promise<RapportArchive | null> => {
    if (transport === null) return null;

    const demarreLe = horloge.maintenant();
    const dus = depot.dus(demarreLe);
    if (dus.length === 0) return null;

    let envoyes = 0;
    const echecs: string[] = [];

    for (const message of dus) {
      try {
        // `texte` est nullable en base et facultatif dans un `Message` : le
        // champ absent et le champ nul ne veulent pas dire la même chose pour
        // `nodemailer`, qui n'émet la partie texte que si on la lui donne.
        await transport.envoyer({
          sujet: message.sujet,
          html: message.html,
          ...(message.texte === null ? {} : { texte: message.texte }),
        });
        depot.marquerEnvoye(message.id, horloge.maintenant());
        envoyes += 1;
      } catch (erreur) {
        echecs.push(replanifier(message, erreur, demarreLe));
      }
    }

    const detail = `${envoyes} remis sur ${dus.length}${echecs.length === 0 ? "" : ` — ${echecs.join(" ; ")}`}`;

    return rapports.consigner({
      tache: TACHE_COURRIER,
      demarreLe,
      termineLe: horloge.maintenant(),
      // Échec seulement si rien n'est parti, comme la passe de 028 : un vidage
      // qui remet trois messages sur quatre a fait son travail, et le détail
      // nomme le quatrième.
      issue: envoyes > 0 ? "succes" : "echec",
      // Des messages remis, pas des lignes extraites d'une page : c'est le
      // décompte que produit cette passe-là, et 019 ne demande rien d'autre.
      volumeExtrait: envoyes,
      detail,
    });
  };

  const replanifier = (message: MessageDepose, erreur: unknown, maintenant: Date): string => {
    const raison = erreur instanceof Error ? erreur.message : String(erreur);
    const tentatives = message.tentatives + 1;
    const delai = DELAIS_DE_REESSAI_DUN_MESSAGE[tentatives - 1];

    if (delai === undefined) {
      // Les tentatives sont écrites même à l'abandon : l'écran doit dire trois
      // pour un message tenté trois fois, pas deux.
      depot.abandonner(message.id, tentatives, maintenant, raison);
      return `« ${message.sujet} » abandonné après ${tentatives} tentatives : ${raison}`;
    }

    // Toutes les reprises d'un même vidage tombent à la même seconde, puisque
    // `maintenant` est figé au début : l'index (tâche, date prévue) de 018 les
    // fond alors en une seule échéance, et le réveil ne se déclenche qu'une
    // fois pour dix messages en panne.
    const quand = new Date(maintenant.getTime() + delai);
    depot.reporter(message.id, tentatives, quand, raison);
    echeances.inscrire(TACHE_COURRIER, quand, maintenant);
    return `« ${message.sujet} » repris le ${quand.toLocaleString("fr-FR")} : ${raison}`;
  };

  return {
    async deposer(message: Message): Promise<MessageDepose> {
      const depose = depot.deposer(
        { ...message, sujet: PREFIXE_DU_SUJET + message.sujet },
        horloge.maintenant(),
      );

      // Un vidage déjà en vol a pu lire la file avant ce message : on l'attend,
      // puis on repasse. Sans cela, un dépôt tombé pendant l'aller-retour SMTP
      // d'un autre dormirait jusqu'au balayage quotidien — une alerte de panne
      // retardée d'une journée vaut une alerte perdue.
      const enVol = enCours;
      if (enVol !== null) await enVol.catch(() => undefined);
      await vider();

      // Relu après le vidage, pas rendu tel qu'il a été inséré : l'appelant
      // doit voir l'état réel — remis, repris, ou en attente d'un transport
      // absent —, pas le « en-attente » figé d'il y a une milliseconde.
      return depot.lire(depose.id) ?? depose;
    },

    vider,

    etat: (): EtatDuCourrier => ({
      configure: transport !== null,
      destinataire: transport?.destinataire ?? null,
      enAttente: depot.compterEnAttente(),
      derniers: depot.derniers(20),
    }),
  };
}

/**
 * Le message que le bouton de `/sources` dépose — spec 016.
 *
 * Il passe par la boîte d'envoi comme les autres, et c'est le point : un bouton
 * qui emprunterait un chemin différent de celui qu'il prétend vérifier pourrait
 * réussir pendant que le vrai chemin est cassé. Sa trace dans l'historique date
 * la dernière fois où l'on a prouvé que le courrier fonctionnait.
 */
export function messageDeTest(quand: Date): Message {
  const horodatage = quand.toLocaleString("fr-FR");
  return {
    sujet: "Mail de test",
    html: `<p>Le courrier fonctionne. Message déposé le ${horodatage} depuis l'écran des sources.</p>`,
    texte: `Le courrier fonctionne. Message déposé le ${horodatage} depuis l'écran des sources.`,
  };
}
