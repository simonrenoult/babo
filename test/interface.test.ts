import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { ouvrirLaPersistance } from "../src/socle/infrastructure/base/persistance.ts";
import { creerApplication } from "../src/socle/presentation/serveur.ts";
import { creerModuleMonProfil } from "../src/mon-profil/presentation/module-web.ts";
import { creerModuleCapitanat } from "../src/capitanat/presentation/module-web.ts";
import { depotCoequipiersSqlite } from "../src/capitanat/infrastructure/depot-coequipiers-sqlite.ts";
import { lireLeCsvDeLEquipe } from "../src/capitanat/infrastructure/csv-equipe.ts";
import { ImportRefuse } from "../src/capitanat/core/coequipier.ts";
import { moduleVeille } from "../src/veille/presentation/module-web.ts";
import { etatDeLaSource, tacheDAcquisition } from "../src/socle/core/acquisition.ts";
import { SOURCES } from "../src/socle/core/source.ts";
import { licence } from "../src/socle/core/licence.ts";
import type { ClientHttp } from "../src/socle/core/acquisition.ts";
import { sousPlafond } from "../src/socle/core/acquisition.ts";
import { creerModuleMyffbad } from "../src/socle/infrastructure/acquisition/myffbad.ts";
import { plafondDeLaPasse, releverLesClassements } from "../src/socle/core/passe-classement.ts";
import { horlogeSysteme } from "../src/socle/core/horloge.ts";
import type { RapportArchive } from "../src/socle/core/rapport-execution.ts";
import { creerAuthentification } from "../src/socle/core/authentification.ts";
import { jetonHmac } from "../src/socle/infrastructure/authentification/jeton-hmac.ts";
import { motDePasseScrypt } from "../src/socle/infrastructure/authentification/mot-de-passe-scrypt.ts";

/**
 * L'assemblage réel, tel que `main.ts` le monte : c'est le seul endroit du
 * dépôt, avec le point de composition, qui a le droit de tout connaître.
 */
/**
 * Les deux captures réelles, rejouées à la place du réseau — spec 028.
 *
 * Tout le reste est vrai : les parseurs, les dépôts, la passe, la page. Seul le
 * transport est doublé, parce qu'un test qui appelle myffbad dépendrait de
 * myffbad — et parce que 015 assume un risque de bannissement qu'une suite de
 * tests n'a pas à consommer.
 */
/** Long à dessein : la licence n'étant pas un secret, tout tient au mot de passe (021). */
const MOT_DE_PASSE = "un-mot-de-passe-de-test-suffisamment-long";

const CAPTURES = {
  fiche: readFileSync(
    new URL("../src/socle/infrastructure/acquisition/exemples/myffbad-fiche.html", import.meta.url),
    "utf8",
  ),
  classement: readFileSync(
    new URL("../src/socle/infrastructure/acquisition/exemples/myffbad-classement.txt", import.meta.url),
    "utf8",
  ),
};

/** Un réseau qui rend la fiche sur un GET et le classement sur l'action. */
function reseauRejoue(): ClientHttp & { requetes: number; jetons: (string | null)[] } {
  const trace = {
    requetes: 0,
    /** Les sessions réellement présentées. Doit rester vide (028). */
    jetons: [] as (string | null)[],
    recuperer: (requete: { url: string; methode?: string; jeton: string | null }) => {
      trace.requetes += 1;
      if (requete.jeton !== null) trace.jetons.push(requete.jeton);
      // Une licence inconnue de la capture : myffbad rendrait la fiche de
      // quelqu'un d'autre ou rien du tout. On rend la même, et c'est le
      // contrôle de licence du parseur qui doit s'en apercevoir (028).
      return Promise.resolve({
        url: requete.url,
        statutHttp: 200,
        contenu: requete.methode === "POST" ? CAPTURES.classement : CAPTURES.fiche,
        cookies: [],
      });
    },
  };
  return trace;
}

describe("l'application assemblée", () => {
  let dossier: string;
  let serveur: Server;
  let base: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let coequipiers: ReturnType<typeof depotCoequipiersSqlite>;

  let reseau: ReturnType<typeof reseauRejoue>;
  let passe: () => Promise<RapportArchive>;
  let cookie: string;
  let authentification: ReturnType<typeof creerAuthentification>;

  /** Toute requête porte le cookie : la porte de 021 est réelle dans ce montage. */
  function visiter(chemin: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${base}${chemin}`, {
      ...options,
      headers: { ...(options.headers ?? {}), cookie },
      redirect: "manual",
    });
  }

  before(async () => {
    dossier = mkdtempSync(join(tmpdir(), "babo-interface-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: "clé-de-test" });
    coequipiers = depotCoequipiersSqlite(persistance.base);
    reseau = reseauRejoue();

    authentification = creerAuthentification({
      comptes: persistance.compte,
      hachage: motDePasseScrypt(),
      signature: jetonHmac("secret-de-test"),
      horloge: horlogeSysteme,
    });
    authentification.poserLeCompte(licence("07194591"), MOT_DE_PASSE);

    const moduleMyffbad = creerModuleMyffbad(licence("07194591"));
    passe = () => {
      const licences = [
        ...new Set([licence("07194591"), ...coequipiers.tous().map(({ licence: numero }) => numero)]),
      ];
      return releverLesClassements({
        // Sous plafond, comme dans `main.ts` : c'est le garde-fou qu'on veut
        // voir tenir sur une équipe entière, pas seulement sur un joueur.
        client: sousPlafond(reseau, plafondDeLaPasse(licences.length)),
        module: moduleMyffbad,
        licences,
        identites: persistance.identites,
        classements: persistance.classements,
        rapports: persistance.rapports,
        horloge: horlogeSysteme,
      });
    };

    const application = creerApplication({
      configuration: {
        port: 0,
        base: { chemin: join(dossier, "babo.db"), cle: "clé-de-test" },
        licence: licence("07194591"),
        motDePasseMyffbad: null,
        motDePasse: MOT_DE_PASSE,
        secretDuJeton: "secret-de-test",
        // `false` : le test parle en clair à 127.0.0.1, et un cookie `Secure`
        // n'y reviendrait jamais. En production le proxy de 020 impose HTTPS.
        derriereUnProxy: false,
        courrier: null,
      },
      modules: [
        creerModuleMonProfil({
          licence: licence("07194591"),
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
      authentification,
      sources: {
        etats: () =>
          SOURCES.map((source) =>
            etatDeLaSource(
              source,
              persistance.jetonMyffbad.lire(source),
              persistance.rapports.dernierRapport(tacheDAcquisition(source)),
              new Date(),
            ),
          ),
        enregistrer: (source, valeur) =>
          persistance.jetonMyffbad.enregistrer(source, {
            valeur,
            obtenuLe: new Date(),
            expireLe: new Date(Date.now() + 86_400_000),
          }),
        oublier: (source) => persistance.jetonMyffbad.effacer(source),
        deploiements: () => [],
        // La connexion touche au réseau : l'assemblage vérifie le montage.
        connecter: () => Promise.resolve(),
        // La sonde touche au réseau : l'assemblage vérifie qu'elle est montée,
        // pas qu'elle atteint les sites fédéraux.
        sonder: () => Promise.resolve([]),
        // La passe touche au réseau : idem, l'assemblage vérifie le montage.
        relever: () => Promise.reject(new Error("passe non branchée dans ce test")),
        // L'ordonnancement se teste sur son propre cœur (018) : ici on vérifie
        // que l'écran le monte, pas que la minuterie bat.
        courrier: () => ({
          configure: false,
          destinataire: null,
          enAttente: 0,
          derniers: [],
        }),
        envoyerUnMailDeTest: () => Promise.reject(new Error("pas de courrier dans ce test")),
        ordonnancement: () => [],
        reglerLaTache: () => {},
        // L'import enchaîne la passe (028), et le tout est vrai sauf le
        // réseau : parseurs, dépôts, passe, page. C'est la chaîne entière, du
        // téléversement à l'affichage, que ce test tient.
        importerLEquipe: async (csv) => {
          let equipe;
          try {
            equipe = lireLeCsvDeLEquipe(csv);
            coequipiers.remplacer(equipe);
          } catch (erreur) {
            if (erreur instanceof ImportRefuse) return { issue: "refusee", motifs: erreur.motifs };
            throw erreur;
          }
          return { issue: "importee", membres: equipe.length, releve: await passe() };
        },
      },
    });

    serveur = application.listen(0);
    await new Promise((resoudre) => serveur.once("listening", resoudre));
    const adresse = serveur.address();
    if (adresse === null || typeof adresse === "string") throw new Error("port inattendu");
    base = `http://127.0.0.1:${adresse.port}`;

    // La porte est vraie dans cet assemblage (021) : le reste des tests entre
    // par la même route qu'un navigateur, cookie compris.
    const connexion = authentification.connecter("07194591", MOT_DE_PASSE);
    if (connexion.issue !== "ouverte") throw new Error("connexion refusée à la mise en place");
    cookie = `bado_session=${connexion.jeton}`;
  });

  after(() => {
    serveur.close();
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("sert l'accueil avec l'état réel de la base", async () => {
    const reponse = await visiter(`/`);
    assert.equal(reponse.status, 200);
    assert.match(await reponse.text(), /Captures archivées/);
  });

  it("dit sur mon profil qu'aucune passe n'a abouti, plutôt qu'un tableau de tirets", async () => {
    // Un tableau de tirets se confondrait avec un joueur non classé (spec 001).
    const reponse = await visiter(`/mon-profil`);

    assert.match(await reponse.text(), /aucun relevé/i);
  });

  it("sert sur mon profil ce que la passe a écrit en base", async () => {
    // La chaîne base → page, celle que le parseur rejoué seul ne prouve pas.
    persistance.classements.relever(
      licence("07194591"),
      [
        { discipline: "simple", lettre: "D9", cpph: 936 },
        { discipline: "double", lettre: "D8", cpph: 1311 },
        { discipline: "mixte", lettre: "D9", cpph: 1007 },
      ],
      new Date("2026-09-01T05:00:00Z"),
    );

    const corps = await (await visiter(`/mon-profil`)).text();

    assert.match(corps, /07194591/);
    assert.match(corps, /D9/);
    assert.match(corps, /1\s?311/, "le CPPH, formaté en français");
    assert.doesNotMatch(corps, /aucun relevé/i);
  });

  it("dit sur le capitanat qu'aucune équipe n'est importée", async () => {
    const reponse = await visiter(`/capitanat`);

    assert.match(await reponse.text(), /Aucune équipe importée/);
  });

  it("importe un CSV déposé depuis les sources, et l'affiche sur le capitanat", async () => {
    // La chaîne entière : téléversement en `text/csv`, parseur, base, page.
    const reponse = await visiter(`/sources/equipe`, {
      method: "POST",
      headers: { "content-type": "text/csv; charset=utf-8" },
      body: "licence;sexe;telephone\n07194591;M;06 12 34 56 78\n02345678;F;0612345679\n",
    });
    assert.equal(reponse.status, 200);
    assert.match(await reponse.text(), /2<\/strong>\s*membres importés/);

    const corps = await (await visiter(`/capitanat`)).text();

    assert.match(corps, /tel:0612345678/, "le téléphone est cliquable");
    assert.match(corps, /https:\/\/www\.myffbad\.fr\/joueur\/07194591/, "et la fiche liée");
    assert.match(corps, /02345678/);
    assert.doesNotMatch(corps, /Aucune équipe importée/);
  });

  it("relève le nom et le classement dans la foulée de l'import", async () => {
    // La deuxième vérification que 028 exige : pas seulement les parseurs
    // rejoués, mais la chaîne fiche → personId → action → base → page.
    const corps = await (await visiter(`/capitanat`)).text();

    assert.match(corps, /Simon RENOULT/, "le nom relevé sur la fiche publique");
    assert.match(corps, /D9/);
    assert.match(corps, /1\s?311/, "le CPPH du double, formaté en français");
    assert.doesNotMatch(corps, /Noms et classements non encore relevés/);
  });

  it("laisse la ligne du coéquipier introuvable, sans la faire passer pour non classée", async () => {
    // Le réseau rejoué rend toujours la fiche de 07194591 : la licence
    // 02345678 reçoit donc la fiche de quelqu'un d'autre, et c'est le contrôle
    // de licence du parseur qui la laisse muette (028). Une case vide ne doit
    // jamais pouvoir se lire comme « non classé ».
    const corps = await (await visiter(`/capitanat`)).text();

    assert.match(corps, /1 membre\s+sans relevé/);
    assert.match(corps, /non relevé/);
  });

  /**
   * Les cinq tableaux, sur l'assemblage réel — spec 029.
   *
   * L'équipe importée plus haut est celle d'un début de saison : un homme
   * relevé sur ses trois disciplines, une femme dont la licence reste muette.
   * C'est exactement l'effectif qui rend les manques visibles.
   */
  it("nomme sur l'index les tableaux que l'effectif ne permet pas de remplir", async () => {
    const corps = await (await visiter(`/capitanat`)).text();

    assert.match(corps, /5 tableaux\s+que l'effectif ne permet pas de remplir/);
    assert.match(corps, /Double dames \(il manque deux femmes classées en double\)/);
    assert.match(corps, /Double mixte \(il manque une femme classée en mixte\)/);
    assert.match(corps, /href="\/capitanat\/tableau\/DH"/, "et chaque tableau a sa page");
    assert.match(corps, /ne se cumulent pas/, "sans laisser additionner les cinq listes");
  });

  it("range sur la page d'un tableau les alignables, cote et lettre telles quelles", async () => {
    const corps = await (await visiter(`/capitanat/tableau/DH`)).text();

    assert.match(corps, /Double hommes/);
    assert.match(corps, /Simon RENOULT/);
    assert.match(corps, /1\s?311/, "la cote, formatée en français mais jamais convertie");
    assert.match(corps, /D8/);
    assert.match(corps, /il manque\s+un homme classé en double/);
    assert.match(corps, /pas classement officiel/, "le sexe vient du fichier, la page le dit");
  });

  it("nomme à part, sur le tableau, le joueur sans classement dans la discipline", async () => {
    // Une licence muette est presque toujours une licence fausse, pas un joueur
    // faible : la ranger dernière ferait disparaître l'anomalie (029).
    const corps = await (await visiter(`/capitanat/tableau/SD`)).text();

    assert.match(corps, /Hors de l'ordre/);
    assert.match(corps, /02345678/);
    assert.match(corps, /aucune passe n'a abouti pour cette licence/);
  });

  it("accepte un tableau tapé en minuscules, et ignore ce qui n'en est pas un", async () => {
    assert.equal((await visiter(`/capitanat/tableau/mx`)).status, 200);

    const inconnu = await visiter(`/capitanat/tableau/XY`);
    assert.equal(inconnu.status, 404, "le 404 du socle, pas une page vide de sens");
    assert.match(await inconnu.text(), /Page inconnue/);
  });

  it("n'a présenté aucun cookie pour relever l'équipe", async () => {
    // Le cœur de 028 : la passe hebdomadaire ne dépend plus d'une session, donc
    // le vendredi où le jeton est mort, le classement est relevé quand même.
    assert.ok(reseau.requetes > 0, "la passe a bien tourné");
    assert.deepEqual(reseau.jetons, [], "et sans jamais présenter de session");
  });

  it("refuse l'import entier sur une ligne fautive, sans toucher à l'équipe en base", async () => {
    const reponse = await visiter(`/sources/equipe`, {
      method: "POST",
      headers: { "content-type": "text/csv; charset=utf-8" },
      body: "licence;sexe;telephone\n07194591;M;0612345678\n0719;M;0612345679\n",
    });

    assert.equal(reponse.status, 400);
    assert.match(await reponse.text(), /licence invalide/);
    assert.equal(coequipiers.tous().length, 2, "l'équipe précédente est intacte");
  });

  for (const [chemin, attendu] of [
    ["/mon-profil", /Mon profil/],
    ["/capitanat", /Capitanat/],
    ["/veille", /Veille de tournois/],
  ] as const) {
    it(`sert ${chemin}, monté par le point de composition`, async () => {
      const reponse = await visiter(`${chemin}`);
      assert.equal(reponse.status, 200);
      assert.match(await reponse.text(), attendu);
    });
  }

  /**
   * La porte, sur l'assemblage réel — spec 021.
   *
   * Le reste de ce fichier entre avec un cookie valide ; ici on frappe sans.
   * C'est le seul endroit où l'on vérifie que la fermeture tient sur
   * l'application entière, montée comme `main.ts` la monte, et pas seulement
   * sur une route prise à part.
   */
  describe("la porte", () => {
    const sansCookie = (chemin: string, options: RequestInit = {}) =>
      fetch(`${base}${chemin}`, { redirect: "manual", ...options });

    for (const chemin of [
      "/",
      "/mon-profil",
      "/capitanat",
      // Une page ajoutée après le garde ne peut pas l'oublier (021) : 029 en a
      // ajouté cinq d'un coup, celle-ci les représente.
      "/capitanat/tableau/SH",
      "/veille",
      "/sources",
    ]) {
      it(`refuse ${chemin} sans session`, async () => {
        const reponse = await sansCookie(chemin);

        assert.equal(reponse.status, 302);
        assert.match(reponse.headers.get("location") ?? "", /^\/connexion\?motif=absente/);
      });
    }

    it("refuse un formulaire posté sans session, sans le rejouer après connexion", async () => {
      // Un 302 renverrait vers la connexion et perdrait le corps en route.
      // Mieux vaut le dire : 401, et c'est le rechargement qui redemandera.
      const reponse = await sansCookie("/sources/equipe", {
        method: "POST",
        headers: { "content-type": "text/csv; charset=utf-8" },
        body: "licence;sexe;telephone\n",
      });

      assert.equal(reponse.status, 401);
      assert.equal(coequipiers.tous().length, 2, "rien n'a été écrit");
    });

    it("laisse la page de connexion répondre, elle", async () => {
      const reponse = await sansCookie("/connexion");

      assert.equal(reponse.status, 200);
      const corps = await reponse.text();
      assert.match(corps, /Numéro de licence/);
      assert.doesNotMatch(corps, /Capitanat/, "aucune navigation avant d'être entré");
    });

    it("laisse la sonde de vie répondre, mais sans rien dire de la base", async () => {
      // Le superviseur n'a pas de session (020) ; la taille de la base et le
      // nombre de captures ne regardent personne d'autre.
      const dehors = await (await sansCookie("/sante")).json();
      assert.deepEqual(dehors, { statut: "ok" });

      const dedans = (await (await visiter("/sante")).json()) as Record<string, unknown>;
      assert.equal(dedans["statut"], "ok");
      assert.ok(typeof dedans["tailleDeLaBase"] === "number");
    });

    it("refuse le mauvais mot de passe en 401, sans dire laquelle des deux moitiés cloche", async () => {
      const reponse = await sansCookie("/connexion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ licence: "07194591", motDePasse: "faux" }),
      });

      assert.equal(reponse.status, 401);
      assert.match(await reponse.text(), /Licence ou mot de passe incorrect/);
      assert.equal(reponse.headers.get("set-cookie"), null);
    });

    it("ouvre sur le bon mot de passe, et pose un cookie inaccessible au JavaScript", async () => {
      const reponse = await sansCookie("/connexion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ licence: "07194591", motDePasse: MOT_DE_PASSE }),
      });

      assert.equal(reponse.status, 302);
      assert.equal(reponse.headers.get("location"), "/");

      const pose = reponse.headers.get("set-cookie") ?? "";
      assert.match(pose, /^bado_session=/);
      assert.match(pose, /HttpOnly/i);
      assert.match(pose, /SameSite=Strict/i);

      // Et ce cookie ouvre réellement les pages fermées.
      const jeton = pose.split(";")[0] ?? "";
      const page = await fetch(`${base}/capitanat`, { headers: { cookie: jeton } });
      assert.equal(page.status, 200);
    });

    it("ramène là où on allait, mais jamais ailleurs que chez soi", async () => {
      const entrer = (suite: string) =>
        sansCookie("/connexion", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ licence: "07194591", motDePasse: MOT_DE_PASSE, suite }),
        });

      assert.equal((await entrer("/sources")).headers.get("location"), "/sources");
      // `//ailleurs.test` est une URL absolue pour un navigateur : la suivre
      // ferait de la page de connexion un tremplin vers n'importe quel site.
      assert.equal((await entrer("//ailleurs.test")).headers.get("location"), "/");
      assert.equal((await entrer("https://ailleurs.test")).headers.get("location"), "/");
    });

    it("efface le cookie à la déconnexion", async () => {
      const reponse = await visiter("/connexion/deconnexion", { method: "POST" });

      assert.equal(reponse.status, 302);
      assert.equal(reponse.headers.get("location"), "/connexion");
      assert.match(reponse.headers.get("set-cookie") ?? "", /^bado_session=;/);
    });
  });
});
