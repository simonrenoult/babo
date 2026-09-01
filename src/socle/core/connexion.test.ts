import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientHttp, ModuleDAcquisition, Reponse, Requete } from "./acquisition.ts";
import { ActionIntrouvable } from "./acquisition.ts";
import type { DepotJetonMyffbad, JetonMyffbad } from "./jeton-myffbad.ts";
import { ConnexionImpossible, ConnexionRefusee, seConnecter } from "./connexion.ts";

const LE_JOUR = new Date("2026-09-01T08:00:00Z");
const horlogeFigee = { maintenant: () => LE_JOUR };

const savantConnexion: ModuleDAcquisition = {
  source: "myffbad",
  pagesDeLaSonde: () => [],
  murDeConnexion: () => false,
  connexion: {
    requete: (motDePasse) => ({
      url: "https://www.myffbad.fr/connexion",
      jeton: null,
      methode: "POST",
      corps: JSON.stringify([{ licence: "07194591", password: motDePasse, rememberMe: true }]),
      entetes: { "next-action": "40960127" },
    }),
    jetonDepuisLesCookies: (cookies) =>
      cookies.map((c) => c.split(";")[0]?.trim() ?? "").find((c) => c.startsWith("jwt=")) ?? null,
  },
  expirationDuJeton: () => new Date("2026-10-01T15:43:35Z"),
};

const ignorantConnexion: ModuleDAcquisition = {
  source: "badnet",
  pagesDeLaSonde: () => [],
  murDeConnexion: () => false,
};

function client(reponse: Partial<Reponse>): ClientHttp & { vues: Requete[] } {
  const vues: Requete[] = [];
  return {
    vues,
    recuperer(requete) {
      vues.push(requete);
      return Promise.resolve({
        url: requete.url,
        statutHttp: 200,
        contenu: "",
        cookies: [],
        ...reponse,
      });
    },
  };
}

function depotJetons(): DepotJetonMyffbad & { enregistres: JetonMyffbad[] } {
  const enregistres: JetonMyffbad[] = [];
  return {
    enregistres,
    lire: () => enregistres.at(-1) ?? null,
    enregistrer: (_source, jeton) => void enregistres.push(jeton),
    effacer: () => {},
  };
}

describe("la connexion autonome", () => {
  it("poste les identifiants et persiste le jeton rendu", async () => {
    const reseau = client({
      cookies: ["rgpd=0; Path=/", "jwt=eyJhbG.charge.sig; Path=/; HttpOnly; Secure"],
    });
    const jetons = depotJetons();

    const jeton = await seConnecter({
      client: reseau,
      module: savantConnexion,
      motDePasse: "un-secret",
      jetons,
      horloge: horlogeFigee,
    });

    assert.equal(jeton.valeur, "jwt=eyJhbG.charge.sig");
    assert.deepEqual(jeton.expireLe, new Date("2026-10-01T15:43:35Z"), "l'échéance vient du jeton");
    assert.deepEqual(jetons.enregistres, [jeton]);
    assert.equal(reseau.vues[0]?.methode, "POST");
  });

  it("ne laisse pas le mot de passe ailleurs que dans la requête", async () => {
    const reseau = client({ cookies: ["jwt=a.b.c"] });
    const jetons = depotJetons();

    await seConnecter({
      client: reseau,
      module: savantConnexion,
      motDePasse: "un-secret",
      jetons,
      horloge: horlogeFigee,
    });

    // Le jeton est ce qui entre en base ; le mot de passe reste en mémoire.
    assert.doesNotMatch(JSON.stringify(jetons.enregistres), /un-secret/);
  });

  it("distingue l'identifiant d'action périmé d'une session refusée", async () => {
    const reseau = client({ statutHttp: 404, contenu: "Server action not found." });

    await assert.rejects(
      seConnecter({
        client: reseau,
        module: savantConnexion,
        motDePasse: "un-secret",
        jetons: depotJetons(),
        horloge: horlogeFigee,
      }),
      ActionIntrouvable,
    );
  });

  it("refuse une réponse sans jeton plutôt que d'en fabriquer un", async () => {
    const reseau = client({ statutHttp: 200, cookies: ["rgpd=0"] });

    await assert.rejects(
      seConnecter({
        client: reseau,
        module: savantConnexion,
        motDePasse: "mauvais",
        jetons: depotJetons(),
        horloge: horlogeFigee,
      }),
      ConnexionRefusee,
    );
  });

  it("dit franchement qu'une source à 2FA ne se connecte pas seule", async () => {
    await assert.rejects(
      seConnecter({
        client: client({}),
        module: ignorantConnexion,
        motDePasse: "un-secret",
        jetons: depotJetons(),
        horloge: horlogeFigee,
      }),
      ConnexionImpossible,
    );
  });
});
