import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChargeDuJeton, SignatureDeJeton } from "../../core/authentification.ts";

/**
 * Adaptateur du port `SignatureDeJeton` : un JWT HS256 — spec 021.
 *
 * Écrit ici plutôt qu'emprunté à une bibliothèque, pour la même raison qui a
 * fait refuser `multer` à 005 : c'est un HMAC sur deux segments encodés, et la
 * dépendance coûterait plus à auditer que ces quarante lignes. Trois précautions
 * suffisent, et elles y sont : l'algorithme est vérifié avant la signature — un
 * jeton annonçant `none` est refusé, jamais accepté sur parole —, la
 * comparaison est à temps constant, et la charge est relue depuis le segment
 * signé, pas depuis ce que l'appelant croit savoir.
 *
 * Le secret vit dans la configuration du serveur, jamais en base : il sert
 * justement à protéger ce qui y est rangé. Le changer invalide tous les jetons
 * d'un coup — c'est le seul levier de révocation d'un jeton sans état, et 021
 * l'assume.
 */
const ENTETE = { alg: "HS256", typ: "JWT" } as const;

export function jetonHmac(secret: string): SignatureDeJeton {
  const entete = enBase64Url(Buffer.from(JSON.stringify(ENTETE)));

  const signer = (corps: string): Buffer =>
    createHmac("sha256", secret).update(corps).digest();

  return {
    signer(charge: ChargeDuJeton): string {
      const charge64 = enBase64Url(
        Buffer.from(
          JSON.stringify({
            sub: charge.licence,
            cnx: Math.floor(charge.connecteLe.getTime() / 1000),
            exp: Math.floor(charge.expireLe.getTime() / 1000),
          }),
        ),
      );
      const corps = `${entete}.${charge64}`;
      return `${corps}.${enBase64Url(signer(corps))}`;
    },

    lire(jeton: string): ChargeDuJeton | null {
      const segments = jeton.split(".");
      if (segments.length !== 3) return null;
      const [entete64, charge64, signature64] = segments as [string, string, string];

      const annonce = lireLeJson(entete64);
      // L'algorithme est le nôtre ou rien : accepter celui que le jeton annonce
      // est la faille classique des JWT, et `none` la rendrait triviale.
      if (annonce?.["alg"] !== ENTETE.alg || annonce["typ"] !== ENTETE.typ) return null;

      const attendue = signer(`${entete64}.${charge64}`);
      const presentee = Buffer.from(signature64, "base64url");
      if (presentee.length !== attendue.length) return null;
      if (!timingSafeEqual(presentee, attendue)) return null;

      const charge = lireLeJson(charge64);
      if (charge === null) return null;
      const { sub, cnx, exp } = charge;
      if (typeof sub !== "string" || typeof cnx !== "number" || typeof exp !== "number") {
        return null;
      }

      return { licence: sub, connecteLe: new Date(cnx * 1000), expireLe: new Date(exp * 1000) };
    },
  };
}

function enBase64Url(octets: Buffer): string {
  return octets.toString("base64url");
}

function lireLeJson(segment: string): Record<string, unknown> | null {
  try {
    const valeur: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return typeof valeur === "object" && valeur !== null ? (valeur as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
