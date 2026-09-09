import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ClientHttp, Requete, Reponse } from "../../core/acquisition.ts";
import {
  nombreAnnonce,
  rechercheDeTournois,
  seriesDuTournoi,
  tableauxDuTournoi,
  tournoisDeLaRecherche,
} from "./badnet.ts";
import { accesALaRechercheBadnet } from "./veilles-badnet.ts";

const fixture = (nom: string) => readFileSync(new URL(`exemples/${nom}`, import.meta.url), "utf8");

const RECHERCHE = fixture("badnet-recherche.html");
const CARTES = fixture("badnet-fiche-publique-tableaux.html");

const reponse = (contenu: string): Reponse => ({
  url: "https://badnet.fr/index.php",
  statutHttp: 200,
  contenu,
  cookies: [],
});

describe("la recherche publique, telle qu'une veille la pose", () => {
  it("ne pousse que les critères dont la sonde a établi l'effet", () => {
    // Zone, `coming`, type, catégories et disciplines : vérifiés le 8 septembre
    // 2026. Les cases de classement, non — `nc=1` seul ne filtre rien et la
    // sélection de `n=1` ne recoupe pas le champ `clt` rendu. Un filtre dont on
    // ignore la portée écarte des tournois sans qu'on sache lesquels.
    const corps =
      rechercheDeTournois({
        autourDe: { longitude: 2.3488, latitude: 48.8534 },
        rayonKm: 50,
        aVenir: true,
        disciplines: ["double", "mixte"],
        categories: ["seniors"],
      }).corps ?? "";

    assert.match(corps, /city=2.3488%3B48.8534/, "longitude;latitude, dans cet ordre");
    assert.match(corps, /rayon=50/);
    assert.match(corps, /coming=1/);
    assert.match(corps, /double=1/);
    assert.match(corps, /mixte=1/);
    assert.match(corps, /seniors=1/);
    assert.doesNotMatch(corps, /single=1/, "une case décochée est absente, pas à zéro");
    assert.doesNotMatch(corps, /[&?](n|r|d|p|nc)=1/, "aucun filtre de classement");
  });

  it("part sans cookie, et c'est sa propriété la plus utile", () => {
    // La seule requête du projet qui n'engage aucun compte. La faire passer
    // sous session mettrait la veille quotidienne sous le risque de
    // bannissement de 015.
    const requete = rechercheDeTournois({
      autourDe: { longitude: 2.3, latitude: 48.8 },
      rayonKm: 25,
      aVenir: true,
    });
    assert.equal(requete.jeton, null);
  });

  it("lit la date limite dans le `title`, jamais dans le texte visible", () => {
    // « 2 jours restants » est relatif au jour de la requête, donc faux dès le
    // lendemain. L'attribut, lui, porte la date.
    const tournois = tournoisDeLaRecherche(reponse(RECHERCHE));
    const premier = tournois[0];

    assert.equal(premier?.dateLimite?.toISOString().slice(0, 10), "2026-09-03");
    assert.match(premier?.echeanceLibellee ?? "", /jours restants/, "le libellé reste, inutilisé");
  });

  it("compare ce que badnet annonce à ce qu'il place sur sa carte", () => {
    // 54 annoncés, 3 marqueurs dans cette capture réduite : l'écart est le
    // signal que 019 réclame, le jour où badnet cesserait de géolocaliser.
    assert.equal(nombreAnnonce(reponse(RECHERCHE)), 54);
    assert.equal(tournoisDeLaRecherche(reponse(RECHERCHE)).length, 3);
    assert.equal(nombreAnnonce(reponse("<div></div>")), null, "une capture sans décompte");
  });

  it("traduit la recherche vers ce que la passe range", async () => {
    const requetes: Requete[] = [];
    const client: ClientHttp = {
      recuperer: (requete) => {
        requetes.push(requete);
        return Promise.resolve(reponse(RECHERCHE));
      },
    };

    const resultat = await accesALaRechercheBadnet({ client }).chercher({
      id: 1,
      intitule: "DH avec Louis",
      autourDe: { longitude: 2.3488, latitude: 48.8534 },
      rayonKm: 50,
      disciplines: ["double"],
      categories: [],
    });

    assert.equal(requetes.length, 1, "un seul saut : c'est la requête la moins chère du projet");
    assert.equal(resultat.annonces, 54);
    assert.equal(resultat.tournois.length, 3);
    assert.deepEqual(resultat.tournois[0], {
      evenement: 50898,
      nom: "Circuit Jeune Départemental 95 - TOP ELITE DEPARTEMENTAL 1",
      latitude: 48.9780254,
      longitude: 2.2807091,
      dateLimite: new Date("2026-09-03T12:00:00"),
      familles: "R, D, P, NC",
      categories: "Jeunes",
    });
  });
});

describe("les tableaux et les séries, lus sur la fiche", () => {
  it("nomme les tableaux réels, que la recherche ne distingue pas", () => {
    // badnet ne connaît que simple, double et mixte ; la fiche écrit SH, SD, DH,
    // DD et MX. C'est là, et là seulement, qu'on sait qu'un tournoi propose le
    // DH sans proposer le SH.
    assert.deepEqual(tableauxDuTournoi(reponse(CARTES)), ["DD", "DH", "MX", "SD", "SH"]);
  });

  it("rend les séries rang par rang, et pas la famille annoncée", () => {
    // La recherche annonce `N` pour ce tournoi ; la fiche exclut N1. C'est tout
    // l'intérêt de la lire : filtrer sur la famille ferait passer un joueur N1
    // pour admis.
    const series = seriesDuTournoi(reponse(CARTES));

    assert.deepEqual(series, ["N2", "N3", "R4", "R5", "R6", "D7", "D8", "D9", "P10", "P11", "P12", "NC"]);
    assert.ok(!series.includes("N1"), "N1 n'est pas admis, et la famille `N` le cachait");
    assert.ok(series.includes("NC"), "NC n'a qu'un niveau : une coche, pas un rang");
  });

  it("ne déclare rien plutôt que d'inventer, faute de cartes", () => {
    // Deux tournois sur quarante-six n'ont rien saisi. Vide veut dire
    // « indéterminé », et la page les montre à part au lieu de les écarter.
    assert.deepEqual(tableauxDuTournoi(reponse("<div></div>")), []);
    assert.deepEqual(seriesDuTournoi(reponse("<div></div>")), []);
  });

  it("reconnaît `DX` comme le mixte, sans traduire ce qu'il ne connaît pas", () => {
    // `tableau.ts` l'écrit déjà : « MX et non DX, c'est l'écriture de la
    // fédération ». Laisser `DX` tel quel ferait manquer à une veille « mixte »
    // un tournoi qui en propose un. `ST` et `SI`, eux, n'ont pas d'équivalent
    // connu et restent tels quels : reconnaître une orthographe n'est pas
    // inventer une donnée.
    const autrement = CARTES.replaceAll("<div>MX ", "<div>DX ").replaceAll("<div>SD ", "<div>ST ");
    assert.deepEqual(tableauxDuTournoi(reponse(autrement)), ["DD", "DH", "MX", "SH", "ST"]);
  });

  it("ne prend pas l'en-tête des familles pour des séries", () => {
    // La ligne d'en-tête porte « N R D P NC » en toutes lettres. Les lire
    // rendrait toutes les séries admises sur tous les tournois.
    const aucuneAdmise = CARTES.replaceAll(/<td class="center">[^<]*<\/td>/gu, '<td class="center"></td>')
      .replaceAll("material-icons check", "material-icons uncheck");
    assert.deepEqual(seriesDuTournoi(reponse(aucuneAdmise)), []);
  });
});
