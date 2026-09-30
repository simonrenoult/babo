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
import { depotCalendrierSqlite } from "../src/capitanat/infrastructure/depot-calendrier-sqlite.ts";
import { depotDisponibilitesSqlite } from "../src/capitanat/infrastructure/depot-disponibilites-sqlite.ts";
import { depotCompositionsSqlite } from "../src/capitanat/infrastructure/depot-compositions-sqlite.ts";
import { lireLeCsvDesDisponibilites } from "../src/capitanat/infrastructure/csv-disponibilites.ts";
import { DisponibilitesRefusees, verifierContreLeCalendrier } from "../src/capitanat/core/disponibilite.ts";
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
  let calendrierDInterclub: ReturnType<typeof depotCalendrierSqlite>;
  let disponibilites: ReturnType<typeof depotDisponibilitesSqlite>;
  let veilles: ReturnType<typeof depotVeillesSqlite>;
  /** Le dépôt décoré de 019 : celui que `main.ts` donne aux passes. */
  let rapports: ReturnType<typeof enAlertant>;
  let courrier: ReturnType<typeof creerCourrier>;

  let reseau: ReturnType<typeof reseauRejoue>;
  let passe: () => Promise<RapportArchive>;
  let cookie: string;
  let authentification: ReturnType<typeof creerAuthentification>;
  /** Le geste unique de 037, monté comme dans `main.ts` : toute passe passe par ici. */
  let executerMaintenant: (tache: string) => Promise<RapportArchive | null>;

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
    calendrierDInterclub = depotCalendrierSqlite(persistance.base);
    disponibilites = depotDisponibilitesSqlite(persistance.base);
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
    executerMaintenant = (tache) =>
      tache === tacheDAcquisition("myffbad")
        ? passe()
        : Promise.reject(new Error(`tâche non branchée dans ce test : ${tache}`));

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
          calendrier: calendrierDInterclub,
          disponibilites,
          compositions: depotCompositionsSqlite(persistance.base),
          // La feuille d'icbad touche au réseau : la doublure rend un « PDF » qui
          // dit ce qu'on lui a demandé, et l'assemblage vérifie la route.
          feuilleDeRencontre: ({ rencontre, cote, lignes }) =>
            rencontre === 796900
              ? Promise.resolve(
                  new TextEncoder().encode(`%PDF-1.7 ${rencontre} ${cote} ${JSON.stringify(lignes[0])}`),
                )
              : Promise.reject(new Error("icbad n'est pas joignable")),
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
        // L'import du calendrier lit icbad : l'assemblage vérifie l'onglet et
        // la page, le parseur se teste sur la page réelle capturée.
        calendrier: () => null,
        importerLeCalendrier: () => Promise.reject(new Error("icbad n'est pas joignable dans ce test")),
        // Le sondage, lui, ne touche à rien d'extérieur : la chaîne est celle de
        // `main.ts`, parseur, contrôle contre le calendrier et dépôt compris.
        importerLesDisponibilites: (csv) => {
          try {
            const sondage = lireLeCsvDesDisponibilites(csv);
            const motifs = verifierContreLeCalendrier(sondage, calendrierDInterclub.lire());
            if (motifs.length > 0) throw new DisponibilitesRefusees(motifs);
            disponibilites.enregistrer(sondage);
            return Promise.resolve({
              issue: "importees" as const,
              repondants: sondage.repondants.length,
              journees: sondage.journees.map(({ journee }) => journee),
              aRattacher: disponibilites.repondants().filter(({ licence }) => licence === null).length,
            });
          } catch (erreur) {
            if (erreur instanceof DisponibilitesRefusees) {
              return Promise.resolve({ issue: "refusees" as const, motifs: erreur.motifs });
            }
            throw erreur;
          }
        },
        // La connexion touche au réseau : l'assemblage vérifie le montage.
        connecter: () => Promise.resolve("ouverte" as const),
        confirmerLeCode: () => Promise.resolve(),
        codesAttendus: () => [],
        engagements: () => persistance.engagements.compter(),
        // La chaîne de la passe touche au réseau : l'assemblage vérifie qu'elle
        // est montée (037), pas qu'elle atteint myffbad.
        executerMaintenant,
        // La sonde touche au réseau : l'assemblage vérifie qu'elle est montée,
        // pas qu'elle atteint les sites fédéraux.
        sonder: () => Promise.resolve([]),
        // L'ordonnancement se teste sur son propre cœur (018) : ici on vérifie
        // que l'écran le monte, pas que la minuterie bat.
        courrier: () => courrier.etat(),
        envoyerUnMailDeTest: () => courrier.deposer(messageDeTest(horlogeSysteme.maintenant())),
        rapports: (tache) => rapports.derniers(50, tache),
        // Le courrier se lit sur la page de sa tâche : l'assemblage la déclare.
        ordonnancement: () => [
          {
            tache: "courrier",
            intitule: "Vider la boîte d'envoi (courrier)",
            description: "",
            reglage: { tache: "courrier", cadence: { nature: "quotidienne", heure: 6, minute: 30 }, graceMinutes: 1440, active: true },
            prochaine: null,
            dernierRapport: null,
          },
        ],
        reglerLaTache: () => {},
        // L'import enchaîne la passe (028, 037) par le même geste que le
        // bouton — `executerMaintenant` — et le tout est vrai sauf le réseau :
        // parseurs, dépôts, passe, page. C'est la chaîne entière, du
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
          return {
            issue: "importee",
            membres: equipe.length,
            releve: await executerMaintenant(tacheDAcquisition("myffbad")),
          };
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
    const page = await reponse.text();
    assert.match(page, /captures archivées/);
    // Une tuile par module, chacune avec ce qu'elle a à dire sur une base vide.
    assert.match(page, /<h2><a href="\/mon-profil">Mon profil<\/a><\/h2>[\s\S]*Classement pas encore relevé/);
    assert.match(page, /Aucune veille active/);
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
    const corps = await (await visiter(`/parametres/engagements`)).text();

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
    const reponse = await visiter(`/parametres/equipe`, {
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
  it("nomme sur les préférences les tableaux que l'effectif ne permet pas de remplir", async () => {
    const corps = await (await visiter(`/capitanat/preferences`)).text();

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

    const courrierVu = await (await visiter(`/parametres/scrapping/ordonnancement/courrier`)).text();
    assert.match(courrierVu, /\[Babo\] Panne — acquisition:badnet/);

    const historique = await (await visiter(`/parametres/scrapping/logs`)).text();
    assert.match(historique, /Exécutions/, "et l'historique est là");
    assert.match(historique, /extraction vide/, "nommée pour ce qu'elle est, pas « succès »");
    assert.match(historique, /0 tournoi extrait/);
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
    const reponse = await visiter(`/parametres/equipe`, {
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
    ["/capitanat/calendrier", /Aucun calendrier importé/],
    ["/capitanat/preferences", /Joueurs privilégiés/],
    ["/veille", /Veille de tournois/],
  ] as const) {
    it(`sert ${chemin}, monté par le point de composition`, async () => {
      const reponse = await visiter(`${chemin}`);
      assert.equal(reponse.status, 200);
      assert.match(await reponse.text(), attendu);
    });
  }

  it("liste le calendrier importé, chaque lieu ouvrant Google Maps", async () => {
    const bap = { nom: "Bad’ à Paname 5", code: "75-BAP-5" };
    calendrierDInterclub.remplacer({
      url: "https://icbad.ffbad.org/competition/2601367/tableau/19107",
      equipe: { nom: "CPS Xtrem Bad 5", code: "75-CPS10-5" },
      competition: "ICD75 D3 Mixte",
      groupe: "Groupe B",
      importeLe: new Date(),
      rencontres: [
        {
          id: 796867,
          journee: 2,
          debut: new Date("2026-11-14T20:00:00"),
          lieu: "Gymnase Julie Vlasto, 75010 Paris",
          domicile: { nom: "CPS Xtrem Bad 5", code: "75-CPS10-5" },
          exterieur: bap,
        },
      ],
    });

    const corps = await (await visiter("/capitanat/calendrier")).text();

    assert.match(corps, /reçoit/);
    assert.match(corps, /Bad’ à Paname 5/, "l'adversaire, vu de mon équipe");
    assert.match(
      corps,
      /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Gymnase%20Julie%20Vlasto%2C%2075010%20Paris"/,
    );
  });

  it("exporte le calendrier en iCalendar, et lie chaque rencontre à Google Agenda", async () => {
    const page = await (await visiter("/capitanat/calendrier")).text();
    assert.match(page, /href="\/capitanat\/calendrier\.ics"/);
    assert.match(page, /href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&amp;/);

    const ics = await visiter("/capitanat/calendrier.ics");
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get("content-type") ?? "", /^text\/calendar/);
    assert.match(ics.headers.get("content-disposition") ?? "", /attachment; filename="interclub-.+\.ics"/);
    assert.match(await ics.text(), /^BEGIN:VCALENDAR\r\n[\s\S]*BEGIN:VEVENT/);
  });

  it("importe un sondage, propose de rattacher Simon, puis compte ses disponibilités", async () => {
    const cps = { nom: "CPS Xtrem Bad 5", code: "75-CPS10-5" };
    const adversaire = { nom: "Badminton Paris 18eme 5", code: "75-BAD18-5" };
    calendrierDInterclub.remplacer({
      url: "https://icbad.ffbad.org/competition/2601367/tableau/19107",
      equipe: cps,
      competition: "ICD75 D3 Mixte",
      groupe: "Groupe B",
      importeLe: new Date(),
      rencontres: ["2026-11-05", "2026-11-14", "2026-11-16", "2026-11-28", "2026-12-01"].map((jour, index) => ({
        id: 796900 + index,
        journee: index + 1,
        debut: new Date(`${jour}T20:00:00`),
        lieu: "Gymnase",
        domicile: adversaire,
        exterieur: cps,
      })),
    });
    const csv = readFileSync(
      new URL("../src/capitanat/infrastructure/exemples/sondage-disponibilites.csv", import.meta.url),
      "utf8",
    );

    const importe = await visiter("/parametres/disponibilites", {
      method: "POST",
      headers: { "content-type": "text/csv; charset=utf-8" },
      body: csv,
    });
    assert.equal(importe.status, 200);
    assert.match(await importe.text(), /<strong>5<\/strong>\s*répondants/);

    const avant = await (await visiter("/capitanat/disponibilites")).text();
    assert.match(avant, /title="[^"]*qui est blessée[^"]*"/, "la remarque du sondage, au survol seulement");
    assert.match(avant, /<option value="07194591" selected>/, "Simon est proposé par son prénom");
    assert.match(avant, /proposé/);

    const rattache = await visiter("/capitanat/disponibilites/rattachements", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["nom", "Simon"],
        ["licence", "07194591"],
        ["nom", "Anne"],
        ["licence", ""],
      ]),
    });
    assert.equal(rattache.status, 302);

    const apres = await (await visiter("/capitanat/disponibilites")).text();
    assert.doesNotMatch(apres, /Simon RENOULT/, "le prénom seul, comme entre coéquipiers");
    assert.match(apres, /<td>\s*Simon\s*<\/td>/, "rattaché, il est nommé par son prénom");
    assert.doesNotMatch(apres, /« Simon » au sondage/, "le prénom est celui du sondage : rien à signaler");
    assert.match(apres, /0 · 1/, "Simon, homme, disponible");
  });

  it("ouvre la planification sur la prochaine rencontre", async () => {
    const reponse = await visiter("/capitanat/planification");

    assert.equal(reponse.status, 302);
    assert.match(reponse.headers.get("location") ?? "", /^\/capitanat\/planification\/\d+$/);
  });

  it("ne propose que les disponibles, et refuse un troisième match", async () => {
    const page = await (await visiter("/capitanat/planification/1")).text();
    assert.match(page, /<option value="07194591"\s*>\s*Simon RENOULT/, "Simon, rattaché et disponible");
    assert.doesNotMatch(page, /<option value="02345678"/, "le membre sans réponse ne se sélectionne pas");

    const composer = (places: readonly [string, string][]) =>
      visiter("/capitanat/planification/1", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(places),
      });

    const troisMatchs = await composer([
      ["SH1", "07194591"],
      ["DH-1", "07194591"],
      ["MX-H", "07194591"],
    ]);
    assert.equal(troisMatchs.status, 400);
    assert.match(await troisMatchs.text(), /joue 3 matchs \(SH1, DH, MX\) : 2 au plus par rencontre/);

    const deuxMatchs = await composer([
      ["SH1", "07194591"],
      ["DH-1", "07194591"],
    ]);
    assert.equal(deuxMatchs.status, 302);

    const relue = await (await visiter("/capitanat/planification/1")).text();
    assert.match(relue, /<option value="07194591" selected>/);
    assert.match(relue, /7 places\s+encore vides/);
  });

  it("titre chaque page du nom de sa section, sous-pages comprises", async () => {
    for (const [chemin, section] of [
      ["/mon-profil", "Mon profil"],
      ["/capitanat", "Capitanat"],
      ["/capitanat/calendrier", "Capitanat"],
      ["/capitanat/tableau/SH", "Capitanat"],
      ["/veille", "Veille de tournois"],
      ["/parametres/scrapping/ordonnancement", "Paramètres"],
      ["/parametres/equipe", "Paramètres"],
    ] as const) {
      const page = await (await visiter(chemin)).text();
      assert.match(page, new RegExp(`<h2>${section}(</h2>|\\s)`), chemin);
    }
  });

  /** Une veille réelle, créée par la route, pour les pages qui en demandent une. */
  async function creerUneVeille(nom: string): Promise<string> {
    const creation = await visiter("/veille", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["nom", nom],
        ["latitude", "48.8534"],
        ["longitude", "2.3488"],
        ["rayonKm", "50"],
        ["fenetre", "glissante"],
        ["fenetreJours", "90"],
        ["tableaux", "DH"],
        ["series", "D8"],
      ]).toString(),
    });
    assert.equal(creation.status, 302);
    return creation.headers.get("location") ?? "";
  }

  /** La barre d'actions qui suit immédiatement un titre (039), ou `null`. */
  function barreSousLeTitre(page: string): string | null {
    return /<\/h[2-4]>\s*(?:<nav[\s\S]*?<\/nav>\s*)*<div class="barre-actions">([\s\S]*?)<\/div>/.exec(page)?.[1] ?? null;
  }

  it("ouvre chaque sous-page par un seul retour vers son parent, sous le titre", async () => {
    const veille = await creerUneVeille("Sous-page");
    for (const [chemin, parent, libelle] of [
      ["/parametres/scrapping/ordonnancement/courrier", "/parametres/scrapping/ordonnancement", "Tâches"],
      ["/parametres/scrapping/sources/myffbad", "/parametres/scrapping/sources", "Sources"],
      ["/capitanat/tableau/SH", "/capitanat/preferences", "Préférences"],
      [veille, "/veille", "Veilles"],
      ["/veille/nouvelle", "/veille", "Veilles"],
      [`${veille}/modifier`, veille, "Sous-page"],
    ] as const) {
      const page = await (await visiter(chemin)).text();
      const barre = barreSousLeTitre(page);
      assert.ok(barre !== null, `${chemin} : une barre sous le titre`);
      assert.match(barre, new RegExp(`^\\s*<a class="retour" href="${parent}">← ${libelle}</a>`), chemin);
      assert.equal(page.match(/←|Retour aux/g)?.length, 1, `${chemin} : un seul retour`);
    }
  });

  it("annonce sur l'accueil la prochaine rencontre, et où en est sa composition", async () => {
    const page = await (await visiter("/")).text();

    // Le calendrier du test est daté : passé la saison, la tuile le dit.
    assert.match(
      page,
      /Chez <strong>Badminton Paris 18eme 5<\/strong>[\s\S]*(places? à pourvoir|À composer|Composée)|Saison terminée/,
    );
  });

  it("montre une carte par match, avec son état, et l'état de chaque journée", async () => {
    // J01 : Simon en SH1 et dans le double hommes, rien d'autre.
    const page = await (await visiter("/capitanat/planification/1")).text();

    assert.match(page, /<section class="carte rempli" aria-label="Simple hommes 1">/);
    assert.match(page, /<section class="carte incomplet" aria-label="Double hommes">/, "un seul des deux");
    assert.match(page, /<section class="carte vide" aria-label="Simple dames">/);
    assert.match(page, /href="\/capitanat\/planification\/1" class="en-cours"/);
    assert.match(page, /href="\/capitanat\/planification\/2" class="vide"/);
    assert.match(page, /data-texte="\* SH1 : Simon\n\* DH : Simon">Copier pour WhatsApp/, "par prénom, sans cote");
  });

  it("range chaque geste dans la barre qui suit le titre de ce qu'il concerne", async () => {
    const veille = await creerUneVeille("Gestes");
    for (const [chemin, gestes] of [
      ["/veille", [/>Créer une veille</]],
      [veille, [/>Modifier les critères</, />Suspendre</, />Supprimer<\/button>/]],
      ["/parametres/scrapping/ordonnancement/courrier", [/>Lancer maintenant</]],
      ["/capitanat/calendrier", [/>Exporter le calendrier \(\.ics\)</]],
      ["/capitanat/planification/1", [/>Imprimer la feuille de rencontre</, />Copier pour WhatsApp</]],
    ] as const) {
      const barre = barreSousLeTitre(await (await visiter(chemin)).text());
      assert.ok(barre !== null, `${chemin} : une barre sous le titre`);
      for (const geste of gestes) assert.match(barre, geste, chemin);
    }

    const barreDeLaVeille = barreSousLeTitre(await (await visiter(veille)).text()) ?? "";
    assert.match(barreDeLaVeille, />Supprimer<\/button>(?![\s\S]*<button type="submit")/, "Supprimer en dernier");
  });

  it("dit à cinq veilles, là où serait le bouton, pourquoi il n'y en a plus", async () => {
    let restantes = 5 - veilles.toutes().length;
    while (restantes-- > 0) await creerUneVeille(`Remplissage ${restantes}`);

    const barre = barreSousLeTitre(await (await visiter("/veille")).text());
    assert.ok(barre !== null, "une barre sous le titre");
    assert.match(barre, /Cinq veilles, le maximum/);
    assert.doesNotMatch(barre, /Créer une veille/);
  });

  it("dit, en composant une journée, combien de fois chacun a déjà été retenu", async () => {
    const page = await (await visiter("/capitanat/planification/2")).text();

    assert.match(page, /Simon RENOULT — [^<]*· retenu 1\/1/, "retenu en J01, où il était disponible");
    assert.match(page, /Sollicitation des disponibles/);
    assert.match(page, /<td>1<\/td>\s*<td>1 journée<\/td>\s*<td data-tri="1">\s*<span class="jauge" role="img" aria-label="100 %">/);
  });

  it("donne sur les effectifs le taux de sollicitation de la saison", async () => {
    const page = await (await visiter("/capitanat")).text();

    assert.match(page, /100 %\s*<span class="etat">1\/1<\/span>/, "Simon, retenu la seule journée composée");
  });

  it("imprime la feuille de la journée, avec la composition enregistrée dans ma colonne", async () => {
    const reponse = await visiter("/capitanat/planification/1/feuille");

    assert.equal(reponse.status, 200);
    assert.equal(reponse.headers.get("content-type"), "application/pdf");
    assert.match(reponse.headers.get("content-disposition") ?? "", /inline; filename="J01-feuille-de-rencontre\.pdf"/);
    const corps = await reponse.text();
    assert.match(corps, /^%PDF-1\.7 796900 exterieur /, "la rencontre de J01, CPS à l'extérieur");
    assert.match(corps, /07194591 - Simon RENOULT/, "le SH1 enregistré");
  });

  it("dit pourquoi la feuille manque quand icbad ne répond pas", async () => {
    const reponse = await visiter("/capitanat/planification/2/feuille");

    assert.equal(reponse.status, 502);
    assert.match(await reponse.text(), /icbad n&#39;est pas joignable/);
  });

  it("refuse un sondage dont les dates ne sont pas celles du calendrier", async () => {
    const reponse = await visiter("/parametres/disponibilites", {
      method: "POST",
      headers: { "content-type": "text/csv; charset=utf-8" },
      body: "Nom;J1 - mar. 03/11/2026 20h\nSimon;Oui\n",
    });

    assert.equal(reponse.status, 400);
    assert.match(await reponse.text(), /J1 est datée du 03\/11\/2026 dans le sondage, du 05\/11\/2026 au calendrier/);
  });

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
      "/parametres/scrapping/sources/myffbad",
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
      const reponse = await sansCookie("/parametres/equipe", {
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

    it("sert la feuille de style sans session : la page de connexion la charge", async () => {
      const reponse = await sansCookie("/babo.css");

      assert.equal(reponse.status, 200);
      assert.match(reponse.headers.get("content-type") ?? "", /^text\/css/);
      assert.equal(reponse.headers.get("cache-control"), "no-cache");
      assert.match(await (await sansCookie("/connexion")).text(), /href="\/babo\.css"/);
    });

    it("sert le script sans session, et rien d'autre du dossier statique", async () => {
      const script = await sansCookie("/babo.js");
      assert.equal(script.status, 200);
      assert.match(script.headers.get("content-type") ?? "", /javascript/);
      assert.match(await (await sansCookie("/connexion")).text(), /<script src="\/babo\.js" defer>/);

      // Deux fichiers nommés, pas un dossier : le reste passe par le garde.
      const autre = await sansCookie("/statique/babo.css");
      assert.equal(autre.status, 302);
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

      assert.equal((await entrer("/parametres")).headers.get("location"), "/parametres");
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
