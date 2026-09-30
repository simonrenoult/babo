import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Classement } from "../../socle/core/classement.ts";
import type { Licence } from "../../socle/core/licence.ts";
import { licence } from "../../socle/core/licence.ts";
import type { EquipeDInterclub, Rencontre } from "./calendrier.ts";
import type { MembreDeLEquipe } from "./coequipier.ts";
import type { Reponse } from "./disponibilite.ts";
import {
  POSTES,
  candidatsAuPoste,
  fautesDeLaComposition,
  fautesParMatch,
  texteDeLaComposition,
  lignesDeLaFeuille,
  matchsParJoueur,
  placesVides,
  sollicitations,
} from "./composition.ts";

const membre = (
  numero: string,
  nom: string,
  sexe: "F" | "M",
  simple: number | null,
): MembreDeLEquipe => ({
  licence: licence(numero),
  sexe,
  telephone: "0600000000",
  appel: "0600000000",
  fiche: "",
  nom,
  classements:
    simple === null ? [] : [{ discipline: "simple", lettre: "D8", cpph: simple } satisfies Classement],
  vuLe: null,
});

const ALEX = membre("00000001", "Alex", "M", 1500);
const BRUNO = membre("00000002", "Bruno", "M", 900);
const CLAUDE = membre("00000003", "Claude", "M", null);
const DORA = membre("00000004", "Dora", "F", 1200);
const EVA = membre("00000005", "Eva", "F", 800);
const MEMBRES = [ALEX, BRUNO, CLAUDE, DORA, EVA];

const tousDisponibles = new Map<Licence, Reponse>(MEMBRES.map(({ licence: numero }) => [numero, "oui"]));
const composition = (places: Record<string, MembreDeLEquipe>) =>
  new Map(Object.entries(places).map(([poste, joueur]) => [poste, joueur.licence]));

describe("la composition d'une journée", () => {
  it("compte neuf places pour six matchs", () => {
    assert.equal(POSTES.length, 9);
    assert.equal(placesVides(new Map()), 9);
  });

  it("ne propose sur un poste que le bon sexe, disponible ou si besoin, les disponibles d'abord", () => {
    const reponses = new Map<Licence, Reponse>([
      [ALEX.licence, "si-besoin"],
      [BRUNO.licence, "oui"],
      [CLAUDE.licence, "non"],
      [DORA.licence, "oui"],
    ]);
    const sh1 = POSTES.find(({ id }) => id === "SH1");
    assert.ok(sh1 !== undefined);

    assert.deepEqual(
      candidatsAuPoste(sh1, MEMBRES, reponses).map(({ membre: joueur, reponse }) => `${joueur.nom} ${reponse}`),
      ["Bruno oui", "Alex si-besoin"],
    );
  });

  it("accepte une composition complète et conforme", () => {
    const complete = composition({
      SH1: ALEX,
      SH2: BRUNO,
      SD: DORA,
      "DH-1": CLAUDE,
      "DH-2": ALEX,
      "DD-1": DORA,
      "DD-2": EVA,
      "MX-F": EVA,
      "MX-H": BRUNO,
    });

    assert.deepEqual(fautesDeLaComposition(complete, MEMBRES, tousDisponibles), []);
    assert.equal(placesVides(complete), 0);
    assert.equal(matchsParJoueur(complete).get(ALEX.licence), 2);
  });

  it("accepte une composition incomplète : on planifie en plusieurs fois", () => {
    assert.deepEqual(fautesDeLaComposition(composition({ SH1: ALEX }), MEMBRES, tousDisponibles), []);
  });

  it("refuse un SH1 dont la moyenne est inférieure à celle du SH2", () => {
    const [faute] = fautesDeLaComposition(composition({ SH1: BRUNO, SH2: ALEX }), MEMBRES, tousDisponibles);

    assert.match(faute ?? "", /Le SH1 \(Bruno, 900 points\) a une moyenne inférieure au SH2 \(Alex, 1\s?500 points\)/);
  });

  it("compte pour zéro un SH1 non classé en simple", () => {
    const [faute] = fautesDeLaComposition(composition({ SH1: CLAUDE, SH2: BRUNO }), MEMBRES, tousDisponibles);

    assert.match(faute ?? "", /Claude, 0 points/);
  });

  it("refuse un troisième match pour le même joueur", () => {
    const fautes = fautesDeLaComposition(
      composition({ SH1: ALEX, "DH-1": ALEX, "MX-H": ALEX }),
      MEMBRES,
      tousDisponibles,
    );

    assert.deepEqual(fautes, ["Alex joue 3 matchs (SH1, DH, MX) : 2 au plus par rencontre."]);
  });

  it("refuse un joueur qui n'a pas dit oui ou si besoin", () => {
    const reponses = new Map<Licence, Reponse>([[ALEX.licence, "non"]]);

    assert.deepEqual(fautesDeLaComposition(composition({ SH1: ALEX, SH2: BRUNO }), MEMBRES, reponses), [
      "Simple hommes 1 : Alex n'est pas disponible à cette journée (a répondu non).",
      "Simple hommes 2 : Bruno n'est pas disponible à cette journée (pas de réponse au sondage).",
    ]);
  });

  it("refuse une dame sur une place d'homme, et un joueur seul en paire", () => {
    assert.deepEqual(
      fautesDeLaComposition(composition({ SH1: DORA, "DH-1": ALEX, "DH-2": ALEX }), MEMBRES, tousDisponibles),
      ["Simple hommes 1 : Dora n'y a pas sa place.", "Double hommes : Alex ne fait pas une paire à lui seul."],
    );
  });

  it("désigne les matchs que chaque faute touche, pour marquer la bonne carte", () => {
    const matchs = (places: Parameters<typeof composition>[0]) =>
      fautesParMatch(composition(places), MEMBRES, tousDisponibles).map((faute) => faute.matchs);

    assert.deepEqual(matchs({ SH1: BRUNO, SH2: ALEX }), [["SH1", "SH2"]], "le SH1 plus faible : les deux simples");
    assert.deepEqual(matchs({ SH1: ALEX, "DH-1": ALEX, "MX-H": ALEX }), [["SH1", "DH", "MX"]], "trois matchs");
    assert.deepEqual(matchs({ SD: ALEX }), [["SD"]], "un homme en simple dames");
  });
});

describe("la composition, sur la feuille de rencontre", () => {
  it("suit l'ordre de la feuille, l'homme d'abord au mixte, NC hors classement", () => {
    const lignes = lignesDeLaFeuille(composition({ SH1: ALEX, "MX-F": DORA, "MX-H": CLAUDE }), MEMBRES);

    assert.deepEqual(
      lignes.map(({ match }) => match),
      ["SH1", "SH2", "SD1", "DH1", "DD1", "DX1"],
    );
    assert.deepEqual(lignes[0]?.joueurs, [{ identite: "00000001 - Alex", classement: "D8", cote: "1\u202f500" }]);
    assert.deepEqual(lignes[1]?.joueurs, [null]);
    assert.deepEqual(lignes[5]?.joueurs, [
      { identite: "00000003 - Claude", classement: "NC", cote: "" },
      { identite: "00000004 - Dora", classement: "NC", cote: "" },
    ]);
  });
});

describe("la sollicitation des joueurs", () => {
  const reponsesDe = (journee: number) =>
    new Map<Licence, Reponse>(
      journee === 3
        ? [
            [ALEX.licence, "non"],
            [BRUNO.licence, "si-besoin"],
          ]
        : [
            [ALEX.licence, "oui"],
            [BRUNO.licence, "oui"],
          ],
    );

  it("compte les journées composées où le joueur était disponible, et celles où il a été retenu", () => {
    const usage = sollicitations({
      journee: 4,
      compositions: new Map([
        [1, composition({ SH1: ALEX, "DH-1": ALEX })],
        [2, composition({ SH1: ALEX, SH2: BRUNO })],
        [3, composition({ SH1: BRUNO })],
      ]),
      reponsesDe,
    });

    assert.deepEqual(usage.get(ALEX.licence), { selections: 2, occasions: 2 }, "deux tableaux la même journée comptent pour un, et J3 où il a dit non ne compte pas");
    assert.deepEqual(usage.get(BRUNO.licence), { selections: 2, occasions: 2.5 }, "si besoin compte pour une demi-occasion");
  });

  it("compte toutes les journées composées quand aucune n'est en cours", () => {
    const usage = sollicitations({
      compositions: new Map([
        [1, composition({ SH1: ALEX })],
        [2, composition({ SH1: BRUNO })],
      ]),
      reponsesDe,
    });

    assert.deepEqual(usage.get(ALEX.licence), { selections: 1, occasions: 2 });
  });

  it("ignore la journée qu'on compose, et celles qui ne le sont pas encore", () => {
    const usage = sollicitations({
      journee: 1,
      compositions: new Map([
        [1, composition({ SH1: ALEX })],
        [2, new Map()],
      ]),
      reponsesDe,
    });

    assert.equal(usage.size, 0);
  });
});

const NOUS: EquipeDInterclub = { nom: "Bad’ à Paname 5", code: "75-BAP-5" };
const EUX: EquipeDInterclub = { nom: "Bad’ à Paname 18 5", code: "75-BAP18-5" };
const RENCONTRE: Rencontre = {
  id: 42,
  journee: 3,
  debut: new Date(2026, 9, 10, 20, 30),
  lieu: "Gymnase Jean Jaurès, Paris",
  domicile: EUX,
  exterieur: NOUS,
};
const texte = (places: Record<string, MembreDeLEquipe>, membres: readonly MembreDeLEquipe[], rencontre = RENCONTRE) =>
  texteDeLaComposition(composition(places), membres, rencontre, EUX);

describe("la composition, en texte à partager", () => {
  it("situe la rencontre en première ligne : journée, adversaire, date, heure, lieu", () => {
    assert.equal(
      texte({ SH1: ALEX }, MEMBRES).split("\n")[0],
      "J03 vs BAP18-5 📅 samedi 10 octobre 🕗 20h30 📍 Gymnase Jean Jaurès, Paris",
    );
  });

  it("fait suivre la rencontre des matchs, sans ligne vide", () => {
    assert.equal(
      texte({ SH1: ALEX, "DH-1": ALEX, "DH-2": BRUNO }, MEMBRES),
      "J03 vs BAP18-5 📅 samedi 10 octobre 🕗 20h30 📍 Gymnase Jean Jaurès, Paris\n* SH1 : Alex\n* DH : Alex & Bruno",
    );
  });

  it("tait les minutes d'une heure pile", () => {
    const aVingtHeures = { ...RENCONTRE, debut: new Date(2026, 9, 10, 20, 0) };

    assert.match(texte({ SH1: ALEX }, MEMBRES, aVingtHeures), /🕗 20h 📍/);
  });

  it("liste ensuite les matchs où quelqu'un est retenu, par prénom, sans cote", () => {
    const simon = { ...ALEX, nom: "Simon RENOULT" };
    const marie = { ...DORA, nom: "Marie-Anne DE LA TOUR" };

    assert.equal(
      texte({ SH1: simon, SD: marie, "DH-1": simon, "DH-2": BRUNO }, [simon, BRUNO, marie]).split("\n").slice(1).join("\n"),
      "* SH1 : Simon\n* SD : Marie-Anne\n* DH : Simon & Bruno",
    );
  });

  it("donne le nom complet quand deux membres partagent un prénom", () => {
    const un = { ...ALEX, nom: "Simon RENOULT" };
    const autre = { ...BRUNO, nom: "Simon MARTIN" };

    assert.deepEqual(texte({ SH1: un, SH2: autre }, [un, autre]).split("\n").slice(1), [
      "* SH1 : Simon RENOULT",
      "* SH2 : Simon MARTIN",
    ]);
  });

  it("ne dit rien d'une composition vide, pas même la rencontre", () => {
    assert.equal(texte({}, MEMBRES), "");
  });
});
