import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ClientHttp, Requete, Reponse } from "../../core/acquisition.ts";
import {
  actionDeLEnveloppe,
  actionInterneDeLaPage,
  cookiesAnonymes,
  enTeteDuTournoi,
  fichePubliqueUrl,
  jetonCsrf,
  journeesDuTournoi,
  lieuDuTournoi,
} from "./badnet.ts";
import { accesAuxFichesPubliquesBadnet } from "./tournois-badnet.ts";

/**
 * La fiche publique d'un tournoi — spec 002.
 *
 * Les fixtures sont la structure réelle relevée le 5 septembre 2026 sur
 * `/tournoi/public/informations?eventid=50750`. Un gymnase est une adresse
 * publique : il n'y a ici les coordonnées de personne.
 */
const fixture = (nom: string) =>
  readFileSync(new URL(`exemples/${nom}`, import.meta.url), "utf8");

const COQUILLE = fixture("badnet-coquille-publique.html");
const FICHE = fixture("badnet-fiche-publique.html");
/** Le tournoi 51245, publié sans salle — le cas que 036 répare. */
const ENVELOPPE = fixture("badnet-enveloppe-publique.html");
const SANS_GYMNASE = fixture("badnet-fiche-publique-sans-gymnase.html");
const ACTION = "f9c685c090b81a09dbe8223f7ba12feb";
const ACTION_ENVELOPPE = "89d58df82ff94924794595eace4ba52f";
const COOKIES = ["PHPSESSID=jf9v52l5kdc9qrofil4a9cdqg2; path=/", "ic_csrf=1e8670e0ee275c; path=/; secure"];

/** Le mur de connexion badnet, à ses deux champs — la forme relevée par 027. */
const MUR = `<form method="post"><input name="login" type="text"><input name="pwd" type="password">`;

const reponse = (contenu: string, cookies: readonly string[] = []): Reponse => ({
  url: "https://badnet.fr/index.php",
  statutHttp: 200,
  contenu,
  cookies: [...cookies],
});

function reseau(
  ...etapes: readonly { contenu: string; cookies?: readonly string[] }[]
): ClientHttp & { readonly requetes: Requete[] } {
  const requetes: Requete[] = [];
  let rang = 0;
  return {
    requetes,
    recuperer: (requete) => {
      requetes.push(requete);
      const etape = etapes[rang++];
      return Promise.resolve(reponse(etape?.contenu ?? "", etape?.cookies ?? []));
    },
  };
}

describe("les parseurs de la fiche publique", () => {
  it("vise l'adresse qui porte la fiche, pas celle que la recherche publie", () => {
    // `/tournoi/public?eventid=…` est une URL d'affichage : elle ne rend qu'une
    // coquille vide. C'est `/informations` qui porte le contenu, et le premier
    // relevé de 002 l'a appris à ses dépens.
    assert.equal(
      fichePubliqueUrl(50750),
      "https://badnet.fr/tournoi/public/informations?eventid=50750",
    );
  });

  it("relève l'action dans `data-inside_page`, pas dans `default_page`", () => {
    // Le motif de 027 vaut pour l'application authentifiée, pas pour le site
    // public : celui-ci n'a pas d'ancre `default_page` du tout.
    assert.equal(actionInterneDeLaPage(reponse(COQUILLE)), ACTION);
    assert.equal(actionInterneDeLaPage(reponse("<div id=\"main\"></div>")), null);
  });

  it("extrait les deux cookies anonymes que badnet réclame", () => {
    assert.equal(
      cookiesAnonymes(COOKIES),
      "PHPSESSID=jf9v52l5kdc9qrofil4a9cdqg2; ic_csrf=1e8670e0ee275c",
    );
    assert.equal(jetonCsrf(COOKIES), "1e8670e0ee275c");
    assert.equal(cookiesAnonymes([]), null);
  });

  it("lit le gymnase, l'adresse et la ville derrière le code postal", () => {
    // La ville se lit après le code postal : c'est la seule découpe fiable
    // d'une adresse saisie à la main, où la rue peut contenir des chiffres —
    // « 188 Rue Armand Silvestre » en est l'exemple même.
    assert.deepEqual(lieuDuTournoi(reponse(FICHE)), {
      gymnase: "Armand Silvestre",
      adresse: "188 Rue Armand Silvestre 92400 Courbevoie",
      ville: "Courbevoie",
    });
  });

  it("préfère ne rien rendre qu'un dernier mot de rue", () => {
    // `replaceAll` : le code postal est écrit deux fois, dans le lien et dans
    // son texte, et c'est le texte que le parseur lit.
    const sansCodePostal = FICHE.replaceAll("92400  Courbevoie", "quelque part");
    assert.equal(lieuDuTournoi(reponse(sansCodePostal)), null);
  });

  it("relève l'action de l'enveloppe sur le bon div, pas sur le premier venu", () => {
    // La barre de navigation porte un `data-ic_a` par entrée de menu, et le
    // premier du document est celui de l'accueil. L'enveloppe se lit sur le div
    // qui porte `data-inside_page`, et sur lui seul.
    assert.equal(actionDeLEnveloppe(reponse(COQUILLE)), ACTION_ENVELOPPE);
    assert.notEqual(ACTION_ENVELOPPE, ACTION, "les deux actions du même div diffèrent");
    assert.equal(actionDeLEnveloppe(reponse('<div id="main"></div>')), null);
  });

  it("lit la ville nommée et les dates ISO sur l'enveloppe", () => {
    // C'est la source que 002 n'avait pas vue : elle nomme la ville au lieu de
    // la faire deviner derrière un code postal, et rend les dates en ISO au
    // lieu d'un libellé français à découper.
    const enTete = enTeteDuTournoi(reponse(ENVELOPPE));

    assert.equal(enTete?.ville, "Chambly");
    assert.deepEqual(
      enTete?.journees.map((jour) => jour.toISOString().slice(0, 10)),
      ["2026-11-14", "2026-11-15"],
      "l'intervalle est énuméré, bornes comprises",
    );
  });

  it("distingue le champ vide de l'attribut absent", () => {
    // Une ville que badnet ne nomme pas est une donnée manquante : la page sait
    // dire « lieu non relevé ». Un `data-datedata` disparu est une page qui a
    // changé, et cela doit remonter comme une panne (019).
    const sansVille = ENVELOPPE.replace("&quot;Chambly&quot;", "&quot;&quot;");
    assert.equal(enTeteDuTournoi(reponse(sansVille))?.ville, null);
    assert.equal(enTeteDuTournoi(reponse("<div class=\"b-infos\"></div>")), null);
  });

  it("ne rend aucune journée d'un intervalle illisible", () => {
    const casse = ENVELOPPE.replace("2026-11-14", "bientôt");
    assert.deepEqual(enTeteDuTournoi(reponse(casse))?.journees, []);
  });

  it("dit qu'il n'y a pas de gymnase, au lieu de chercher hors du bloc", () => {
    // Le défaut que 036 répare. La capture se fermait sur la première
    // `</table>` venue : sans gymnase saisi il n'y en a aucune dans le bloc, et
    // la passe échouait sur un tournoi parfaitement normal — sept sur neuf le
    // 9 septembre 2026.
    assert.equal(lieuDuTournoi(reponse(SANS_GYMNASE)), null);
    assert.deepEqual(journeesDuTournoi(reponse(SANS_GYMNASE)), []);
  });

  it("ne va pas chercher une date dans la section qui suit le bloc", () => {
    // Le bloc se ferme sur « Avis ». Sans cette borne, une date écrite plus bas
    // dans la page passerait pour une journée de tournoi.
    const avecUneDateApres = SANS_GYMNASE.replace(
      '<div class="reviews">',
      '<div class="reviews"><td class="center">2020-01-01</td>',
    );
    assert.deepEqual(journeesDuTournoi(reponse(avecUneDateApres)), []);
  });

  it("rend les journées réelles du tournoi, que `/competitions` ignore", () => {
    // La seule source d'intervalle du projet : 027 avait conclu qu'il n'y en
    // avait pas, faute d'avoir vu cette page.
    assert.deepEqual(
      journeesDuTournoi(reponse(FICHE)).map((jour) => jour.toISOString().slice(0, 10)),
      ["2026-10-24", "2026-10-25"],
    );
  });
});

describe("la chaîne de la fiche publique", () => {
  const chaine = { contenu: COQUILLE, cookies: COOKIES };

  it("suit la coquille, puis l'enveloppe, puis la fiche", async () => {
    const client = reseau(chaine, { contenu: ENVELOPPE }, { contenu: FICHE });
    const tournoi = await accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750);

    assert.equal(tournoi.gymnase, "Armand Silvestre");
    assert.equal(tournoi.journees.length, 2);
    assert.equal(client.requetes.length, 3, "coquille, enveloppe, fiche");
    assert.match(client.requetes[1]?.corps ?? "", new RegExp(`ic_a=${ACTION_ENVELOPPE}`));

    const post = client.requetes[2];
    assert.equal(post?.methode, "POST");
    assert.match(post?.corps ?? "", new RegExp(`ic_a=${ACTION}`));
    assert.match(post?.corps ?? "", /eventid=50750/);
    assert.match(post?.corps ?? "", /ic_csrf=1e8670e0ee275c/, "badnet le veut aussi dans le corps");
    assert.match(post?.corps ?? "", /mustache=1/);
  });

  it("aboutit sur un tournoi que personne n'a encore doté d'une salle", async () => {
    // Le cœur de 036 : avant elle, cette fiche levait `FichePubliqueIllisible`
    // et 019 envoyait une alerte pour une panne qui n'en était pas une.
    const client = reseau(chaine, { contenu: ENVELOPPE }, { contenu: SANS_GYMNASE });
    const tournoi = await accesAuxFichesPubliquesBadnet({ client }).ficheDe(51245);

    assert.equal(tournoi.ville, "Chambly", "l'enveloppe la nomme");
    assert.equal(tournoi.gymnase, null);
    assert.equal(tournoi.adresse, null);
    assert.deepEqual(
      tournoi.journees.map((jour) => jour.toISOString().slice(0, 10)),
      ["2026-11-14", "2026-11-15"],
      "faute de tableau des gymnases, l'intervalle de l'enveloppe fait les journées",
    );
  });

  it("préfère les journées de la carte à l'intervalle de l'enveloppe", async () => {
    // L'enveloppe ne donne que deux bornes ; la carte donne le détail. Un
    // tournoi peut sauter un jour au milieu de son intervalle, et l'énumération
    // le dirait à tort.
    const client = reseau(chaine, { contenu: ENVELOPPE }, { contenu: FICHE });
    const tournoi = await accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750);

    assert.deepEqual(
      tournoi.journees.map((jour) => jour.toISOString().slice(0, 10)),
      ["2026-10-24", "2026-10-25"],
      "celles du gymnase, pas le 14-15 novembre de l'enveloppe",
    );
  });

  it("échoue quand l'enveloppe ne porte plus son en-tête", async () => {
    // Une page qui a changé, à distinguer d'une donnée que l'organisateur n'a
    // pas saisie : la première est une panne, la seconde non.
    const client = reseau(chaine, { contenu: "<div></div>" }, { contenu: FICHE });

    await assert.rejects(
      () => accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750),
      /en-tête de tournoi/,
    );
  });

  it("représente les cookies anonymes que badnet vient de poser", async () => {
    // Ce n'est pas « passer sous session » : ils sont obtenus à l'instant, sans
    // compte, et jetés avec la fiche. C'est ce qui garde cette chaîne hors du
    // risque de bannissement de 015.
    const client = reseau(chaine, { contenu: ENVELOPPE }, { contenu: FICHE });
    await accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750);

    assert.equal(client.requetes[0]?.jeton, null, "le premier contact n'a rien à présenter");
    assert.match(client.requetes[1]?.jeton ?? "", /PHPSESSID=.*ic_csrf=/);
  });

  it("ne me nomme jamais : aucune licence ne part sur une page publique", async () => {
    const client = reseau(chaine, { contenu: ENVELOPPE }, { contenu: FICHE });
    await accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750);

    for (const requete of client.requetes) {
      assert.doesNotMatch(requete.corps ?? "", /license/);
    }
  });

  it("dit que la fiche « publique » ne l'est pas, plutôt qu'une page changée", async () => {
    // Les deux se ressemblent — rien à lire —, et les confondre ferait chercher
    // un changement de balisage là où il n'y a qu'une porte fermée.
    const client = reseau({ contenu: MUR });

    await assert.rejects(
      () => accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750),
      /réclame une session/,
    );
    assert.equal(client.requetes.length, 1, "on n'insiste pas derrière un mur");
  });

  it("échoue en nommant l'étape quand l'action a bougé", async () => {
    const client = reseau({ contenu: "<div id=\"main\"></div>", cookies: COOKIES });

    await assert.rejects(
      () => accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750),
      /action interne/,
    );
  });

  it("refuse de poster sans jeton anti-CSRF plutôt que d'essuyer un refus", async () => {
    const client = reseau({ contenu: COQUILLE, cookies: [] });

    await assert.rejects(
      () => accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750),
      /anti-CSRF/,
    );
    assert.equal(client.requetes.length, 1);
  });
});
