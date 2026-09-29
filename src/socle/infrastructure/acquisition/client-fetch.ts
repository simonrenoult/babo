import type { ClientHttp, Requete, Reponse } from "../../core/acquisition.ts";

/**
 * Adaptateur `fetch` du port `ClientHttp` — spec 015.
 *
 * Rien de plus qu'un navigateur sans écran : les redirections sont suivies et
 * l'URL réellement atteinte est rendue, parce que c'est elle — et non le
 * statut, qui reste 200 — qui trahit un renvoi vers la page de connexion.
 *
 * L'agent s'annonce. Babo est un outil personnel dont le risque de
 * bannissement est assumé (015) : se déguiser en navigateur ne réduirait pas
 * ce risque, cela empêcherait seulement l'hébergeur de savoir à qui écrire.
 */
const AGENT = "Babo/0.1 (outil personnel de suivi badminton; contact@simonrenoult.fr)";

const DELAI_MAX = 20_000;

export function clientFetch(options: { readonly delaiMax?: number } = {}): ClientHttp {
  const delaiMax = options.delaiMax ?? DELAI_MAX;

  return {
    async recuperer(requete: Requete): Promise<Reponse> {
      const entetes: Record<string, string> = {
        "user-agent": AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "fr-FR,fr;q=0.9",
        ...requete.entetes,
      };
      if (requete.jeton !== null) entetes["cookie"] = requete.jeton;

      // `AbortSignal.timeout` plutôt qu'un `setTimeout` à démonter : une passe
      // quotidienne qui reste pendue sur une socket ne se signale jamais.
      const reponse = await fetch(requete.url, {
        method: requete.methode ?? "GET",
        headers: entetes,
        ...(requete.corps === undefined ? {} : { body: requete.corps }),
        redirect: "follow",
        signal: AbortSignal.timeout(delaiMax),
      });

      return {
        url: reponse.url,
        statutHttp: reponse.status,
        contenu: await reponse.text(),
        // `getSetCookie` et non `get` : une connexion en pose plusieurs, et
        // `get` les recollerait en une chaîne qu'aucun parseur ne redécoupe.
        cookies: reponse.headers.getSetCookie(),
      };
    },
  };
}

/**
 * Un fichier binaire, un PDF — spec 011.
 *
 * À part du port `ClientHttp`, qui rend du texte parce que tout ce qu'on
 * scrape en est : décoder un PDF en UTF-8 le détruirait. Même agent, même
 * délai, redirections suivies — la feuille de rencontre d'icbad passe par un
 * 302 vers son fichier.
 */
export async function telecharger(
  url: string,
  options: { readonly delaiMax?: number } = {},
): Promise<{ readonly url: string; readonly statutHttp: number; readonly type: string; readonly octets: Uint8Array }> {
  const reponse = await fetch(url, {
    headers: { "user-agent": AGENT, accept: "application/pdf,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(options.delaiMax ?? DELAI_MAX),
  });
  return {
    url: reponse.url,
    statutHttp: reponse.status,
    type: reponse.headers.get("content-type") ?? "",
    octets: new Uint8Array(await reponse.arrayBuffer()),
  };
}
