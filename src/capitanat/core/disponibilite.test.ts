import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { licence } from "../../socle/core/licence.ts";
import type { CalendrierDInterclub, Rencontre } from "./calendrier.ts";
import type { MembreDeLEquipe } from "./coequipier.ts";
import type { Sondage } from "./disponibilite.ts";
import { grilleDesDisponibilites, suggestionPour, verifierContreLeCalendrier } from "./disponibilite.ts";

const CPS = { nom: "CPS Xtrem Bad 5", code: "75-CPS10-5" };
const BAD18 = { nom: "Badminton Paris 18eme 5", code: "75-BAD18-5" };

const rencontre = (journee: number, debut: string): Rencontre => ({
  id: journee,
  journee,
  debut: new Date(debut),
  lieu: "Gymnase",
  domicile: BAD18,
  exterieur: CPS,
});

const CALENDRIER: CalendrierDInterclub = {
  url: "https://icbad.ffbad.org/competition/2601367/tableau/19107",
  equipe: CPS,
  competition: "ICD75 D3 Mixte",
  groupe: "Groupe B",
  importeLe: new Date(),
  rencontres: [rencontre(1, "2026-11-05T20:00:00"), rencontre(2, "2026-11-14T20:00:00")],
};

const membre = (numero: string, nom: string | null, sexe: "F" | "M"): MembreDeLEquipe => ({
  licence: licence(numero),
  sexe,
  telephone: "0600000000",
  appel: "0600000000",
  fiche: "",
  nom,
  classements: [],
  vuLe: null,
});

const SIMON = membre("07194591", "Simon RENOULT", "M");
const LUCIE = membre("00000002", "Lucie BELKA", "F");
const SIMONE = membre("00000003", "Simone MARTIN", "F");

const sondage = (journees: Sondage["journees"]): Sondage => ({ journees, repondants: [] });

describe("les disponibilités", () => {
  it("acceptent un sondage dont chaque journée tombe à la date du calendrier", () => {
    assert.deepEqual(
      verifierContreLeCalendrier(
        sondage([
          { journee: 1, date: "2026-11-05" },
          { journee: 2, date: "2026-11-14" },
        ]),
        CALENDRIER,
      ),
      [],
    );
  });

  it("refusent un sondage d'un autre calendrier, par la date", () => {
    const [motif] = verifierContreLeCalendrier(sondage([{ journee: 1, date: "2026-11-03" }]), CALENDRIER);

    assert.match(motif?.raison ?? "", /J1 est datée du 03\/11\/2026 dans le sondage, du 05\/11\/2026 au calendrier/);
  });

  it("refusent tant qu'aucun calendrier n'est importé", () => {
    const [motif] = verifierContreLeCalendrier(sondage([{ journee: 1, date: "2026-11-05" }]), null);

    assert.match(motif?.raison ?? "", /Importer d'abord le calendrier/);
  });

  it("proposent le membre dont le prénom est le nom du sondage, s'il est seul", () => {
    assert.equal(suggestionPour("simon", [SIMON, LUCIE, SIMONE]), SIMON.licence);
    assert.equal(suggestionPour("Madoche", [SIMON, LUCIE]), null, "un surnom ne se devine pas");
    assert.equal(
      suggestionPour("Simon", [SIMON, membre("00000004", "Simon DURAND", "M")]),
      null,
      "deux Simon : on ne choisit pas",
    );
  });

  it("comptent les disponibles par sexe, et à part ceux qu'aucun membre ne porte", () => {
    const grille = grilleDesDisponibilites({
      calendrier: CALENDRIER,
      membres: [SIMON, LUCIE, SIMONE],
      repondants: [
        { nom: "Simon", remarque: null, licence: SIMON.licence },
        { nom: "Madoche", remarque: "blessée", licence: LUCIE.licence },
        { nom: "Inconnu", remarque: null, licence: null },
      ],
      reponses: [
        { nom: "Simon", journee: 1, reponse: "oui" },
        { nom: "Madoche", journee: 1, reponse: "si-besoin" },
        { nom: "Inconnu", journee: 1, reponse: "oui" },
      ],
    });
    const [j1, j2] = grille.colonnes;

    assert.deepEqual(j1?.disponibles, { F: 0, M: 1 });
    assert.deepEqual(j1?.siBesoin, { F: 1, M: 0 });
    assert.equal(j1?.nonRattaches, 1);
    assert.equal(j1?.sondee, true);
    assert.equal(j2?.sondee, false, "J2 n'a pas encore été sondée");
    assert.deepEqual(
      grille.silencieux.map(({ nom }) => nom),
      ["Simone MARTIN"],
    );
  });
});
