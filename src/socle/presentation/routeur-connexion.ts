import { Router, type CookieOptions, type Request, type RequestHandler } from "express";
import type { Authentification, VerdictDeSession } from "../core/authentification.ts";

/**
 * La porte, côté HTTP — spec 021.
 *
 * Un seul endroit décide ce qui répond sans jeton : `/connexion`, et `/sante`,
 * que le superviseur interroge. Tout le reste — les pages, les formulaires de
 * `/sources`, l'écran de session myffbad — passe par le garde.
 */
export const COOKIE = "bado_session";

/**
 * `SameSite=Strict` fait aussi office de protection CSRF : aucun formulaire
 * hébergé ailleurs ne peut faire partir une requête avec ce cookie. C'est ce
 * qui dispense d'un jeton anti-CSRF sur chacun des formulaires de `/sources`.
 *
 * `Secure` rend HTTPS obligatoire, ce que 020 assume déjà par son proxy — et
 * `localhost` reste un contexte sûr pour les navigateurs, donc le
 * développement n'en souffre pas.
 */
function options(secure: boolean, expireLe: Date): CookieOptions {
  return { httpOnly: true, secure, sameSite: "strict", expires: expireLe, path: "/" };
}

/** Les chemins qui répondent sans jeton. Volontairement courts et fermés. */
const OUVERTS = new Set(["/connexion", "/sante"]);

/**
 * Le garde. Il pose `reponse.locals.authentifie` pour tout le monde, laisse
 * passer les chemins ouverts, et renvoie les autres vers la connexion.
 *
 * Il renouvelle aussi le cookie quand l'échéance glissante l'exige : c'est le
 * seul endroit traversé par toutes les requêtes, donc le seul qui puisse le
 * faire sans que chaque route y pense.
 */
export function garde(authentification: Authentification, secure: boolean): RequestHandler {
  return (requete, reponse, suite) => {
    const { verdict, renouvele } = authentification.reconnaitre(jetonDuCookie(requete));
    reponse.locals["authentifie"] = verdict === "valide";

    if (renouvele !== null) {
      reponse.cookie(COOKIE, renouvele.jeton, options(secure, renouvele.expireLe));
    }

    if (verdict === "valide" || OUVERTS.has(requete.path)) return suite();

    // Le cookie périmé est effacé en passant : le garder ferait réafficher
    // « session expirée » à chaque visite, longtemps après qu'elle l'est.
    if (verdict !== "absente") reponse.clearCookie(COOKIE, { path: "/" });

    // Une requête qui n'est pas une navigation — un formulaire posté après
    // expiration — n'a rien à faire d'une page de connexion : elle reçoit un
    // 401, et c'est le rechargement qui montrera le formulaire.
    if (requete.method !== "GET") {
      return reponse.status(401).render("erreur", {
        titre: "Session expirée",
        message: "La session a expiré. Se reconnecter, puis recommencer.",
      });
    }

    const voulue = destinationSure(requete.originalUrl);
    reponse.redirect(
      `/connexion?motif=${verdict}${voulue === null ? "" : `&suite=${encodeURIComponent(voulue)}`}`,
    );
  };
}

export function routeurConnexion(authentification: Authentification, secure: boolean): Router {
  const routeur = Router();

  routeur.get("/", (requete, reponse) => {
    // Déjà connecté : rien à faire ici, et réafficher le formulaire inviterait
    // à ressaisir un mot de passe qui n'est pas demandé.
    if (reponse.locals["authentifie"] === true) return reponse.redirect("/");

    reponse.render("connexion", {
      titre: "Connexion",
      motif: motifLisible(requete.query["motif"]),
      suite: destinationSure(String(requete.query["suite"] ?? "")),
      erreur: null,
    });
  });

  routeur.post("/", (requete, reponse) => {
    const licence = String(requete.body?.["licence"] ?? "").trim();
    const motDePasse = String(requete.body?.["motDePasse"] ?? "");
    const suite = destinationSure(String(requete.body?.["suite"] ?? ""));

    const connexion = authentification.connecter(licence, motDePasse);

    if (connexion.issue === "ouverte") {
      reponse.cookie(COOKIE, connexion.jeton, options(secure, connexion.expireLe));
      return reponse.redirect(suite ?? "/");
    }

    // 429 pour le verrou, 401 pour le refus : le journal du proxy distingue
    // ainsi une porte forcée d'une erreur de frappe.
    return reponse.status(connexion.issue === "verrouillee" ? 429 : 401).render("connexion", {
      titre: "Connexion",
      motif: null,
      suite,
      erreur:
        connexion.issue === "verrouillee"
          ? `Trop de tentatives. Réessayer après ${connexion.jusqua.toLocaleTimeString("fr-FR")}.`
          : // Un seul message pour les deux moitiés fausses : la licence n'est
            // pas un secret, dire laquelle cloche ne renseignerait que qui
            // cherche à entrer.
            "Licence ou mot de passe incorrect.",
    });
  });

  routeur.post("/deconnexion", (_requete, reponse) => {
    // Le cookie part, mais le jeton reste valable jusqu'à son échéance : un
    // jeton sans état ne se révoque pas (021). Se déconnecter ferme la porte de
    // ce navigateur, pas celle d'un cookie déjà copié — seule la rotation du
    // secret de signature le peut.
    reponse.clearCookie(COOKIE, { path: "/" });
    reponse.redirect("/connexion");
  });

  return routeur;
}

function jetonDuCookie(requete: Request): string | null {
  const entete = requete.headers.cookie;
  if (entete === undefined) return null;
  for (const morceau of entete.split(";")) {
    const separateur = morceau.indexOf("=");
    if (separateur === -1) continue;
    if (morceau.slice(0, separateur).trim() !== COOKIE) continue;
    return decodeURIComponent(morceau.slice(separateur + 1).trim());
  }
  return null;
}

/** Ce qu'un chemin interne a le droit de contenir. Tout le reste est refusé. */
const CHEMIN_INTERNE = /^[A-Za-z0-9/_.~?=&%-]*$/;

/**
 * La destination d'après connexion, ou `null`.
 *
 * Un chemin interne et rien d'autre : `//ailleurs.test` est une URL absolue
 * pour un navigateur, et la renvoyer telle quelle ferait de la page de
 * connexion un tremplin vers n'importe quel site.
 */
function destinationSure(valeur: string): string | null {
  if (!valeur.startsWith("/") || valeur.startsWith("//")) return null;
  if (!CHEMIN_INTERNE.test(valeur)) return null;
  if (valeur.startsWith("/connexion")) return null;
  return valeur;
}

function motifLisible(motif: unknown): string | null {
  const verdicts: Partial<Record<VerdictDeSession, string>> = {
    expiree: "La session a expiré. Se reconnecter.",
    plafonnee: "La session a atteint sa durée maximale de 90 jours. Ressaisir le mot de passe.",
  };
  return verdicts[String(motif) as VerdictDeSession] ?? null;
}
