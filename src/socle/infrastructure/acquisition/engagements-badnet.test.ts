import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Reponse } from "../../core/acquisition.ts";
import { licence } from "../../core/licence.ts";
import {
  actionDeLaFiche,
  actionDeLaPage,
  engagementDuTournoi,
  ficheDuTournoi,
  tournoisEngages,
} from "./badnet.ts";

/**
 * Les parseurs des engagements — spec 027.
 *
 * Les fixtures reproduisent la **structure** relevée le 4 septembre 2026, avec
 * des noms et des licences fabriqués : la page réelle porte les seize membres
 * du club, et une fixture n'a pas à emporter les coordonnées de gens qui n'ont
 * rien demandé (005, 021). C'est la structure qu'on teste, pas les personnes.
 */
const fixture = (nom: string) =>
  readFileSync(new URL(`exemples/${nom}`, import.meta.url), "utf8");

const reponse = (contenu: string): Reponse => ({
  url: "https://badnet.fr/index.php",
  statutHttp: 200,
  contenu,
  cookies: [],
});

const TOURNOI = {
  evenement: 50750,
  nom: "TOURNOI DE DOUBLES DE VILLENEUVE 2026",
  date: new Date("2026-10-24T12:00:00"),
};

describe("la coquille de badnet", () => {
  it("porte l'action qui charge le contenu de la page demandée", () => {
    // Découvert en comparant deux coquilles : l'identifiant change avec l'URL,
    // donc il ne s'écrit jamais en dur.
    assert.equal(
      actionDeLaPage(reponse(fixture("badnet-coquille.html"))),
      "ab3f324495c38481f110e43653c90006",
    );
    assert.equal(actionDeLaPage(reponse("<div>rien</div>")), null);
  });

  it("porte, sur une fiche, l'autoload qui réclame l'inscription", () => {
    assert.equal(
      actionDeLaFiche(reponse(fixture("badnet-autoload.html"))),
      "e2ed2ead0de0faec9bdc89b08fb8334d",
    );
  });

  it("passe l'identifiant du tournoi et la licence à l'autoload", () => {
    // Sans eux, badnet répond pour `eventid: -1` — un tournoi qui n'existe pas.
    const requete = ficheDuTournoi("action", "PHPSESSID=x", 50750, licence("07194591"));

    assert.match(requete.corps ?? "", /eventid=50750/);
    assert.match(requete.corps ?? "", /license=07194591/);
    assert.equal(requete.jeton, "PHPSESSID=x");
  });
});

describe("la liste des tournois engagés", () => {
  const tournois = tournoisEngages(reponse(fixture("badnet-competitions.html")));

  /**
   * `/competitions` porte trois cartes. Avaler les deux autres ferait
   * apparaître dans mon agenda des tournois où je ne joue pas — ceux que le
   * club organise, et les nationaux.
   */
  it("ne retient que la carte « Mes tournois »", () => {
    assert.deepEqual(
      tournois.map(({ evenement }) => evenement),
      [50750, 50902],
    );
  });

  it("lit la date sur `data-sort`, pas sur le texte affiché", () => {
    // `24-10-2026` à l'écran, `2026-10-24` en attribut : la même valeur, mais
    // sans ambiguïté sur le jour et le mois.
    assert.equal(tournois[0]?.date.getFullYear(), 2026);
    assert.equal(tournois[0]?.date.getMonth(), 9);
    assert.equal(tournois[0]?.date.getDate(), 24);
  });

  it("rend le nom sans la pastille de couleur qui le précède", () => {
    assert.equal(tournois[0]?.nom, "TOURNOI DE DOUBLES DE VILLENEUVE 2026");
    assert.equal(tournois[1]?.nom, "OPEN DE PRINTEMPS");
  });

  it("ne rend rien d'une page qui n'est pas la liste", () => {
    assert.deepEqual(tournoisEngages(reponse("<div>autre chose</div>")), []);
  });
});

describe("la fiche d'inscription", () => {
  const engagement = engagementDuTournoi(
    reponse(fixture("badnet-fiche-tournoi.html")),
    TOURNOI,
  );

  /**
   * Le résumé dit « Oui (tableaux cachés par l'organisateur) » dès que celui-ci
   * les masque, ce qui est le cas courant. Le formulaire de modification, lui,
   * porte toujours ma propre inscription.
   */
  it("lit le tableau sur le formulaire, que le résumé masque", () => {
    assert.deepEqual(
      engagement.tableaux.map(({ tableau, serie }) => [tableau, serie]),
      [["DH", "S4"]],
    );
  });

  it("rend le partenaire du double, licence et nom", () => {
    assert.deepEqual(engagement.tableaux[0]?.partenaire, {
      licence: "06571233",
      nom: "MARTIN Claire",
    });
  });

  it("n'invente pas un engagement là où le choix est « Non »", () => {
    // Le mixte est à « Non » et son partenaire est vide : ce n'est pas un
    // engagement sans partenaire, c'est une absence d'engagement.
    assert.equal(
      engagement.tableaux.some(({ tableau }) => tableau === "MX"),
      false,
    );
  });

  it("garde la dernière phrase du statut, pas la première", () => {
    // La fiche les empile — envoyée, enregistrée, payée : c'est l'état courant
    // qui intéresse, pas l'historique.
    assert.equal(engagement.statut, "Inscription payée");
  });

  it("reprend le nom et la date de la liste, pas de la fiche", () => {
    // La fiche ne porte pas la date du tournoi : c'est la liste qui l'a.
    assert.equal(engagement.nom, TOURNOI.nom);
    assert.deepEqual(engagement.date, TOURNOI.date);
  });
});
