import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CalendrierRefuse } from "../core/calendrier.ts";
import { lireLaPageDeGroupe, verifierLURLDuGroupe } from "./calendrier-icbad.ts";

/** La page réelle du groupe B de l'ICD75 D3 Mixte, capturée le 30 septembre 2026. */
const PAGE = readFileSync(new URL("exemples/icbad-groupe.html", import.meta.url), "utf8");

function refus(geste: () => unknown): string {
  try {
    geste();
  } catch (erreur) {
    assert.ok(erreur instanceof CalendrierRefuse, `attendu un refus, reçu ${String(erreur)}`);
    return erreur.message;
  }
  return assert.fail("aurait dû être refusé");
}

describe("la page d'un groupe icbad", () => {
  it("lit la compétition, le groupe et les trente rencontres", () => {
    const page = lireLaPageDeGroupe(PAGE);

    assert.equal(page.competition, "Interclubs Comité 75 D3 - ICD75 D3 Mixte");
    assert.equal(page.groupe, "Groupe B");
    assert.equal(page.rencontres.length, 30, "six équipes, dix journées, trois rencontres chacune");
    assert.deepEqual(
      [...new Set(page.rencontres.map(({ journee }) => journee))],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  });

  it("lit une rencontre entière, heure et lieu compris", () => {
    const [premiere] = lireLaPageDeGroupe(PAGE).rencontres;

    assert.deepEqual(premiere, {
      id: 796864,
      journee: 1,
      debut: new Date("2026-11-03T20:30:00"),
      lieu: "Gymnase Alice Milliat, 75014 PARIS",
      domicile: { nom: "Bad’ à Paname 5", code: "75-BAP-5" },
      exterieur: { nom: "Racing Club de France 4", code: "75-RCF-4" },
    });
  });

  it("place l'hiver dans l'année qui suit le début de la saison", () => {
    const derniere = lireLaPageDeGroupe(PAGE).rencontres.at(-1);

    assert.deepEqual(derniere?.debut, new Date("2027-02-06T20:00:00"));
  });

  it("refuse une page qui n'est pas celle d'un groupe", () => {
    assert.match(refus(() => lireLaPageDeGroupe("<html><body>Maintenance</body></html>")), /ne ressemble pas/);
  });
});

describe("l'adresse du groupe", () => {
  it("accepte la page d'un groupe, barre finale ou pas", () => {
    assert.equal(
      verifierLURLDuGroupe("  https://icbad.ffbad.org/competition/2601367/tableau/19107/ "),
      "https://icbad.ffbad.org/competition/2601367/tableau/19107",
    );
  });

  it("refuse la page de la compétition en disant où cliquer", () => {
    assert.match(
      refus(() => verifierLURLDuGroupe("https://icbad.ffbad.org/competition/2601367")),
      /Voir listing, calendrier des rencontres/,
    );
  });

  it("refuse toute autre adresse : le serveur ne lit pas ce qu'on lui tend", () => {
    assert.match(refus(() => verifierLURLDuGroupe("http://127.0.0.1:3000/")), /icbad/);
    assert.match(
      refus(() => verifierLURLDuGroupe("https://icbad.ffbad.org.ailleurs.test/competition/1/tableau/2")),
      /icbad/,
    );
  });
});
