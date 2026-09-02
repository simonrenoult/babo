import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChargeDuJeton, Compte, DepotCompte, HachageDeMotDePasse, SignatureDeJeton } from "./authentification.ts";
import {
  ECHECS_AVANT_VERROU,
  PLAFOND,
  VALIDITE,
  VERROU_MAXIMUM,
  aRenouveler,
  creerAuthentification,
  creerPortier,
  echeance,
  examiner,
} from "./authentification.ts";
import { licence } from "./licence.ts";

const MOI = licence("07194591");
const MOT_DE_PASSE = "un-mot-de-passe-de-test";
const CONNEXION = new Date("2026-03-01T08:00:00Z");
const JOUR = 24 * 60 * 60_000;

function horlogeMobile(depart: Date) {
  let maintenant = depart;
  return {
    maintenant: () => maintenant,
    aller: (quand: Date) => void (maintenant = quand),
    apres: (jours: number) => void (maintenant = new Date(depart.getTime() + jours * JOUR)),
  };
}

/** Le hachage réel est lent à dessein ; ici seule la politique est en cause. */
const hachageFactice: HachageDeMotDePasse = {
  hacher: (clair) => `haché:${clair}`,
  verifier: (clair, hache) => hache === `haché:${clair}`,
};

/** Une « signature » réversible : le cœur ne sait rien du HMAC, et le prouve. */
const signatureFactice: SignatureDeJeton = {
  signer: (charge) =>
    JSON.stringify({
      licence: charge.licence,
      connecteLe: charge.connecteLe.toISOString(),
      expireLe: charge.expireLe.toISOString(),
    }),
  lire: (jeton) => {
    try {
      const brut = JSON.parse(jeton) as Record<string, string>;
      return {
        licence: brut["licence"] ?? "",
        connecteLe: new Date(brut["connecteLe"] ?? ""),
        expireLe: new Date(brut["expireLe"] ?? ""),
      };
    } catch {
      return null;
    }
  },
};

function comptesEnMemoire(compte: Compte | null = null): DepotCompte & { pose: number } {
  let courant = compte;
  const suivi = {
    pose: 0,
    lire: () => courant,
    poser: (nouveau: Compte) => {
      courant = nouveau;
      suivi.pose += 1;
    },
  };
  return suivi;
}

function charge(connecteLe: Date, expireLe: Date): ChargeDuJeton {
  return { licence: MOI, connecteLe, expireLe };
}

describe("la fenêtre de session", () => {
  it("est valide tant que l'échéance glissante tient", () => {
    const jeton = charge(CONNEXION, new Date(CONNEXION.getTime() + VALIDITE));
    assert.equal(examiner(jeton, new Date(CONNEXION.getTime() + 29 * JOUR)), "valide");
    assert.equal(examiner(jeton, new Date(CONNEXION.getTime() + 31 * JOUR)), "expiree");
  });

  it("tombe au plafond même si l'échéance a été repoussée", () => {
    // La règle qui fait qu'une échéance glissante n'est pas une échéance
    // infinie : un cookie volé dont le voleur se sert tous les jours finit
    // quand même par mourir.
    const jeton = charge(CONNEXION, new Date(CONNEXION.getTime() + 200 * JOUR));
    assert.equal(examiner(jeton, new Date(CONNEXION.getTime() + 91 * JOUR)), "plafonnee");
  });

  it("ne distingue pas un jeton absent d'un jeton illisible", () => {
    assert.equal(examiner(null, CONNEXION), "absente");
  });

  it("ne repousse jamais l'échéance au-delà du plafond", () => {
    const tard = new Date(CONNEXION.getTime() + 89 * JOUR);
    assert.deepEqual(echeance(CONNEXION, tard), new Date(CONNEXION.getTime() + PLAFOND));
  });

  it("ne renouvelle qu'à la moitié de la validité consommée", () => {
    const jeton = charge(CONNEXION, new Date(CONNEXION.getTime() + VALIDITE));
    assert.equal(aRenouveler(jeton, new Date(CONNEXION.getTime() + JOUR)), false);
    assert.equal(aRenouveler(jeton, new Date(CONNEXION.getTime() + 20 * JOUR)), true);
  });

  it("cesse de renouveler quand le plafond ne laisse plus rien à gagner", () => {
    const jeton = charge(CONNEXION, new Date(CONNEXION.getTime() + PLAFOND));
    assert.equal(aRenouveler(jeton, new Date(CONNEXION.getTime() + 89 * JOUR)), false);
  });
});

describe("le portier", () => {
  it("laisse passer les premières erreurs de frappe", () => {
    const portier = creerPortier();
    for (let essai = 0; essai < ECHECS_AVANT_VERROU - 1; essai += 1) portier.echec(CONNEXION);
    assert.equal(portier.verrouJusqua(CONNEXION), null);
  });

  it("ferme la porte au-delà, puis la rouvre", () => {
    const portier = creerPortier();
    for (let essai = 0; essai < ECHECS_AVANT_VERROU; essai += 1) portier.echec(CONNEXION);

    const jusqua = portier.verrouJusqua(CONNEXION);
    assert.ok(jusqua, "cinq échecs ferment la porte");
    assert.equal(portier.verrouJusqua(new Date(jusqua.getTime() + 1)), null, "jamais définitif");
  });

  it("plafonne l'attente : un tiers ne doit pas pouvoir m'enfermer dehors", () => {
    const portier = creerPortier();
    for (let essai = 0; essai < 40; essai += 1) portier.echec(CONNEXION);

    const jusqua = portier.verrouJusqua(CONNEXION);
    assert.ok(jusqua);
    assert.ok(jusqua.getTime() - CONNEXION.getTime() <= VERROU_MAXIMUM);
  });

  it("oublie tout dès qu'une connexion aboutit", () => {
    const portier = creerPortier();
    for (let essai = 0; essai < ECHECS_AVANT_VERROU; essai += 1) portier.echec(CONNEXION);
    portier.succes();
    assert.equal(portier.verrouJusqua(CONNEXION), null);
  });
});

describe("la porte", () => {
  function monter(depart = CONNEXION) {
    const horloge = horlogeMobile(depart);
    const comptes = comptesEnMemoire();
    const authentification = creerAuthentification({
      comptes,
      hachage: hachageFactice,
      signature: signatureFactice,
      horloge,
    });
    authentification.poserLeCompte(MOI, MOT_DE_PASSE);
    return { authentification, comptes, horloge };
  }

  it("pose le compte au premier démarrage, puis se tait", () => {
    const { authentification, comptes } = monter();
    assert.equal(comptes.pose, 1);
    assert.equal(authentification.poserLeCompte(MOI, MOT_DE_PASSE), false);
    assert.equal(comptes.pose, 1, "un démarrage ne réécrit pas un haché identique");
  });

  it("réécrit le haché quand la configuration change", () => {
    // C'est le chemin de changement de mot de passe : éditer la variable et
    // redémarrer, ce que le service supervisé de 020 rend trivial.
    const { authentification, comptes } = monter();
    assert.equal(authentification.poserLeCompte(MOI, "un-autre-mot-de-passe"), true);
    assert.equal(comptes.pose, 2);
  });

  it("ouvre sur la bonne licence et le bon mot de passe", () => {
    const { authentification } = monter();
    const connexion = authentification.connecter(MOI, MOT_DE_PASSE);

    assert.equal(connexion.issue, "ouverte");
    if (connexion.issue !== "ouverte") return;
    assert.deepEqual(connexion.expireLe, new Date(CONNEXION.getTime() + VALIDITE));
    assert.equal(authentification.reconnaitre(connexion.jeton).verdict, "valide");
  });

  it("accepte la licence sans ses zéros de tête, comme partout ailleurs (028)", () => {
    // Personne ne tape « 07194591 » : le numéro est stocké sur huit chiffres,
    // la saisie doit passer par la même normalisation que le reste.
    const { authentification } = monter();
    assert.equal(authentification.connecter("7194591", MOT_DE_PASSE).issue, "ouverte");
  });

  it("refuse ce qui n'est pas un numéro de licence, sans lever", () => {
    const { authentification } = monter();
    assert.equal(authentification.connecter("", MOT_DE_PASSE).issue, "refusee");
    assert.equal(authentification.connecter("pas-un-numéro", MOT_DE_PASSE).issue, "refusee");
  });

  it("refuse le mauvais mot de passe, et la mauvaise licence, du même mot", () => {
    const { authentification } = monter();
    assert.equal(authentification.connecter(MOI, "presque").issue, "refusee");
    assert.equal(authentification.connecter("00000001", MOT_DE_PASSE).issue, "refusee");
  });

  it("ferme la porte après cinq échecs, mot de passe correct compris", () => {
    const { authentification } = monter();
    for (let essai = 0; essai < ECHECS_AVANT_VERROU; essai += 1) {
      authentification.connecter(MOI, "faux");
    }

    const connexion = authentification.connecter(MOI, MOT_DE_PASSE);
    assert.equal(connexion.issue, "verrouillee");
  });

  it("repousse l'échéance d'un jeton à mi-course, sans toucher à la connexion", () => {
    const { authentification, horloge } = monter();
    const connexion = authentification.connecter(MOI, MOT_DE_PASSE);
    assert.equal(connexion.issue, "ouverte");
    if (connexion.issue !== "ouverte") return;

    horloge.apres(20);
    const { verdict, renouvele } = authentification.reconnaitre(connexion.jeton);

    assert.equal(verdict, "valide");
    assert.ok(renouvele, "vingt jours plus tard, la visite prolonge");
    assert.deepEqual(
      renouvele.expireLe,
      new Date(CONNEXION.getTime() + 20 * JOUR + VALIDITE),
    );
    const relu = signatureFactice.lire(renouvele.jeton);
    assert.deepEqual(relu?.connecteLe, CONNEXION, "la date de connexion ne bouge jamais");
  });

  it("finit par redemander le mot de passe, même à qui visite tous les jours", () => {
    const { authentification, horloge } = monter();
    const connexion = authentification.connecter(MOI, MOT_DE_PASSE);
    assert.equal(connexion.issue, "ouverte");
    if (connexion.issue !== "ouverte") return;

    // Une visite par jour pendant cent jours : l'échéance glisse, le plafond
    // non.
    let jeton = connexion.jeton;
    let dernierVerdict = "valide";
    for (let jour = 1; jour <= 100; jour += 1) {
      horloge.apres(jour);
      const vu = authentification.reconnaitre(jeton);
      dernierVerdict = vu.verdict;
      if (vu.verdict !== "valide") break;
      if (vu.renouvele !== null) jeton = vu.renouvele.jeton;
    }

    assert.equal(dernierVerdict, "plafonnee");
  });

  it("tient un jeton falsifié pour absent", () => {
    const { authentification } = monter();
    assert.equal(authentification.reconnaitre("n'importe quoi").verdict, "absente");
    assert.equal(authentification.reconnaitre(null).verdict, "absente");
  });
});
