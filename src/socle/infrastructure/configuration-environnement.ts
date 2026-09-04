import type { Configuration, ConfigurationCourrier } from "../core/configuration.ts";
import { licence } from "../core/licence.ts";

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
    licence: licence(obligatoire(environnement, "BABO_LICENCE")),
    motDePasseMyffbad: environnement["BABO_MYFFBAD_MOT_DE_PASSE"] || null,
    motDePasse: obligatoire(environnement, "BABO_MOT_DE_PASSE"),
    secretDuJeton: obligatoire(environnement, "BABO_SECRET_JETON"),
    base: {
      chemin: environnement["BABO_BASE_CHEMIN"] ?? "data/babo.db",
      cle: obligatoire(environnement, "BABO_BASE_CLE"),
    },
    derriereUnProxy: environnement["BABO_DERRIERE_UN_PROXY"] !== "false",
    courrier: courrier(environnement),
  };
}

/**
 * Le compte SMTP, ou `null` s'il manque quoi que ce soit — spec 016.
 *
 * Tout ou rien : un hôte sans mot de passe ou un expéditeur sans destinataire
 * ne produit pas un courrier à moitié configuré, il produit un courrier absent,
 * que l'écran annonce comme tel. Une configuration partielle qui démarrerait
 * ferait croire qu'on alerte alors qu'on n'alerte pas — le mode de panne exact
 * que 019 combat.
 */
function courrier(environnement: NodeJS.ProcessEnv): ConfigurationCourrier | null {
  const hote = environnement["BABO_SMTP_HOTE"] ?? "smtp.gmail.com";
  const utilisateur = environnement["BABO_SMTP_UTILISATEUR"] ?? "";
  const motDePasse = environnement["BABO_SMTP_MOT_DE_PASSE"] ?? "";
  const expediteur = environnement["BABO_MAIL_EXPEDITEUR"] ?? "";
  const destinataire = environnement["BABO_MAIL_DESTINATAIRE"] ?? "";

  if ([hote, utilisateur, motDePasse, expediteur, destinataire].some((valeur) => valeur === "")) {
    return null;
  }

  return {
    hote,
    port: entier(environnement["BABO_SMTP_PORT"], 465),
    utilisateur,
    motDePasse,
    expediteur,
    destinataire,
  };
}

function obligatoire(environnement: NodeJS.ProcessEnv, nom: string): string {
  const valeur = environnement[nom];
  if (valeur === undefined || valeur === "") {
    throw new Error(
      `Variable d'environnement manquante : ${nom}. Voir .env.example.`,
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
