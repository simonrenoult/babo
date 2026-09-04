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
} from "./socle/core/acquisition.ts";
import { sonder } from "./socle/core/sonde.ts";
import { plafondDeLaPasse, releverLesClassements } from "./socle/core/passe-classement.ts";
import { seConnecter } from "./socle/core/connexion.ts";
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
import { clientFetch } from "./socle/infrastructure/acquisition/client-fetch.ts";
import { creerModuleMyffbad } from "./socle/infrastructure/acquisition/myffbad.ts";
import { moduleBadnet } from "./socle/infrastructure/acquisition/badnet.ts";
import { creerModuleMonProfil } from "./mon-profil/presentation/module-web.ts";
import { creerModuleCapitanat } from "./capitanat/presentation/module-web.ts";
import { ImportRefuse } from "./capitanat/core/coequipier.ts";
import { depotCoequipiersSqlite } from "./capitanat/infrastructure/depot-coequipiers-sqlite.ts";
import { depotPreferencesSqlite } from "./capitanat/infrastructure/depot-preferences-sqlite.ts";
import { lireLeCsvDeLEquipe } from "./capitanat/infrastructure/csv-equipe.ts";
import { moduleVeille } from "./veille/presentation/module-web.ts";

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
  fraicheur(
    vuLe,
    persistance.reglages.lire(tacheDAcquisition("myffbad"))?.cadence ??
      tachesOrdonnancees[0]!.reglageParDefaut.cadence,
    horlogeSysteme.maintenant(),
  );

const application = creerApplication({
  authentification,
  configuration,
  modules: [
    creerModuleMonProfil({
      licence: configuration.licence,
      classements: persistance.classements,
      fraicheur: fraicheurDuClassement,
    }),
    creerModuleCapitanat({
      coequipiers,
      identites: persistance.identites,
      classements: persistance.classements,
      preferences: preferencesDuCapitaine,
      fraicheur: fraicheurDuClassement,
      horloge: horlogeSysteme,
    }),
    moduleVeille,
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
          module.connexion !== undefined && configuration.motDePasseMyffbad !== null,
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
      const module = modulesDAcquisition.find((candidat) => candidat.source === source);
      if (module === undefined) throw new Error(`Source sans module d'acquisition : ${source}`);
      if (configuration.motDePasseMyffbad === null) {
        throw new Error("BABO_MYFFBAD_MOT_DE_PASSE n'est pas renseigné : voir .env.example.");
      }

      await seConnecter({
        client: clientPour(source, 2),
        module,
        motDePasse: configuration.motDePasseMyffbad,
        jetons: persistance.jetonMyffbad,
        horloge: horlogeSysteme,
      });
    },

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
