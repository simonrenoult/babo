import { configurationDepuisEnvironnement } from "./socle/infrastructure/configuration-environnement.ts";
import { ouvrirLaPersistance } from "./socle/infrastructure/base/persistance.ts";
import { creerApplication } from "./socle/presentation/serveur.ts";
import {
  actionsPeutEtrePerimees,
  echeanceDeLaSession,
  enArchivant,
  enObservantLeBuild,
  etatDeLaSource,
  sousPlafond,
  tacheDAcquisition,
  tacheDesEngagements,
  tacheDesTournois,
} from "./socle/core/acquisition.ts";
import { sonder } from "./socle/core/sonde.ts";
import { plafondDeLaPasse, releverLesClassements } from "./socle/core/passe-classement.ts";
import {
  confirmerParLeCode,
  creerAttentes,
  demanderUneConnexion,
} from "./socle/core/connexion.ts";
import { horlogeSysteme } from "./socle/core/horloge.ts";
import { creerOrdonnanceur, type TacheOrdonnancee } from "./socle/core/ordonnancement.ts";
import { creerAuthentification } from "./socle/core/authentification.ts";
import { TACHE_COURRIER, creerCourrier, messageDeTest } from "./socle/core/courrier.ts";
import { enAlertant } from "./socle/core/alerte.ts";
import { TACHE_BATTEMENT, battreLeCoeur, type TacheSuivie } from "./socle/core/battement.ts";
import { fraicheur } from "./socle/core/fraicheur.ts";
import { transportNodemailer } from "./socle/infrastructure/courrier/transport-nodemailer.ts";
import { jetonHmac } from "./socle/infrastructure/authentification/jeton-hmac.ts";
import { motDePasseScrypt } from "./socle/infrastructure/authentification/mot-de-passe-scrypt.ts";
import type { Licence } from "./socle/core/licence.ts";
import type { Lettre } from "./socle/core/classement.ts";
import { clientFetch } from "./socle/infrastructure/acquisition/client-fetch.ts";
import { creerModuleMyffbad } from "./socle/infrastructure/acquisition/myffbad.ts";
import { moduleBadnet } from "./socle/infrastructure/acquisition/badnet.ts";
import { accesAuxEngagementsBadnet } from "./socle/infrastructure/acquisition/engagements-badnet.ts";
import { accesAuxFichesPubliquesBadnet } from "./socle/infrastructure/acquisition/tournois-badnet.ts";
import { releverLesEngagements } from "./socle/core/passe-engagements.ts";
import { FICHES_PAR_PASSE, releverLesTournois } from "./socle/core/passe-tournois.ts";
import { releverLesVeilles, tacheDesVeilles } from "./socle/core/passe-veilles.ts";
import { accesALaRechercheBadnet } from "./socle/infrastructure/acquisition/veilles-badnet.ts";
import { creerModuleMonProfil } from "./mon-profil/presentation/module-web.ts";
import { creerModuleCapitanat } from "./capitanat/presentation/module-web.ts";
import { ImportRefuse } from "./capitanat/core/coequipier.ts";
import { depotCoequipiersSqlite } from "./capitanat/infrastructure/depot-coequipiers-sqlite.ts";
import { depotPreferencesSqlite } from "./capitanat/infrastructure/depot-preferences-sqlite.ts";
import { lireLeCsvDeLEquipe } from "./capitanat/infrastructure/csv-equipe.ts";
import { creerModuleVeille } from "./veille/presentation/module-web.ts";
import { depotVeillesSqlite } from "./veille/infrastructure/depot-veilles-sqlite.ts";
import { disciplinesDe } from "./veille/core/veille.ts";

/**
 * Point de composition — specs 020 et 022.
 *
 * Un seul processus, une seule instance : c'est la seule forme compatible avec
 * un fichier SQLite unique et un planificateur interne. La montée en charge
 * horizontale est exclue par construction, pas par oubli.
 *
 * Ce fichier est le seul endroit qui connaisse à la fois le socle et les
 * features. Les modules, eux, s'ignorent.
 */
const configuration = configurationDepuisEnvironnement();
const persistance = ouvrirLaPersistance(configuration.base);

if (persistance.migrationsAppliquees.length > 0) {
  console.log(`[socle] migrations appliquées : ${persistance.migrationsAppliquees.join(", ")}`);
}

/**
 * Le dépôt de `capitanat`, monté sur la même base que le reste — spec 005.
 *
 * Il n'est pas dans la persistance du socle : `Coequipier` est une notion de
 * feature, et le socle ne connaît aucune feature (022). C'est ici, et
 * seulement ici, que les deux se rencontrent.
 */
const coequipiers = depotCoequipiersSqlite(persistance.base);

/**
 * Les paires et les marques du capitaine — spec 030.
 *
 * Même base, même raison qu'au-dessus : une paire est une décision de
 * capitaine, donc une notion de feature, et le socle n'en connaît aucune (022).
 */
const preferencesDuCapitaine = depotPreferencesSqlite(persistance.base);

/**
 * Les veilles — spec 012.
 *
 * Même base, même raison que les deux dépôts au-dessus : une veille est une
 * recherche que *je* nomme et que je garde, donc une notion de feature, et le
 * socle n'en connaît aucune (022). Ce qu'une veille *voit*, en revanche, est
 * écrit par une passe du socle et vit avec les tournois.
 */
const veilles = depotVeillesSqlite(persistance.base);

const modulesDAcquisition = [creerModuleMyffbad(configuration.licence), moduleBadnet];
const reseau = clientFetch();

/**
 * Les deux sources, et le client qui les atteint — spec 015.
 *
 * Un client neuf par passe et par source : c'est lui qui porte l'archivage
 * avant analyse et le plafond de requêtes, et aucun des deux ne doit pouvoir
 * s'oublier ni se partager entre sources.
 */
const clientPour = (source: (typeof modulesDAcquisition)[number]["source"], plafond: number) => {
  const module = modulesDAcquisition.find((candidat) => candidat.source === source);
  if (module === undefined) throw new Error(`Source sans module d'acquisition : ${source}`);

  return sousPlafond(
    enObservantLeBuild(
      enArchivant(reseau, { source, captures: persistance.captures, horloge: horlogeSysteme }),
      { module, builds: persistance.builds, horloge: horlogeSysteme },
    ),
    plafond,
  );
};

/**
 * Le courrier — spec 016.
 *
 * Sans configuration SMTP, `transport` reste `null` : l'application démarre,
 * les messages s'empilent en base et `/sources` le dit. C'est le motif de
 * `BABO_MYFFBAD_MOT_DE_PASSE` — une capacité facultative se dégrade, elle
 * n'empêche pas de démarrer. Refuser de démarrer est réservé à ce sans quoi
 * l'application serait dangereuse : une base non chiffrée, une porte sans
 * serrure.
 */
const courrier = creerCourrier({
  depot: persistance.courrier,
  transport: configuration.courrier === null ? null : transportNodemailer(configuration.courrier),
  // Le dépôt nu, et c'est voulu : un échec d'envoi ne peut pas être signalé par
  // mail (016). L'ordre de construction le rend d'ailleurs impossible — le
  // décorateur d'alerte a besoin du courrier, qui existe donc avant lui.
  rapports: persistance.rapports,
  echeances: persistance.echeances,
  horloge: horlogeSysteme,
});

if (configuration.courrier === null) {
  console.log("[socle] courrier non configuré : les mails s'écrivent en base sans partir");
}

/**
 * Le dépôt de rapports qui prévient — spec 019.
 *
 * Posé ici, autour du dépôt nu, et c'est le seul que les passes recevront :
 * aucune d'elles ne peut oublier d'alerter, comme aucune requête sortante ne
 * peut oublier d'archiver sa réponse (015). Les passes de 015 s'y brancheront
 * sans une ligne de plus.
 */
const rapports = enAlertant(persistance.rapports, { courrier });

/**
 * Les licences suivies — spec 028.
 *
 * La mienne et celles de l'équipe, dédoublonnées : je suis dans le CSV comme
 * les autres, et sans cette union je serais relevé deux fois. Elle se relit à
 * chaque passage plutôt que de se figer au démarrage, parce que l'import de 005
 * la change entre deux passes.
 *
 * La passe les reçoit en argument : un port de plus n'aurait qu'un seul
 * implémenteur, et le point de composition est déjà l'endroit désigné pour
 * brancher un module sur le socle (022).
 */
const licencesSuivies = (): readonly Licence[] => [
  ...new Set([configuration.licence, ...coequipiers.tous().map(({ licence }) => licence)]),
];

const relever = () => {
  const module = modulesDAcquisition.find((candidat) => candidat.source === "myffbad");
  if (module === undefined) throw new Error("Source sans module d'acquisition : myffbad");

  const licences = licencesSuivies();
  return releverLesClassements({
    client: clientPour("myffbad", plafondDeLaPasse(licences.length)),
    module,
    licences,
    identites: persistance.identites,
    classements: persistance.classements,
    rapports,
    horloge: horlogeSysteme,
  });
};

/**
 * La passe des engagements — spec 027.
 *
 * Le plafond est calculé sur la chaîne réelle : deux requêtes pour la liste,
 * trois par fiche, plus une de marge. badnet sert toutes ses pages en coquille,
 * et aucun identifiant d'action n'est écrit en dur — c'est ce qui coûte ces
 * sauts, et ce qui évite qu'un redéploiement fasse tomber la passe en silence.
 *
 * Douze tournois par saison au plus : le plafond n'a jamais à être généreux.
 */
const PLAFOND_DES_ENGAGEMENTS = 2 + 3 * 12 + 1;

const relverLesEngagements = () => {
  const jeton = persistance.jetonMyffbad.lire("badnet");
  const client = clientPour("badnet", PLAFOND_DES_ENGAGEMENTS);

  return releverLesEngagements({
    jeton: jeton?.valeur ?? null,
    engagements: persistance.engagements,
    rapports,
    horloge: horlogeSysteme,
    acces: accesAuxEngagementsBadnet({
      client,
      jeton: jeton?.valeur ?? "",
      licence: configuration.licence,
    }),
  });
};

/**
 * La passe des lieux — spec 002.
 *
 * **Anonyme, et c'est sa raison d'être séparée.**
 * `/tournoi/public/informations` ne demande aucune session : elle aboutit le
 * jour où celle de badnet est morte, comme la passe de classement depuis 028.
 * La consigner avec les engagements ferait passer pour morte une chaîne qui va
 * très bien.
 *
 * Le plafond suit la chaîne réelle — coquille, enveloppe, puis fiche : **trois**
 * requêtes par tournoi depuis 036, plus une de marge — et se calcule sur ce qui
 * **reste** à relever, borné par le plafond de la passe elle-même : depuis 012
 * une veille peut apporter cent tournois d'un coup, et trois cents requêtes
 * d'affilée sont la seule façon de se faire remarquer d'un site qui ne
 * demandait rien.
 */
const relverLesTournois = () => {
  const connus = persistance.tournois.connus();
  const demandes = new Set([
    ...persistance.engagements.tous().map(({ evenement }) => evenement),
    ...persistance.tournois.sansFiche(),
  ]);
  const aRelever = Math.min(
    [...demandes].filter((evenement) => !connus.has(evenement)).length,
    FICHES_PAR_PASSE,
  );

  return releverLesTournois({
    engagements: persistance.engagements,
    tournois: persistance.tournois,
    rapports,
    horloge: horlogeSysteme,
    acces: accesAuxFichesPubliquesBadnet({
      client: clientPour("badnet", 3 * aRelever + 1),
    }),
  });
};

/**
 * La passe des veilles — spec 012.
 *
 * **Le socle ne connaît pas les veilles**, et c'est ici que les deux se
 * rencontrent : chaque veille active devient une `RechercheDeTournois`, une
 * forme qui ne porte que ce que le formulaire badnet sait filtrer. Les séries,
 * les tableaux nommés et la fenêtre restent dans la feature, qui les applique
 * en lisant l'index — c'est la traduction que 022 attend d'un point de
 * composition, et celle que `licencesSuivies` fait déjà pour 028.
 *
 * Le plafond est large et sans rapport avec le nombre de tournois : une requête
 * par veille, cinq au plus, plus une de marge. C'est la requête la moins chère
 * du projet.
 */
const relverLesVeilles = () => {
  const actives = veilles.toutes().filter(({ active }) => active);

  return releverLesVeilles({
    recherches: actives.map((veille) => ({
      id: veille.id,
      intitule: veille.nom,
      autourDe: { longitude: veille.longitude, latitude: veille.latitude },
      rayonKm: veille.rayonKm,
      // Déduites des tableaux : badnet ne distingue pas le genre, et deux
      // champs qui peuvent se contredire en font toujours un de faux.
      disciplines: disciplinesDe(veille.tableaux),
      categories: veille.categories,
    })),
    tournois: persistance.tournois,
    appartenances: persistance.appartenances,
    rapports,
    horloge: horlogeSysteme,
    acces: accesALaRechercheBadnet({ client: clientPour("badnet", actives.length + 1) }),
  });
};

/**
 * Les tâches qui se déclenchent seules — spec 018.
 *
 * Une seule aujourd'hui : la passe de classement, hebdomadaire, le vendredi à
 * 1 h du matin parce que le CPPH est publié une fois par semaine. Les
 * acquisitions quotidiennes de 015 et le battement de 019 s'ajouteront ici, à
 * une ligne chacune — c'est tout ce que le planificateur demande.
 *
 * L'identifiant est celui sous lequel la passe consigne déjà son rapport
 * (`acquisition:myffbad`) : l'écran met ainsi la prochaine échéance en regard
 * de la dernière exécution sans table de correspondance.
 *
 * Grâce de 48 h : une passe hebdomadaire manquée pendant un week-end d'arrêt
 * vaut la peine d'être rejouée le lundi — la donnée est périmée, pas fausse —
 * alors qu'attendre la passe suivante coûterait une semaine de classement.
 */
const tachesOrdonnancees: readonly TacheOrdonnancee[] = [
  {
    tache: tacheDAcquisition("myffbad"),
    intitule: "Relever noms et classements (myffbad)",
    reglageParDefaut: {
      cadence: { nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 },
      graceMinutes: 48 * 60,
      active: true,
    },
    executer: relever,
  },
  /**
   * Le vidage de la boîte d'envoi — spec 016.
   *
   * Cadence quotidienne, mais ce n'est pas par elle que les mails partent :
   * un message est remis dès son dépôt, et une reprise s'inscrit elle-même en
   * échéance ponctuelle à cinq puis à trente minutes. Ce passage quotidien ne
   * ramasse que les orphelins — le message écrit juste avant un arrêt brutal,
   * qui n'a eu ni tentative immédiate ni reprise inscrite, et qui dormirait
   * sinon en base pour toujours.
   *
   * Grâce de 24 h : une alerte de panne vaut encore quelque chose six heures
   * plus tard, la panne durant toujours. Au-delà d'une journée, l'information
   * est périmée — un tournoi s'est rempli — ou déjà remplacée par le battement
   * hebdomadaire de 019.
   */
  {
    tache: TACHE_COURRIER,
    intitule: "Vider la boîte d'envoi (courrier)",
    reglageParDefaut: {
      cadence: { nature: "quotidienne", heure: 6, minute: 30 },
      graceMinutes: 24 * 60,
      active: true,
    },
    executer: () => courrier.vider(),
  },
  /**
   * Les engagements badnet — spec 027.
   *
   * Quotidienne, à 5 h : le risque que 027 vise est « m'inscrire deux fois sur
   * le même week-end », et un jour de latence est sans conséquence. Grâce large
   * — 12 h —, à l'inverse du battement : cette donnée est périmable, pas datée,
   * et un relevé rattrapé le midi reste juste.
   */
  {
    tache: tacheDesEngagements(),
    intitule: "Relever mes engagements (badnet)",
    reglageParDefaut: {
      cadence: { nature: "quotidienne", heure: 5, minute: 0 },
      graceMinutes: 12 * 60,
      active: true,
    },
    executer: relverLesEngagements,
  },
  /**
   * Les lieux des tournois — spec 002.
   *
   * Quotidienne comme les engagements, et une demi-heure après eux : c'est la
   * passe de 5 h qui fait apparaître une inscription nouvelle, et celle-ci lui
   * donne sa ville dans la foulée. Aucun enchaînement pour autant — personne ne
   * regarde l'écran à cette heure-là, et coupler les deux remettrait une requête
   * anonyme dans le sillage d'une passe sous session.
   *
   * Elle ne coûte des requêtes que le lendemain d'une inscription : une ville
   * ne change pas, donc un tournoi déjà connu n'est jamais redemandé. Les
   * autres jours elle consigne « 4 connus, aucun à relever », ce qui suffit au
   * battement du lundi pour ne pas la croire muette.
   *
   * Grâce large, comme les engagements : cette donnée est périmable, pas datée.
   */
  {
    tache: tacheDesTournois(),
    intitule: "Relever le lieu des tournois (badnet, anonyme)",
    reglageParDefaut: {
      cadence: { nature: "quotidienne", heure: 5, minute: 30 },
      graceMinutes: 12 * 60,
      active: true,
    },
    executer: relverLesTournois,
  },
  /**
   * Les veilles — spec 012.
   *
   * À 5 h 15, **entre** les engagements de 5 h et les fiches de 5 h 30 : ce
   * qu'une veille découvre est détaillé un quart d'heure plus tard, sans qu'on
   * ait à enchaîner les deux passes. Un enchaînement remettrait d'ailleurs une
   * requête anonyme dans le sillage d'une passe sous session, ce que 015
   * interdit.
   *
   * Grâce large, comme ses voisines : cette donnée est périmable, pas datée. Un
   * relevé rattrapé à midi reste juste.
   */
  {
    tache: tacheDesVeilles(),
    intitule: "Relever mes veilles (badnet, anonyme)",
    reglageParDefaut: {
      cadence: { nature: "quotidienne", heure: 5, minute: 15 },
      graceMinutes: 12 * 60,
      active: true,
    },
    executer: relverLesVeilles,
  },
  /**
   * Le battement hebdomadaire — spec 019.
   *
   * À jour et heure fixes **pour que son absence se remarque** : sans lui,
   * l'arrêt complet du planificateur est indiscernable d'une semaine sans
   * incident. C'est le seul mécanisme du projet dont le silence soit une
   * information.
   *
   * Le lundi à 8 h, quand on lit ses mails, et non la nuit où il se noierait
   * dans le reste. Grâce **nulle** : rattrapé le mardi, il mentirait sur la
   * date à laquelle il a constaté ce qu'il annonce (018).
   */
  {
    tache: TACHE_BATTEMENT,
    intitule: "Battement hebdomadaire",
    reglageParDefaut: {
      cadence: { nature: "hebdomadaire", jour: 1, heure: 8, minute: 0 },
      graceMinutes: 0,
      active: true,
    },
    executer: () =>
      battreLeCoeur({
        taches: tachesSuivies,
        rapports,
        courrier,
        horloge: horlogeSysteme,
        tailleDeLaBase: () => persistance.taille(),
        captures: () => persistance.captures.compter(),
      }),
  },
];

/**
 * Ce que le battement nomme, y compris ce qui n'a jamais tourné — spec 019.
 *
 * Une tâche absente du rapport hebdomadaire est une tâche dont on ne saura
 * jamais qu'elle s'est tue. La liste se déduit donc des tâches déclarées
 * au-dessus, moins le battement lui-même : s'annoncer soi-même n'apprend rien.
 */
const tachesSuivies: readonly TacheSuivie[] = tachesOrdonnancees
  .filter(({ tache }) => tache !== TACHE_BATTEMENT)
  .map(({ tache, intitule }) => ({ tache, intitule }));

const ordonnanceur = creerOrdonnanceur({
  taches: tachesOrdonnancees,
  reglages: persistance.reglages,
  echeances: persistance.echeances,
  // Décoré : l'exception non rattrapée qu'il consigne à la place d'une passe
  // est une panne comme une autre, et doit prévenir comme une autre (019).
  rapports,
  horloge: horlogeSysteme,
});

/**
 * La porte — spec 021.
 *
 * Posée avant le serveur, et le compte avec elle : il n'y a pas d'inscription,
 * la configuration fait foi. Changer `BABO_MOT_DE_PASSE` et redémarrer suffit à
 * changer de mot de passe, ce qui dispense d'un écran de changement et du
 * chemin de récupération qu'il faudrait avec.
 */
const authentification = creerAuthentification({
  comptes: persistance.compte,
  hachage: motDePasseScrypt(),
  signature: jetonHmac(configuration.secretDuJeton),
  horloge: horlogeSysteme,
});

if (authentification.poserLeCompte(configuration.licence, configuration.motDePasse)) {
  console.log("[socle] mot de passe posé depuis la configuration");
}

/**
 * L'ancienneté d'un classement, jugée sur la cadence de sa propre passe — 019.
 *
 * Le seuil n'est pas une constante nouvelle : c'est le réglage que 018 garde en
 * base, et qui se modifie depuis `/sources`. Relu à chaque rendu, donc une
 * cadence changée déplace le seuil sans redémarrage — et une cadence absente
 * (tâche jamais amorcée) vaut hebdomadaire, la valeur de départ déclarée.
 */
const fraicheurDuClassement = (vuLe: Date | null) =>
  fraicheur(vuLe, cadenceDe(tacheDAcquisition("myffbad")), horlogeSysteme.maintenant());

/**
 * La cadence effective d'une tâche : celle qu'on a réglée, sinon celle qu'on a
 * déclarée. Relue à chaque rendu, donc une cadence changée depuis `/sources`
 * déplace le seuil de péremption sans redémarrage (019).
 */
function cadenceDe(tache: string) {
  const declaree = tachesOrdonnancees.find((candidate) => candidate.tache === tache);
  if (declaree === undefined) throw new Error(`Tâche non déclarée : ${tache}`);
  return persistance.reglages.lire(tache)?.cadence ?? declaree.reglageParDefaut.cadence;
}

/**
 * L'ancienneté des engagements, jugée sur la cadence de leur passe — 019 et 002.
 *
 * Une seconde fonction, et non celle du classement réutilisée : les deux passes
 * tombent indépendamment, et 019 interdit nommément l'ancienneté globale. Le
 * classement peut être frais pendant que badnet se tait depuis trois semaines.
 *
 * Elle se lit sur le dernier **succès** de la passe, jamais sur son dernier
 * réveil ni sur la date écrite à côté des lignes : le remplacement intégral de
 * 027 vide la table en intersaison, et la seule trace de la réussite
 * disparaîtrait avec les lignes — la page dirait « jamais relevé » le lendemain
 * d'une passe parfaite.
 */
/**
 * L'ancienneté du relevé des veilles, sur la cadence de leur propre passe — 019.
 *
 * Une troisième fonction, et non l'une des deux autres : les passes tombent
 * indépendamment, et 019 interdit nommément l'ancienneté globale.
 */
const fraicheurDesVeilles = () =>
  fraicheur(
    rapports.dernierSucces(tacheDesVeilles())?.demarreLe ?? null,
    cadenceDe(tacheDesVeilles()),
    horlogeSysteme.maintenant(),
  );

/**
 * Mes séries du moment, proposées comme valeur de départ d'une veille — 012.
 *
 * Un confort, et rien de plus : 012 a refusé de déduire le critère de mon
 * classement — une veille qui changerait de sens toute seule à chaque
 * publication du CPPH serait une veille à qui je ne ferais plus confiance. Une
 * case cochée d'avance, elle, se décoche.
 */
const mesSeries = (): readonly Lettre[] => [
  ...new Set(
    persistance.classements.derniers(configuration.licence).map(({ lettre }) => lettre),
  ),
];

const fraicheurDesEngagements = () =>
  fraicheur(
    rapports.dernierSucces(tacheDesEngagements())?.demarreLe ?? null,
    cadenceDe(tacheDesEngagements()),
    horlogeSysteme.maintenant(),
  );

/**
 * Les connexions en attente d'un code — spec 027.
 *
 * En mémoire : l'attente vit dix minutes, et un redémarrage dans cet intervalle
 * veut dire qu'on recommence, pas qu'on perd quelque chose. Cela garde surtout
 * un cookie à moitié authentifié hors de la base — le seul qu'on y écrit est
 * celui qui marche.
 */
const attentes = creerAttentes();

const VARIABLE_DU_MOT_DE_PASSE: Record<string, string> = {
  myffbad: "BABO_MYFFBAD_MOT_DE_PASSE",
  badnet: "BABO_BADNET_MOT_DE_PASSE",
};

const moduleDe = (source: (typeof modulesDAcquisition)[number]["source"]) => {
  const module = modulesDAcquisition.find((candidat) => candidat.source === source);
  if (module === undefined) throw new Error(`Source sans module d'acquisition : ${source}`);
  return module;
};

const motDePasseDe = (source: string): string | null =>
  source === "badnet" ? configuration.motDePasseBadnet : configuration.motDePasseMyffbad;

const application = creerApplication({
  authentification,
  configuration,
  modules: [
    creerModuleMonProfil({
      licence: configuration.licence,
      classements: persistance.classements,
      fraicheur: fraicheurDuClassement,
      engagements: persistance.engagements,
      tournois: persistance.tournois,
      fraicheurDesEngagements,
      horloge: horlogeSysteme,
    }),
    creerModuleCapitanat({
      coequipiers,
      identites: persistance.identites,
      classements: persistance.classements,
      preferences: preferencesDuCapitaine,
      fraicheur: fraicheurDuClassement,
      horloge: horlogeSysteme,
    }),
    creerModuleVeille({
      veilles,
      tournois: persistance.tournois,
      appartenances: persistance.appartenances,
      fraicheur: fraicheurDesVeilles,
      horloge: horlogeSysteme,
      mesSeries: () => mesSeries(),
    }),
  ],
  etatDuSocle: () => ({
    tailleDeLaBase: persistance.taille(),
    captures: persistance.captures.compter(),
  }),
  sources: {
    etats: () =>
      modulesDAcquisition.map((module) =>
        etatDeLaSource(
          module.source,
          persistance.jetonMyffbad.lire(module.source),
          rapports.dernierRapport(tacheDAcquisition(module.source)),
          horlogeSysteme.maintenant(),
          // Autonome seulement si la source sait se connecter *et* qu'on lui a
          // donné de quoi le faire : un bouton qui échouerait ne vaut rien.
          module.connexion !== undefined && motDePasseDe(module.source) !== null,
        ),
      ),

    enregistrer: (source, valeur) => {
      const module = modulesDAcquisition.find((candidat) => candidat.source === source);
      if (module === undefined) throw new Error(`Source sans module d'acquisition : ${source}`);

      const obtenuLe = horlogeSysteme.maintenant();
      persistance.jetonMyffbad.enregistrer(source, {
        valeur,
        obtenuLe,
        // Lue dans le jeton quand il la porte, devinée seulement sinon.
        expireLe: echeanceDeLaSession(module, valeur, obtenuLe),
      });
    },

    deploiements: () =>
      modulesDAcquisition.map((module) => {
        const courant = persistance.builds.courant(module.source);
        return {
          source: module.source,
          build: courant?.build ?? null,
          depuis: courant?.vuLaPremiereFois ?? null,
          builds: persistance.builds.historique(module.source).length,
          actionsPeutEtrePerimees: actionsPeutEtrePerimees(module, courant?.build ?? null),
        };
      }),

    oublier: (source) => persistance.jetonMyffbad.effacer(source),

    // L'import de l'équipe — spec 005. Le socle passe du texte et reçoit un
    // décompte ou des motifs : c'est ici que le CSV devient des coéquipiers.
    //
    // Et la passe suit dans la foulée (028) : on clique, on voit huit noms.
    // C'est ce qui rend une licence bien formée mais erronée visible tout de
    // suite — elle rapporte le nom de quelqu'un d'autre. Une passe qui échoue
    // ne défait pas l'import : le CSV, lui, était bon, et l'écran porte les
    // deux verdicts séparément.
    importerLEquipe: async (csv) => {
      let equipe;
      try {
        equipe = lireLeCsvDeLEquipe(csv);
        coequipiers.remplacer(equipe);
      } catch (erreur) {
        if (erreur instanceof ImportRefuse) return { issue: "refusee", motifs: erreur.motifs };
        throw erreur;
      }

      return { issue: "importee", membres: equipe.length, releve: await relever() };
    },

    connecter: async (source) => {
      const module = moduleDe(source);
      const motDePasse = motDePasseDe(source);
      if (motDePasse === null) {
        throw new Error(`${VARIABLE_DU_MOT_DE_PASSE[source]} n'est pas renseigné : voir .env.example.`);
      }

      const resultat = await demanderUneConnexion({
        // Trois requêtes : le préalable qui relève l'action, la connexion, et
        // une de marge. Au-delà, c'est une boucle, pas une connexion (015).
        client: clientPour(source, 3),
        module,
        identifiant: configuration.licence,
        motDePasse,
        jetons: persistance.jetonMyffbad,
        attentes,
        horloge: horlogeSysteme,
      });
      return resultat.issue;
    },

    confirmerLeCode: async (source, code) => {
      await confirmerParLeCode({
        client: clientPour(source, 2),
        module: moduleDe(source),
        code,
        jetons: persistance.jetonMyffbad,
        attentes,
        horloge: horlogeSysteme,
      });
    },

    codesAttendus: () =>
      attentes
        .enCours(horlogeSysteme.maintenant())
        .map(({ source, demandeeLe }) => ({ source, demandeeLe })),

    /**
     * Le premier temps de 027 : obtenir la page, pas la comprendre.
     *
     * Aucun parseur, aucune table. La capture est archivée par le décorateur
     * `enArchivant` comme toute requête sortante, et c'est elle qu'on lira pour
     * dessiner la suite — l'ordre que 015 a fixé et que 019 rend rejouable :
     * `npm run capture -- <id>`.
     */
    // Le bouton de dépannage : la même passe que le planificateur déclenche
    // chaque matin, comme celui du classement (001, 018).
    releverLesEngagements: relverLesEngagements,

    // Un décompte, plus la table : depuis 002 la liste vit sur `/mon-profil`.
    // `/sources` porte l'exploitation, la feature porte la donnée (030).
    engagements: () => persistance.engagements.compter(),

    // Le premier temps de 002 : atteindre la fiche publique et l'archiver.
    // Aucun parseur ne la lit encore — c'est la capture qu'elle laisse qui
    // servira à en écrire un (015).
    releverLesTournois: relverLesTournois,

    sonder: () =>
      sonder({
        modules: modulesDAcquisition,
        clientPour,
        jetons: persistance.jetonMyffbad,
        rapports,
        horloge: horlogeSysteme,
      }),

    // La passe de 001, élargie à l'équipe par 028. C'est exactement la
    // fonction que l'ordonnanceur appelle chaque vendredi (018) : le bouton
    // n'est plus qu'un dépannage, la passe est la même.
    relever,

    // L'historique, que 019 réclame : par mail seul on ne voit que les échecs,
    // jamais la semaine qui s'est bien passée. `derniers` était déclaré depuis
    // 017 et n'était appelé nulle part.
    rapports: () => rapports.derniers(50),

    ordonnancement: () => ordonnanceur.etat(),
    reglerLaTache: (reglage) => ordonnanceur.regler(reglage),

    courrier: () => courrier.etat(),

    // Par la boîte d'envoi, comme tout le reste : un bouton qui emprunterait
    // un autre chemin que celui qu'il prétend vérifier pourrait réussir
    // pendant que le vrai chemin est cassé.
    envoyerUnMailDeTest: () => courrier.deposer(messageDeTest(horlogeSysteme.maintenant())),
  },
});

const serveur = application.listen(configuration.port, () => {
  console.log(`[socle] Bado est disponible à l'adresse http://localhost:${configuration.port}`);
});

// Après le serveur, pas avant : le premier réveil du planificateur est le
// rattrapage de ce qui était dû pendant l'arrêt (018), et il peut lancer une
// passe de plusieurs minutes — autant que l'écran qui en montre le rapport soit
// déjà joignable.
ordonnanceur.demarrer();

// L'application tourne en service supervisé, relancé automatiquement en cas
// d'arrêt (spec 020). Encore faut-il qu'elle s'arrête proprement : une base
// fermée à la volée laisse un journal WAL à rejouer au redémarrage.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[socle] ${signal} reçu, arrêt`);
    // Le planificateur en premier : une minuterie qui se réveille pendant la
    // fermeture ouvrirait une passe sur une base qu'on est en train de fermer.
    ordonnanceur.arreter();
    serveur.close(() => {
      persistance.fermer();
      process.exit(0);
    });
  });
}
