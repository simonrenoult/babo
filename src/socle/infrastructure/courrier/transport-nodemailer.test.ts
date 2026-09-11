import assert from "node:assert/strict";
import { createServer, type Server, type Socket } from "node:net";
import { after, describe, it } from "node:test";
import type { ConfigurationCourrier } from "../../core/configuration.ts";
import { transportNodemailer } from "./transport-nodemailer.ts";

/**
 * Le dialogue SMTP, testé contre un faux serveur local — spec 016.
 *
 * Ce qu'on veut couvrir n'est pas que `nodemailer` sait sérialiser un message :
 * c'est ce que fait l'adaptateur quand l'authentification est refusée et quand
 * la connexion tombe au milieu du dialogue, les deux façons dont une alerte de
 * 019 se perdrait en silence. Les transports de test de `nodemailer` ne peuvent
 * simuler ni l'un ni l'autre — ils ne se connectent à rien.
 *
 * Le faux serveur écoute **en clair**, sur un port libre : c'est ce qui fait
 * que l'adaptateur déduit son chiffrement du port plutôt que de le prendre en
 * réglage. TLS n'est donc pas couvert ici, et c'est le trou assumé de ce choix.
 */

type Panne = "aucune" | "authentification" | "coupure";

type FauxServeur = {
  readonly port: number;
  /** Les commandes reçues, corps du message compris. */
  readonly recu: () => string[];
  fermer: () => Promise<void>;
};

function fauxServeurSmtp(panne: Panne): Promise<FauxServeur> {
  const recu: string[] = [];
  const connexions = new Set<Socket>();

  const serveur: Server = createServer((socket) => {
    connexions.add(socket);
    socket.on("close", () => connexions.delete(socket));
    // Une connexion coupée par le serveur est une erreur côté client, pas ici.
    socket.on("error", () => undefined);

    let tampon = "";
    let dansLeCorps = false;

    socket.write("220 localhost ESMTP faux\r\n");

    socket.on("data", (donnees) => {
      tampon += donnees.toString("utf8");

      let coupure = tampon.indexOf("\r\n");
      while (coupure !== -1) {
        const ligne = tampon.slice(0, coupure);
        tampon = tampon.slice(coupure + 2);
        recu.push(ligne);
        repondre(ligne);
        coupure = tampon.indexOf("\r\n");
      }
    });

    const repondre = (ligne: string): void => {
      if (dansLeCorps) {
        // Le point seul ferme les données : c'est le seul terminateur du
        // protocole, et le corps encodé passe au travers sans être analysé.
        if (ligne === ".") {
          dansLeCorps = false;
          socket.write("250 2.0.0 accepté\r\n");
        }
        return;
      }

      const commande = ligne.toUpperCase();

      if (commande.startsWith("EHLO") || commande.startsWith("HELO")) {
        // `STARTTLS` n'est pas annoncé : le client reste en clair, ce qui est
        // tout l'intérêt de ce serveur de test.
        socket.write("250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n");
        return;
      }

      if (commande.startsWith("AUTH")) {
        socket.write(
          panne === "authentification"
            ? "535 5.7.8 Username and Password not accepted\r\n"
            : "235 2.7.0 accepté\r\n",
        );
        return;
      }

      if (commande.startsWith("MAIL FROM")) {
        // La coupure tombe ici, une fois l'authentification passée : c'est le
        // milieu du dialogue, pas son ouverture.
        if (panne === "coupure") return void socket.destroy();
        socket.write("250 2.1.0 accepté\r\n");
        return;
      }

      if (commande.startsWith("RCPT TO")) return void socket.write("250 2.1.5 accepté\r\n");

      if (commande.startsWith("DATA")) {
        dansLeCorps = true;
        socket.write("354 envoyer les données, terminer par un point seul\r\n");
        return;
      }

      if (commande.startsWith("QUIT")) {
        socket.write("221 2.0.0 au revoir\r\n");
        socket.end();
        return;
      }

      socket.write("250 2.0.0 accepté\r\n");
    };
  });

  return new Promise((resoudre) => {
    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      if (adresse === null || typeof adresse === "string") throw new Error("Serveur sans port.");
      resoudre({
        port: adresse.port,
        recu: () => recu,
        fermer: () =>
          new Promise((fini) => {
            for (const socket of connexions) socket.destroy();
            serveur.close(() => fini());
          }),
      });
    });
  });
}

function configuration(port: number): ConfigurationCourrier {
  return {
    hote: "127.0.0.1",
    port,
    utilisateur: "babo@exemple.fr",
    motDePasse: "mot-de-passe-application",
    expediteur: "babo@exemple.fr",
    destinataire: "contact@exemple.fr",
  };
}

describe("le transport nodemailer", () => {
  const aFermer: FauxServeur[] = [];

  const serveur = async (panne: Panne): Promise<FauxServeur> => {
    const faux = await fauxServeurSmtp(panne);
    aFermer.push(faux);
    return faux;
  };

  after(async () => {
    for (const faux of aFermer) await faux.fermer();
  });

  it("remet un message et porte ses deux versions", async () => {
    const faux = await serveur("aucune");
    const transport = transportNodemailer(configuration(faux.port));

    await transport.envoyer({
      sujet: "[Babo] Panne de scraping",
      html: "<p>myffbad n'a rien rendu.</p>",
      texte: "myffbad n'a rien rendu.",
    });

    const dialogue = faux.recu().join("\n");
    assert.match(dialogue, /MAIL FROM:<babo@exemple\.fr>/);
    assert.match(dialogue, /RCPT TO:<contact@exemple\.fr>/);
    // Le sujet accentué voyage encodé — `=?UTF-8?…?=` — et non en octets bruts.
    assert.match(dialogue, /Subject: .*Babo/);
    assert.match(dialogue, /multipart\/alternative/);
  });

  it("n'émet que du HTML quand le texte est absent", async () => {
    const faux = await serveur("aucune");
    const transport = transportNodemailer(configuration(faux.port));

    await transport.envoyer({ sujet: "[Babo] Tournois", html: "<p>Trois tournois.</p>" });

    const dialogue = faux.recu().join("\n");
    assert.match(dialogue, /Content-Type: text\/html/);
    assert.doesNotMatch(dialogue, /multipart\/alternative/);
  });

  /**
   * Le mot de passe d'application faux, ou révoqué par Google. Sans cette
   * remontée, le courrier croirait avoir remis ses alertes.
   */
  it("rejette quand l'authentification est refusée", async () => {
    const faux = await serveur("authentification");
    const transport = transportNodemailer(configuration(faux.port));

    await assert.rejects(
      transport.envoyer({ sujet: "[Babo] Panne", html: "<p>panne</p>" }),
      /535|Invalid login|authentication/i,
    );
  });

  it("rejette quand la connexion tombe en plein dialogue", async () => {
    const faux = await serveur("coupure");
    const transport = transportNodemailer(configuration(faux.port));

    await assert.rejects(transport.envoyer({ sujet: "[Babo] Panne", html: "<p>panne</p>" }));
  });
});
