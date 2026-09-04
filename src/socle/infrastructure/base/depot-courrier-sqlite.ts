import type {
  DepotCourrier,
  EtatDuMessage,
  Message,
  MessageDepose,
} from "../../core/courrier.ts";
import type { BaseSqlite } from "./connexion.ts";

type Ligne = {
  id: number;
  sujet: string;
  html: string;
  texte: string | null;
  depose_le: string;
  tentatives: number;
  prochaine_tentative_le: string;
  etat: string;
  dernier_echec: string | null;
};

/** Adaptateur SQLite du port `DepotCourrier` — specs 016 et 017. */
export function depotCourrierSqlite(base: BaseSqlite): DepotCourrier {
  const colonnes =
    "id, sujet, html, texte, depose_le, tentatives, prochaine_tentative_le, etat, dernier_echec from message";

  // `prochaine_tentative_le` vaut la date de dépôt : le message est dû tout de
  // suite, et c'est le dépôt lui-même qui déclenche la première tentative.
  const insertion = base.prepare(
    `insert into message (sujet, html, texte, depose_le, tentatives, prochaine_tentative_le, etat)
     values (?, ?, ?, ?, 0, ?, 'en-attente')`,
  );
  const parIdentifiant = base.prepare(`select ${colonnes} where id = ?`);
  const dus = base.prepare(
    `select ${colonnes} where etat = 'en-attente' and prochaine_tentative_le <= ?
     order by depose_le, id`,
  );
  const envoi = base.prepare(
    "update message set etat = 'envoye', clos_le = ? where id = ?",
  );
  const report = base.prepare(
    `update message set tentatives = ?, prochaine_tentative_le = ?, dernier_echec = ?
     where id = ?`,
  );
  const abandon = base.prepare(
    `update message set etat = 'abandonne', tentatives = ?, clos_le = ?, dernier_echec = ?
     where id = ?`,
  );
  const derniers = base.prepare(`select ${colonnes} order by depose_le desc, id desc limit ?`);
  const enAttente = base.prepare(
    "select count(*) as combien from message where etat = 'en-attente'",
  );

  return {
    deposer(message: Message, quand: Date): MessageDepose {
      const horodatage = quand.toISOString();
      const resultat = insertion.run(
        message.sujet,
        message.html,
        message.texte ?? null,
        horodatage,
        horodatage,
      );
      const ligne = parIdentifiant.get(Number(resultat.lastInsertRowid)) as Ligne | undefined;
      if (ligne === undefined) throw new Error("Message introuvable après dépôt.");
      return versMessage(ligne);
    },

    lire(id: number): MessageDepose | null {
      const ligne = parIdentifiant.get(id) as Ligne | undefined;
      return ligne === undefined ? null : versMessage(ligne);
    },

    dus: (maintenant) => (dus.all(maintenant.toISOString()) as Ligne[]).map(versMessage),

    marquerEnvoye: (id, quand) => void envoi.run(quand.toISOString(), id),

    reporter: (id, tentatives, prochaineTentativeLe, echec) =>
      void report.run(tentatives, prochaineTentativeLe.toISOString(), echec, id),

    abandonner: (id, tentatives, quand, echec) =>
      void abandon.run(tentatives, quand.toISOString(), echec, id),

    derniers: (combien) => (derniers.all(combien) as Ligne[]).map(versMessage),

    compterEnAttente: () => (enAttente.get() as { combien: number }).combien,
  };
}

function versMessage(ligne: Ligne): MessageDepose {
  return {
    id: ligne.id,
    sujet: ligne.sujet,
    html: ligne.html,
    texte: ligne.texte,
    deposeLe: new Date(ligne.depose_le),
    tentatives: ligne.tentatives,
    prochaineTentativeLe: new Date(ligne.prochaine_tentative_le),
    etat: ligne.etat as EtatDuMessage,
    dernierEchec: ligne.dernier_echec,
  };
}
