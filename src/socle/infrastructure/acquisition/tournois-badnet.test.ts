import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ClientHttp, Requete, Reponse } from "../../core/acquisition.ts";
import {
  actionInterneDeLaPage,
  cookiesAnonymes,
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
const ACTION = "f9c685c090b81a09dbe8223f7ba12feb";
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

  it("suit la coquille puis poste l'action relevée, avec le jeton anti-CSRF", async () => {
    const client = reseau(chaine, { contenu: FICHE });
    const tournoi = await accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750);

    assert.equal(tournoi.ville, "Courbevoie");
    assert.equal(tournoi.journees.length, 2);
    assert.equal(client.requetes.length, 2, "coquille puis fiche");

    const post = client.requetes[1];
    assert.equal(post?.methode, "POST");
    assert.match(post?.corps ?? "", new RegExp(`ic_a=${ACTION}`));
    assert.match(post?.corps ?? "", /eventid=50750/);
    assert.match(post?.corps ?? "", /ic_csrf=1e8670e0ee275c/, "badnet le veut aussi dans le corps");
    assert.match(post?.corps ?? "", /mustache=1/);
  });

  it("représente les cookies anonymes que badnet vient de poser", async () => {
    // Ce n'est pas « passer sous session » : ils sont obtenus à l'instant, sans
    // compte, et jetés avec la fiche. C'est ce qui garde cette chaîne hors du
    // risque de bannissement de 015.
    const client = reseau(chaine, { contenu: FICHE });
    await accesAuxFichesPubliquesBadnet({ client }).ficheDe(50750);

    assert.equal(client.requetes[0]?.jeton, null, "le premier contact n'a rien à présenter");
    assert.match(client.requetes[1]?.jeton ?? "", /PHPSESSID=.*ic_csrf=/);
  });

  it("ne me nomme jamais : aucune licence ne part sur une page publique", async () => {
    const client = reseau(chaine, { contenu: FICHE });
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
