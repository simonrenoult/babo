import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendrierDInterclub } from "../core/calendrier.ts";
import { enIcs, evenementDe, lienGoogle } from "./agenda.ts";

const CPS = { nom: "CPS Xtrem Bad 5", code: "75-CPS10-5" };
const BAD = { nom: "Badminton Paris 18eme 5", code: "75-BAD18-5" };
const CALENDRIER: CalendrierDInterclub = {
  url: "https://icbad.ffbad.org/competition/2601367/tableau/19107",
  equipe: CPS,
  competition: "ICD75 D3 Mixte",
  groupe: "Groupe B",
  importeLe: new Date("2026-09-01T10:00:00Z"),
  rencontres: [
    {
      id: 796900,
      journee: 2,
      debut: new Date("2026-11-14T19:00:00Z"),
      lieu: "Gymnase Ronsard, 120 rue de Tolbiac, Paris",
      domicile: BAD,
      exterieur: CPS,
    },
  ],
};
const [RENCONTRE] = CALENDRIER.rencontres;

describe("le calendrier, dans un agenda", () => {
  it("nomme la rencontre par ses sigles, le recevant d'abord, sur deux heures et demie", () => {
    assert.ok(RENCONTRE !== undefined);
    const evenement = evenementDe(RENCONTRE, CALENDRIER);

    assert.equal(evenement.titre, "J02 · BAD18-5 – CPS10-5");
    assert.equal(evenement.fin.toISOString(), "2026-11-14T21:30:00.000Z");
  });

  it("écrit un iCalendar valide : CRLF, UID stable, heures UTC, texte échappé, lignes pliées", () => {
    const ics = enIcs(CALENDRIER, new Date("2026-09-30T12:00:00Z"));

    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
    assert.match(ics, /\r\nUID:rencontre-796900@babo\r\n/);
    assert.match(ics, /\r\nDTSTART:20261114T190000Z\r\nDTEND:20261114T213000Z\r\n/);
    assert.match(ics, /LOCATION:Gymnase Ronsard\\, 120 rue de Tolbiac\\, Paris/);
    for (const ligne of ics.split("\r\n")) assert.ok(Buffer.byteLength(ligne) <= 75, ligne);
  });

  it("ouvre Google Agenda sur l'événement prérempli", () => {
    assert.ok(RENCONTRE !== undefined);
    const lien = new URL(lienGoogle(evenementDe(RENCONTRE, CALENDRIER)));

    assert.equal(lien.hostname, "calendar.google.com");
    assert.equal(lien.searchParams.get("dates"), "20261114T190000Z/20261114T213000Z");
    assert.equal(lien.searchParams.get("text"), "J02 · BAD18-5 – CPS10-5");
  });
});
