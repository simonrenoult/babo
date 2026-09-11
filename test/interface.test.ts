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
import { depotPreferencesSqlite } from "../src/capitanat/infrastructure/depot-preferences-sqlite.ts";
import { depotVeillesSqlite } from "../src/veille/infrastructure/depot-veilles-sqlite.ts";
import { lireLeCsvDeLEquipe } from "../src/capitanat/infrastructure/csv-equipe.ts";
import { ImportRefuse } from "../src/capitanat/core/coequipier.ts";
import { creerModuleVeille } from "../src/veille/presentation/module-web.ts";
import { etatDeLaSource, tacheDAcquisition, tacheDesEngagements } from "../src/socle/core/acquisition.ts";
import { SOURCES } from "../src/socle/core/source.ts";
import { licence } from "../src/socle/core/licence.ts";
import type { ClientHttp } from "../src/socle/core/acquisition.ts";
import { sousPlafond } from "../src/socle/core/acquisition.ts";
import { creerModuleMyffbad } from "../src/socle/infrastructure/acquisition/myffbad.ts";
import { plafondDeLaPasse, releverLesClassements } from "../src/socle/core/passe-classement.ts";
import { horlogeSysteme } from "../src/socle/core/horloge.ts";
import { fraicheur } from "../src/socle/core/fraicheur.ts";
import { creerCourrier, messageDeTest } from "../src/socle/core/courrier.ts";
import { enAlertant } from "../src/socle/core/alerte.ts";
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
/**
 * La cadence réelle de la passe de classement (018) : c'est elle qui sert de
 * seuil de péremption (019), et la relire ici plutôt que d'inventer un nombre
 * garde le test aligné sur ce que l'application fait.
 */
const fraicheurDeTest = (vuLe: Date | null) =>
  fraicheur(vuLe, { nature: "hebdomadaire", jour: 5, heure: 1, minute: 0 }, new Date());

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
  let preferences: ReturnType<typeof depotPreferencesSqlite>;
  let veilles: ReturnType<typeof depotVeillesSqlite>;
  /** Le dépôt décoré de 019 : celui que `main.ts` donne aux passes. */
  let rapports: ReturnType<typeof enAlertant>;
  let courrier: ReturnType<typeof creerCourrier>;

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
    preferences = depotPreferencesSqlite(persistance.base);
    veilles = depotVeillesSqlite(persistance.base);
    reseau = reseauRejoue();

    // Le courrier sans transport : les messages s'écrivent en base et personne
    // ne les remet (016). C'est exactement le mode de développement, et c'est
    // ce qui permet de vérifier ici *qu'une alerte a bien été déposée* sans
    // ouvrir la moindre connexion.
    courrier = creerCourrier({
      depot: persistance.courrier,
      transport: null,
      rapports: persistance.rapports,
      echeances: persistance.echeances,
      horloge: horlogeSysteme,
    });
    rapports = enAlertant(persistance.rapports, { courrier });

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
        rapports,
        horloge: horlogeSysteme,
      });
    };

    const application = creerApplication({
      configuration: {
        port: 0,
        base: { chemin: join(dossier, "babo.db"), cle: "clé-de-test" },
        licence: licence("07194591"),
        motDePasseMyffbad: null,
        motDePasseBadnet: null,
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
          fraicheur: fraicheurDeTest,
          // Le vrai dépôt, sur la vraie base : c'est la chaîne base → page que
          // 002 demande, et qu'une doublure ne prouverait pas.
          engagements: persistance.engagements,
          tournois: persistance.tournois,
          fraicheurDesEngagements: () =>
            fraicheur(
              rapports.dernierSucces(tacheDesEngagements())?.demarreLe ?? null,
              { nature: "quotidienne", heure: 5, minute: 0 },
              new Date(),
            ),
          horloge: horlogeSysteme,
        }),
        creerModuleCapitanat({
          coequipiers,
          identites: persistance.identites,
          classements: persistance.classements,
          preferences,
          fraicheur: fraicheurDeTest,
          horloge: horlogeSysteme,
        }),
        creerModuleVeille({
          veilles,
          tournois: persistance.tournois,
          appartenances: persistance.appartenances,
          fraicheur: () => fraicheurDeTest(null),
          horloge: horlogeSysteme,
          mesSeries: () => ["D8", "D9"],
        }),
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
        connecter: () => Promise.resolve("ouverte" as const),
        confirmerLeCode: () => Promise.resolve(),
        codesAttendus: () => [],
        engagements: () => persistance.engagements.compter(),
        releverLesEngagements: () =>
          Promise.reject(new Error("relevé non branché dans ce test")),
        // La chaîne touche au réseau : l'assemblage vérifie qu'elle est
        // montée, pas qu'elle atteint badnet.
        releverLesTournois: () =>
          Promise.reject(new Error("relevé des fiches non branché dans ce test")),
        // La sonde touche au réseau : l'assemblage vérifie qu'elle est montée,
        // pas qu'elle atteint les sites fédéraux.
        sonder: () => Promise.resolve([]),
        // La passe touche au réseau : idem, l'assemblage vérifie le montage.
        relever: () => Promise.reject(new Error("passe non branchée dans ce test")),
        // L'ordonnancement se teste sur son propre cœur (018) : ici on vérifie
        // que l'écran le monte, pas que la minuterie bat.
        courrier: () => courrier.etat(),
        envoyerUnMailDeTest: () => courrier.deposer(messageDeTest(horlogeSysteme.maintenant())),
        rapports: () => rapports.derniers(50),
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
    cookie = `babo_session=${connexion.jeton}`;
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

  it("dit sur mon profil qu'aucun engagement n'est relevé, et pourquoi", async () => {
    // « Aucun engagement » et « aucun tournoi à venir » ne sont pas le même
    // message : le premier peut être une session morte, le second une fin de
    // saison. La page les distingue plutôt que de servir un tableau vide.
    const corps = await (await visiter(`/mon-profil`)).text();

    assert.match(corps, /Aucun engagement relevé/);
  });

  it("sert sur mon profil les engagements écrits en base, triés et à venir", async () => {
    // La chaîne base → page, spec 002. Les tournois sont posés dans le
    // désordre et l'un d'eux est passé : c'est le tri et le filtre qu'on
    // vérifie ici, pas le parseur — il a ses propres tests.
    const passe = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const bientot = new Date(Date.now() + 20 * 24 * 60 * 60_000);
    const plusTard = new Date(Date.now() + 60 * 24 * 60 * 60_000);

    persistance.engagements.remplacer(
      [
        { evenement: 3, nom: "OPEN DE PRINTEMPS", date: plusTard, statut: null, tableaux: [] },
        {
          evenement: 1,
          nom: "TOURNOI DE VILLENEUVE",
          date: bientot,
          statut: "Inscription payée",
          tableaux: [
            {
              tableau: "DH",
              serie: "S4",
              partenaire: { licence: licence("06571233"), nom: "MARTIN Claire" },
            },
          ],
        },
        { evenement: 2, nom: "TOURNOI DE LA SAINT-JEAN", date: passe, statut: null, tableaux: [] },
      ],
      new Date(),
    );

    const corps = await (await visiter(`/mon-profil`)).text();

    assert.doesNotMatch(corps, /Aucun engagement relevé/);
    assert.match(corps, /DH S4 avec MARTIN Claire/, "le tableau et son partenaire, ensemble");
    assert.match(corps, /Inscription payée/, "le statut tel que badnet l'écrit");
    assert.match(corps, /badnet\.fr\/joueur\/tournoi\?eventid=1/, "la fiche où l'on annule");
    assert.doesNotMatch(corps, /SAINT-JEAN/, "un tournoi passé ne s'affiche pas");
    assert.ok(
      corps.indexOf("VILLENEUVE") < corps.indexOf("PRINTEMPS"),
      "triés par date, quel que soit l'ordre d'écriture",
    );
    assert.match(corps, /Le lieu de certains tournois n'est pas encore relevé/, "le manque est nommé");
  });

  it("sert le lieu et l'intervalle relevés sur la fiche publique", async () => {
    // La chaîne complète de 002 : la passe anonyme écrit un tournoi, la page le
    // rapproche de l'engagement et affiche la ville — plus l'intervalle, que la
    // face sous session ne rend pas.
    const bientot = new Date(Date.now() + 20 * 24 * 60 * 60_000);
    const lendemain = new Date(bientot.getTime() + 24 * 60 * 60_000);

    persistance.tournois.enregistrerLaFiche(
      {
        evenement: 1,
        gymnase: "Armand Silvestre",
        adresse: "188 Rue Armand Silvestre 92400 Courbevoie",
        ville: "Courbevoie",
        journees: [bientot, lendemain],
        tableaux: [],
        series: [],
      },
      new Date(),
    );

    const corps = await (await visiter(`/mon-profil`)).text();

    assert.match(corps, /Courbevoie/, "la ville, absente de /competitions");
    assert.match(corps, /du \d+ au \d+/, "l'intervalle, absent lui aussi");
  });

  it("ne montre plus la table des engagements sur les sources, mais leur décompte", async () => {
    // La frontière de 030 : `/sources` porte l'exploitation, la feature porte
    // la donnée. Deux écrans qui affichent la même table en affichent deux
    // versions le jour où l'une bouge.
    const corps = await (await visiter(`/sources`)).text();

    assert.match(corps, /3<\/strong>\s*engagements/);
    assert.doesNotMatch(corps, /VILLENEUVE/);
  });

  it("dit sur le capitanat qu'aucune équipe n'est importée", async () => {
    const reponse = await visiter(`/capitanat`);

    assert.match(await reponse.text(), /Aucune équipe importée/);
  });

  /**
   * La chaîne entière de 012 : le formulaire, la vérification, la base, la page.
   *
   * Ce sont les premières écritures de `veille`, et elles vivent ici et non sur
   * `/sources` — l'arbitrage de 030 : l'écran d'exploitation porte les gestes,
   * saisir une veille *est* la feature.
   */
  it("crée une veille, l'affiche, la suspend, puis la supprime", async () => {
    const creation = await visiter("/veille", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["nom", "DH avec Louis"],
        ["latitude", "48.8534"],
        ["longitude", "2.3488"],
        ["rayonKm", "50"],
        ["fenetre", "glissante"],
        ["fenetreJours", "90"],
        ["tableaux", "DH"],
        ["tableaux", "MX"],
        ["series", "D8"],
        ["series", "D9"],
        ["ouvertes", "1"],
      ]).toString(),
    });
    assert.equal(creation.status, 302);
    const page = creation.headers.get("location") ?? "";
    assert.match(page, /^\/veille\/\d+$/);

    // Sur le lien de la ligne, jamais sur le nom : le paragraphe d'en-tête
    // cite « DH avec Louis » en exemple, et une assertion sur le nom passerait
    // aussi bien sans aucune veille en base.
    const index = await (await visiter("/veille")).text();
    assert.match(index, new RegExp(`href="${page}">DH avec Louis</a>`));
    // « jamais relevée » et non « active » : la passe tourne à 5 h 15, et un
    // zéro se lirait comme un résultat alors qu'on n'a pas encore cherché.
    assert.match(index, /jamais relevée/);

    const detail = await (await visiter(page)).text();
    assert.match(detail, /rayon de 50 km/);
    assert.match(detail, /DH, MX/);
    assert.match(detail, /n'a pas encore été relevée/, "et non « aucun tournoi ne répond »");
    assert.doesNotMatch(detail, /Aucun tournoi ne répond/);

    const suspension = await visiter(`${page}/etat`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "active=0",
    });
    assert.equal(suspension.status, 302);
    assert.match(await (await visiter(page)).text(), /Veille suspendue/);
    assert.match(await (await visiter("/veille")).text(), /jamais relevée/, "suspendue avant d'avoir servi");

    const suppression = await visiter(`${page}/supprimer`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });
    assert.equal(suppression.status, 302);
    const apres = await (await visiter("/veille")).text();
    assert.doesNotMatch(apres, new RegExp(`href="${page}"`));
    assert.match(apres, /Aucune veille\./);
  });

  it("refuse une veille qui ne filtrerait rien, et le dit sans rien écrire", async () => {
    const refus = await visiter("/veille", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "nom=Tout&latitude=48.85&longitude=2.34&rayonKm=50&fenetre=glissante&fenetreJours=90",
    });

    assert.equal(refus.status, 400);
    const corps = await refus.text();
    assert.match(corps, /Aucun tableau/);
    assert.match(corps, /Aucune série/);
    assert.match(await (await visiter("/veille")).text(), /Aucune veille\./, "rien n'est écrit");
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

  /**
   * La chaîne entière de 030 : le formulaire, la vérification, la base, la
   * page. La coéquipière étant restée muette, la paire n'a pas de moyenne — et
   * elle est nommée à part plutôt que rangée dernière (029).
   */
  it("saisit une paire de mixte, l'affiche, la marque, puis l'oublie", async () => {
    const saisie = await visiter(`/capitanat/tableau/MX/paires`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "licence=07194591&licence=02345678",
    });
    assert.equal(saisie.status, 302);
    assert.equal(saisie.headers.get("location"), "/capitanat/tableau/MX");

    const avecLaPaire = await (await visiter(`/capitanat/tableau/MX`)).text();
    assert.match(avecLaPaire, /Paires hors de l'ordre/);
    // Les deux licences sont rangées en base — c'est l'invariant qui rend le
    // doublon visible —, donc 02345678 s'écrit avant 07194591.
    assert.match(avecLaPaire, /02345678 &amp; Simon RENOULT/);

    const identifiant = /\/capitanat\/paires\/(\d+)\/marque/.exec(avecLaPaire)?.[1];
    assert.ok(identifiant, "la paire porte un identifiant dans ses formulaires");

    const marquage = await visiter(`/capitanat/paires/${identifiant}/marque`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tableau: "MX", valeur: "1" }),
    });
    assert.equal(marquage.status, 302);
    assert.match(await (await visiter(`/capitanat/tableau/MX`)).text(), /privilégiée/);

    // Et on remet la page dans l'état où on l'a trouvée.
    await visiter(`/capitanat/paires/${identifiant}/suppression`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tableau: "MX" }),
    });
    assert.match(await (await visiter(`/capitanat/tableau/MX`)).text(), /Aucune paire saisie/);
  });

  it("refuse une paire qui appartiendrait à un autre tableau que la page", async () => {
    // Deux hommes postés sur la page du mixte : le tableau se déduit des sexes,
    // il ne se choisit pas.
    const reponse = await visiter(`/capitanat/tableau/MX/paires`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "licence=07194591&licence=07194591",
    });

    assert.equal(reponse.status, 400);
    assert.match(await reponse.text(), /Paire refusée/);
  });

  it("marque un joueur sur un tableau sans le marquer sur les autres", async () => {
    const marquer = (tableau: string, valeur: string) =>
      visiter(`/capitanat/tableau/${tableau}/joueurs/07194591/marque`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ valeur }),
      });

    assert.equal((await marquer("DH", "1")).status, 302);
    assert.match(await (await visiter(`/capitanat/tableau/DH`)).text(), /Ne plus privilégier/);
    assert.match(await (await visiter(`/capitanat/tableau/SH`)).text(), />Privilégier</);

    await marquer("DH", "0");
  });

  it("ne marque pas une licence absente de l'équipe", async () => {
    const reponse = await visiter(`/capitanat/tableau/DH/joueurs/99999999/marque`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ valeur: "1" }),
    });

    assert.equal(reponse.status, 400);
  });

  /**
   * La chaîne de 019, du rapport à la boîte d'envoi : le décorateur voit
   * l'entrée en panne, compose l'alerte, le courrier l'écrit en base, et
   * `/sources` la montre. Rien de tout cela n'ouvre de connexion — le transport
   * est absent, donc le message reste en attente, ce qui est justement le mode
   * de développement décrit par 016.
   */
  it("dépose une alerte à l'entrée en panne, et la montre sur les sources", async () => {
    const quand = new Date();
    rapports.consigner({
      tache: "acquisition:badnet",
      demarreLe: quand,
      termineLe: quand,
      // Le succès vide : la page a répondu, le parseur n'a rien tiré. C'est le
      // mode de panne que 019 vise en premier, et celui qu'une exception ne
      // couvre pas.
      issue: "vide",
      volumeExtrait: 0,
      detail: "0 tournoi extrait alors que la passe précédente en rendait 42",
    });
    await new Promise((resoudre) => setImmediate(resoudre));

    const corps = await (await visiter(`/sources`)).text();

    assert.match(corps, /\[Babo\] Panne — acquisition:badnet/);
    assert.match(corps, /Exécutions/, "et l'historique est là");
    assert.match(corps, /extraction vide/, "nommée pour ce qu'elle est, pas « succès »");
    assert.match(corps, /0 tournoi extrait/);
  });

  it("n'alerte pas une deuxième fois pour la même panne qui dure", async () => {
    const avant = courrier.etat().derniers.length;
    const quand = new Date();
    rapports.consigner({
      tache: "acquisition:badnet",
      demarreLe: quand,
      termineLe: quand,
      issue: "echec",
      volumeExtrait: 0,
      detail: "toujours rien",
    });
    await new Promise((resoudre) => setImmediate(resoudre));

    // Un mail quotidien identique se filtre en trois jours : c'est le battement
    // hebdomadaire qui rappellera cette panne, pas une deuxième alerte.
    assert.equal(courrier.etat().derniers.length, avant);
  });

  it("ne dit rien de la péremption tant que la donnée tient dans sa cadence", async () => {
    // La passe vient de tourner : la mention ne doit pas apparaître, sans quoi
    // elle deviendrait un élément de décor qu'on ne remarquerait plus.
    for (const chemin of ["/mon-profil", "/capitanat", "/capitanat/tableau/DH"]) {
      assert.doesNotMatch(await (await visiter(chemin)).text(), /Donnée périmée/, chemin);
    }
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
      assert.match(pose, /^babo_session=/);
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
      assert.match(reponse.headers.get("set-cookie") ?? "", /^babo_session=;/);
    });
  });
});
