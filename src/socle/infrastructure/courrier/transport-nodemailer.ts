import { createTransport } from "nodemailer";
import type { ConfigurationCourrier } from "../../core/configuration.ts";
import type { Message, Transport } from "../../core/courrier.ts";

/**
 * Adaptateur du port `Transport` — spec 016.
 *
 * SMTP de Gmail, par `nodemailer`. Le paquet a la particularité rare d'être
 * **sans aucune dépendance transitive**, ce qui retire à `jsonwebtoken` et
 * `bcrypt` l'argument qui les avait fait refuser (021) : il n'y a pas d'arbre
 * à auditer, un seul paquet.
 *
 * Gmail exige un **mot de passe d'application**, donc la validation en deux
 * étapes sur le compte : le mot de passe du compte est refusé. Et l'expéditeur
 * est imposé par le compte authentifié — sans conséquence ici, où l'unique
 * destinataire est moi (008 ayant retiré les mails des coéquipiers, il n'y a
 * personne d'autre à qui écrire).
 */
export function transportNodemailer(configuration: ConfigurationCourrier): Transport {
  const transporteur = createTransport({
    host: configuration.hote,
    port: configuration.port,
    // Déduit du port, jamais configuré : 465 veut dire TLS dès le premier
    // octet, sans bascule `STARTTLS` en cours de dialogue et donc sans fenêtre
    // où les identifiants partiraient en clair si la négociation échouait.
    //
    // Un autre port ouvre une session non chiffrée. C'est le prix assumé de la
    // testabilité — le faux serveur SMTP des tests écoute en clair sur un port
    // libre —, et `.env.example` fixe 465.
    secure: configuration.port === 465,
    auth: { user: configuration.utilisateur, pass: configuration.motDePasse },
  });

  return {
    destinataire: configuration.destinataire,

    async envoyer(message: Message): Promise<void> {
      await transporteur.sendMail({
        from: configuration.expediteur,
        to: configuration.destinataire,
        subject: message.sujet,
        html: message.html,
        // Absent, `nodemailer` n'émet que la partie HTML : il ne sait pas
        // dériver le texte, l'option qui le faisait ayant disparu avec sa
        // version 2.
        ...(message.texte === undefined ? {} : { text: message.texte }),
      });
    },
  };
}
