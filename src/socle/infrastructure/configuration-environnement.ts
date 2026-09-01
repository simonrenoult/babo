import type { Configuration } from "../core/configuration.ts";

/**
 * Lecture de la configuration du serveur — spec 020.
 *
 * Adaptateur : le `core` décrit ce dont l'application a besoin, l'environnement
 * est un détail d'infrastructure.
 */
export function configurationDepuisEnvironnement(
  environnement: NodeJS.ProcessEnv = process.env,
): Configuration {
  return {
    port: entier(environnement["BABO_PORT"], 3000),
    base: {
      chemin: environnement["BABO_BASE_CHEMIN"] ?? "data/babo.db",
      cle: obligatoire(environnement, "BABO_BASE_CLE"),
    },
    derriereUnProxy: environnement["BABO_DERRIERE_UN_PROXY"] !== "false",
  };
}

function obligatoire(environnement: NodeJS.ProcessEnv, nom: string): string {
  const valeur = environnement[nom];
  if (valeur === undefined || valeur === "") {
    throw new Error(
      `Variable d'environnement manquante : ${nom}. Voir .env.example — la clé de chiffrement de la base n'a pas de valeur par défaut.`,
    );
  }
  return valeur;
}

function entier(valeur: string | undefined, defaut: number): number {
  if (valeur === undefined) return defaut;
  const nombre = Number.parseInt(valeur, 10);
  if (Number.isNaN(nombre)) throw new Error(`Valeur numérique attendue, reçu « ${valeur} »`);
  return nombre;
}
