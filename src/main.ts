import { configurationDepuisEnvironnement } from "./socle/infrastructure/configuration-environnement.ts";
import { ouvrirLaPersistance } from "./socle/infrastructure/base/persistance.ts";
import { creerApplication } from "./socle/presentation/serveur.ts";
import { moduleProfil } from "./profil/presentation/module-web.ts";
import { moduleCapitanat } from "./capitanat/presentation/module-web.ts";
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

const application = creerApplication({
  configuration,
  modules: [moduleProfil, moduleCapitanat, moduleVeille],
  etatDuSocle: () => ({
    tailleDeLaBase: persistance.taille(),
    captures: persistance.captures.compter(),
  }),
});

const serveur = application.listen(configuration.port, () => {
  console.log(`[socle] Bado écoute sur le port ${configuration.port}`);
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
