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
import type { Licence } from "./socle/core/licence.ts";
import { clientFetch } from "./socle/infrastructure/acquisition/client-fetch.ts";
import { creerModuleMyffbad } from "./socle/infrastructure/acquisition/myffbad.ts";
import { moduleBadnet } from "./socle/infrastructure/acquisition/badnet.ts";
import { creerModuleMonProfil } from "./mon-profil/presentation/module-web.ts";
import { creerModuleCapitanat } from "./capitanat/presentation/module-web.ts";
import { ImportRefuse } from "./capitanat/core/coequipier.ts";
import { depotCoequipiersSqlite } from "./capitanat/infrastructure/depot-coequipiers-sqlite.ts";
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
    rapports: persistance.rapports,
    horloge: horlogeSysteme,
  });
};

const application = creerApplication({
  configuration,
  modules: [
    creerModuleMonProfil({
      licence: configuration.licence,
      classements: persistance.classements,
    }),
    creerModuleCapitanat({
      coequipiers,
      identites: persistance.identites,
      classements: persistance.classements,
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
          persistance.rapports.dernierRapport(tacheDAcquisition(module.source)),
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
        rapports: persistance.rapports,
        horloge: horlogeSysteme,
      }),

    // La passe de 001, élargie à l'équipe par 028, déclenchée à la main tant
    // que 018 n'ordonnance rien. C'est la même fonction que l'ordonnanceur
    // appellera : le bouton disparaîtra, la passe restera.
    relever,
  },
});

const serveur = application.listen(configuration.port, () => {
  console.log(`[socle] Bado est disponible à l'adresse http://localhost:${configuration.port}`);
});

// L'application tourne en service supervisé, relancé automatiquement en cas
// d'arrêt (spec 020). Encore faut-il qu'elle s'arrête proprement : une base
// fermée à la volée laisse un journal WAL à rejouer au redémarrage.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[socle] ${signal} reçu, arrêt`);
    serveur.close(() => {
      persistance.fermer();
      process.exit(0);
    });
  });
}
