import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configurationDepuisEnvironnement } from "./socle/infrastructure/configuration-environnement.ts";
import { ouvrirLaPersistance } from "./socle/infrastructure/base/persistance.ts";
import { SOURCES } from "./socle/core/source.ts";

/**
 * Sortir une capture de la base pour corriger un parseur — spec 019.
 *
 *     npm run capture              # les dernières captures, par source
 *     npm run capture -- 42        # écrit la capture 42 dans un fichier
 *
 * Corriger un parseur est un geste de développement, pas d'exploitation : la
 * capture doit atterrir dans un fichier à côté des tests, ce qu'un écran web ne
 * fait pas bien. C'est aussi la première utilisation de `parIdentifiant`,
 * déclaré depuis 017 et jamais appelé.
 *
 * Sans lui, la base étant chiffrée (SQLCipher), « ouvrir le fichier » suppose
 * un client SQLCipher et la clé sous la main. Ce n'est pas ce qu'on veut avoir
 * à faire un vendredi soir pour comprendre pourquoi une classe CSS a bougé.
 */
const EXEMPLES = "src/socle/infrastructure/acquisition/exemples";

const configuration = configurationDepuisEnvironnement();
const persistance = ouvrirLaPersistance(configuration.base);

try {
  const demande = process.argv[2];
  if (demande === undefined) lister();
  else extraire(demande);
} catch (erreur) {
  // Un message, pas une pile d'appels : c'est un outil qu'on ouvre parce que
  // quelque chose est déjà cassé, et une trace de plus n'aide personne.
  console.error(erreur instanceof Error ? erreur.message : String(erreur));
  process.exitCode = 1;
} finally {
  persistance.fermer();
}

function lister(): void {
  console.log(`${persistance.captures.compter()} capture(s) archivée(s).\n`);

  for (const source of SOURCES) {
    const dernieres = persistance.captures.dernieres(source, 10);
    console.log(`# ${source}`);
    if (dernieres.length === 0) console.log("  aucune capture");

    for (const capture of dernieres) {
      const taille = `${Math.round(capture.contenu.length / 1024)} Ko`;
      console.log(
        `  ${String(capture.id).padStart(6)}  ${capture.captureeLe.toISOString()}  ` +
          `${String(capture.statutHttp).padStart(3)}  ${taille.padStart(8)}  ${capture.url}`,
      );
    }
    console.log("");
  }

  console.log("npm run capture -- <id> écrit une capture dans un fichier.");
}

function extraire(demande: string): void {
  const id = Number(demande);
  if (!Number.isInteger(id)) {
    throw new Error(`« ${demande} » n'est pas un identifiant de capture.`);
  }

  const capture = persistance.captures.parIdentifiant(id);
  if (capture === null) throw new Error(`Aucune capture ${id} en base.`);

  const chemin = join(EXEMPLES, `capture-${id}${extension(capture.contenu)}`);

  // Jamais d'écrasement : les fixtures de ce dossier sont choisies à la main et
  // servent aux tests. Une extraction qui les recouvrirait ferait passer un
  // outil de dépannage pour un casseur de suite de tests.
  if (existsSync(chemin)) throw new Error(`${chemin} existe déjà : le déplacer ou le supprimer.`);

  writeFileSync(chemin, capture.contenu, "utf8");
  console.log(`${capture.source} ${capture.url}`);
  console.log(`capturée le ${capture.captureeLe.toISOString()}, statut ${capture.statutHttp}`);
  console.log(`écrite dans ${chemin}`);
}

/**
 * Deviné sur le contenu et non sur l'URL : myffbad rend ses données par appels
 * de fonctions serveur, dont l'URL ne dit rien du format — la fiche est du HTML,
 * l'action `classement` un flux de lignes.
 */
function extension(contenu: string): string {
  return contenu.trimStart().startsWith("<") ? ".html" : ".txt";
}
