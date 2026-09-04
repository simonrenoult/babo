import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientHttp, ModuleDAcquisition, Reponse, Requete } from "./acquisition.ts";
import type { DepotJetonMyffbad, JetonMyffbad } from "./jeton-myffbad.ts";
import {
  CodeHorsDelai,
  ConnexionRefusee,
  confirmerParLeCode,
  creerAttentes,
  demanderUneConnexion,
} from "./connexion.ts";

/**
 * La connexion en deux temps de badnet — spec 027.
 *
 * Le module de test imite ce que badnet fait : une action relevée sur une page
 * publique, un premier POST qui rend le mur du code, un second qui rend la
 * session. Ce qu'on vérifie ici n'est pas le HTML de badnet — personne ne l'a
 * encore vu — mais la mécanique qui l'entoure, et elle, on la connaît.
 */
const DEPART = new Date(2026, 8, 5, 9, 0);
const MINUTE = 60_000;

const ACTION = "f232399d98e01deaa9a63ed008b915e5";

function reponse(champs: Partial<Reponse>): Reponse {
  return {
    url: "https://badnet.fr/index.php",
    statutHttp: 200,
    contenu: "",
    cookies: [],
    ...champs,
  };
}

/** Le mur qui porte l'action, tel que `GET /competitions` le rend. */
const MUR_DE_CONNEXION = reponse({
  url: "https://badnet.fr/competitions",
  contenu: `<form method="post" action="index.php"><input name="ic_a" type="hidden" value="${ACTION}"><input name="login"><input name="pwd"></form>`,
});

const MUR_DU_CODE = reponse({
  contenu: `<form><input name="ic_a" type="hidden" value="${ACTION}"><input name="code"></form>`,
});

const SESSION = reponse({ cookies: ["PHPSESSID=abcdef123; Path=/; HttpOnly"] });

function moduleEnDeuxTemps(): ModuleDAcquisition {
  return {
    source: "badnet",
    pagesDeLaSonde: () => [],
    murDeConnexion: (candidate) => /name="login"/.test(candidate.contenu),
    connexion: {
      prealable: {
        requete: () => ({ url: "https://badnet.fr/competitions", jeton: null }),
        lireLAction: (candidate) =>
          /name="ic_a" type="hidden" value="([a-f0-9]+)"/.exec(candidate.contenu)?.[1] ?? null,
      },
      requete: ({ identifiant, motDePasse, action }) => ({
        url: "https://badnet.fr/index.php",
        jeton: null,
        methode: "POST",
        corps: new URLSearchParams({ ic_a: action ?? "", login: identifiant, pwd: motDePasse }).toString(),
      }),
      jetonDepuisLesCookies: (cookies) =>
        cookies.map((cookie) => /(PHPSESSID=[^;]+)/.exec(cookie)?.[1]).find((v) => v !== undefined) ??
        null,
      deuxiemeTemps: {
        reclameUnCode: (candidate) => /name="code"/.test(candidate.contenu),
        confirmation: (code, cookies) => ({
          url: "https://badnet.fr/index.php",
          jeton: cookies.join("; "),
          methode: "POST",
          corps: new URLSearchParams({ code }).toString(),
        }),
      },
    },
  };
}

function client(reponses: readonly Reponse[]): ClientHttp & { readonly vues: Requete[] } {
  const vues: Requete[] = [];
  let rang = 0;
  return {
    vues,
    recuperer: (requete) => {
      vues.push(requete);
      const suivante = reponses[rang] ?? reponses.at(-1);
      rang += 1;
      return Promise.resolve(suivante!);
    },
  };
}

function depotJetons(): DepotJetonMyffbad & { readonly enregistres: JetonMyffbad[] } {
  const enregistres: JetonMyffbad[] = [];
  return {
    enregistres,
    lire: () => enregistres.at(-1) ?? null,
    enregistrer: (_source, jeton) => void enregistres.push(jeton),
    effacer: () => {},
  };
}

function horlogeMobile(depart: Date) {
  let maintenant = depart;
  return {
    maintenant: () => maintenant,
    avancerDe: (millisecondes: number) => {
      maintenant = new Date(maintenant.getTime() + millisecondes);
    },
  };
}

function atelier(reponses: readonly Reponse[]) {
  const horloge = horlogeMobile(DEPART);
  return {
    horloge,
    client: client(reponses),
    module: moduleEnDeuxTemps(),
    jetons: depotJetons(),
    attentes: creerAttentes(),
  };
}

describe("le premier temps", () => {
  it("relève l'action sur la page publique avant de poster", async () => {
    const outils = atelier([MUR_DE_CONNEXION, MUR_DU_CODE]);

    await demanderUneConnexion({ ...outils, identifiant: "07194591", motDePasse: "secret" });

    assert.equal(outils.client.vues[0]?.url, "https://badnet.fr/competitions");
    assert.equal(outils.client.vues[0]?.methode, undefined, "le préalable est un simple GET");
    // L'action relevée voyage dans le corps : c'est ce qui évite qu'une
    // connexion casse en silence le jour d'un déploiement.
    assert.match(outils.client.vues[1]?.corps ?? "", new RegExp(`ic_a=${ACTION}`));
  });

  it("poste la licence comme nom d'utilisateur", async () => {
    const outils = atelier([MUR_DE_CONNEXION, MUR_DU_CODE]);

    await demanderUneConnexion({ ...outils, identifiant: "07194591", motDePasse: "secret" });

    assert.match(outils.client.vues[1]?.corps ?? "", /login=07194591/);
  });

  it("rend `code-attendu` et n'écrit aucun jeton", async () => {
    const outils = atelier([MUR_DE_CONNEXION, MUR_DU_CODE]);

    const resultat = await demanderUneConnexion({
      ...outils,
      identifiant: "07194591",
      motDePasse: "secret",
    });

    assert.equal(resultat.issue, "code-attendu");
    assert.deepEqual(outils.jetons.enregistres, [], "rien en base tant que le code n'est pas donné");
  });

  /**
   * Une 2FA qui ne se déclenche pas, un appareil déjà connu : on ne le saura
   * qu'en essayant. Coder « il y a forcément un code » referait, en miroir,
   * l'erreur de 015 qui affirmait une 2FA myffbad inexistante.
   */
  it("enregistre la session tout de suite quand aucun code n'est réclamé", async () => {
    const outils = atelier([MUR_DE_CONNEXION, SESSION]);

    const resultat = await demanderUneConnexion({
      ...outils,
      identifiant: "07194591",
      motDePasse: "secret",
    });

    assert.equal(resultat.issue, "ouverte");
    assert.equal(outils.jetons.enregistres[0]?.valeur, "PHPSESSID=abcdef123");
  });

  /**
   * Ni session ni code réclamé : le mot de passe est faux. Le distinguer évite
   * d'attendre un mail qui ne viendra jamais.
   */
  it("refuse quand la réponse ne porte ni session ni demande de code", async () => {
    const outils = atelier([MUR_DE_CONNEXION, reponse({ statutHttp: 403, contenu: "non" })]);

    await assert.rejects(
      demanderUneConnexion({ ...outils, identifiant: "07194591", motDePasse: "faux" }),
      ConnexionRefusee,
    );
  });
});

describe("le second temps", () => {
  async function jusquAuCode() {
    const outils = atelier([MUR_DE_CONNEXION, MUR_DU_CODE, SESSION]);
    await demanderUneConnexion({ ...outils, identifiant: "07194591", motDePasse: "secret" });
    return outils;
  }

  it("présente le code et persiste la session obtenue", async () => {
    const outils = await jusquAuCode();

    const jeton = await confirmerParLeCode({ ...outils, code: "123456" });

    assert.equal(jeton.valeur, "PHPSESSID=abcdef123");
    assert.deepEqual(outils.jetons.enregistres, [jeton]);
    assert.match(outils.client.vues[2]?.corps ?? "", /code=123456/);
  });

  /** Sans les cookies du premier temps, badnet ne sait pas de quelle tentative ce code est la suite. */
  it("rejoue les cookies pré-authentifiés du premier temps", async () => {
    const outils = atelier([
      MUR_DE_CONNEXION,
      reponse({ contenu: MUR_DU_CODE.contenu, cookies: ["PHPSESSID=avant; Path=/"] }),
      SESSION,
    ]);
    await demanderUneConnexion({ ...outils, identifiant: "07194591", motDePasse: "secret" });

    await confirmerParLeCode({ ...outils, code: "123456" });

    assert.match(outils.client.vues[2]?.jeton ?? "", /PHPSESSID=avant/);
  });

  it("oublie l'attente une fois la session obtenue", async () => {
    const outils = await jusquAuCode();

    await confirmerParLeCode({ ...outils, code: "123456" });

    // Garder l'attente laisserait un cookie à moitié authentifié en mémoire
    // bien après qu'il ne serve plus.
    assert.deepEqual(outils.attentes.enCours(outils.horloge.maintenant()), []);
  });

  it("refuse un code présenté sans premier temps", async () => {
    const outils = atelier([SESSION]);

    await assert.rejects(confirmerParLeCode({ ...outils, code: "123456" }), CodeHorsDelai);
  });

  /**
   * Un code vit quelques minutes. Laisser l'écran proposer « valider » au-delà
   * ferait croire qu'un code d'il y a une heure marchera.
   */
  it("laisse tomber l'attente au bout de dix minutes", async () => {
    const outils = await jusquAuCode();
    assert.equal(outils.attentes.enCours(outils.horloge.maintenant()).length, 1);

    outils.horloge.avancerDe(11 * MINUTE);

    assert.deepEqual(outils.attentes.enCours(outils.horloge.maintenant()), []);
    await assert.rejects(confirmerParLeCode({ ...outils, code: "123456" }), CodeHorsDelai);
  });

  it("refuse un code faux, sans effacer l'attente", async () => {
    const outils = atelier([MUR_DE_CONNEXION, MUR_DU_CODE, reponse({ contenu: "code invalide" })]);
    await demanderUneConnexion({ ...outils, identifiant: "07194591", motDePasse: "secret" });

    await assert.rejects(confirmerParLeCode({ ...outils, code: "000000" }), ConnexionRefusee);
    // L'attente survit : on retape le code, on ne recommence pas tout.
    assert.equal(outils.attentes.enCours(outils.horloge.maintenant()).length, 1);
  });
});
