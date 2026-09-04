import type { BaseSqlite } from "../../socle/infrastructure/base/connexion.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { Tableau } from "../../socle/core/tableau.ts";
import type { DepotPreferences, MarqueDeJoueur, Paire } from "../core/paires.ts";
import { PaireRefusee, paireCanonique } from "../core/paires.ts";

type LignePaire = { id: number; licence_a: string; licence_b: string; privilegiee: number };
type LigneMarque = { licence: string; tableau: string };

/**
 * Adaptateur SQLite du port `DepotPreferences` — specs 017 et 030.
 *
 * Il est dans `capitanat/infrastructure` et non dans la persistance du socle,
 * pour la raison de 005 : une paire est une notion de feature, et le socle ne
 * connaît aucune feature (022). C'est `main.ts` qui lui passe la base — la
 * même, la seule.
 */
export function depotPreferencesSqlite(base: BaseSqlite): DepotPreferences {
  // Par identifiant : l'ordre affiché est celui de la cote, calculé dans le
  // `core`. Ici il suffit qu'il soit stable.
  const toutesLesPaires = base.prepare(
    "select id, licence_a, licence_b, privilegiee from paire order by id",
  );
  const insertion = base.prepare(
    "insert into paire (licence_a, licence_b, privilegiee, saisie_le) values (?, ?, 0, ?)",
  );
  const parLicences = base.prepare(
    "select id, licence_a, licence_b, privilegiee from paire where licence_a = ? and licence_b = ?",
  );
  const marquageDeLaPaire = base.prepare("update paire set privilegiee = ? where id = ?");
  const suppression = base.prepare("delete from paire where id = ?");

  const toutesLesMarques = base.prepare("select licence, tableau from marque_joueur");
  const marquer = base.prepare(
    `insert into marque_joueur (licence, tableau, marque_le) values (?, ?, ?)
     on conflict (licence, tableau) do nothing`,
  );
  const demarquer = base.prepare("delete from marque_joueur where licence = ? and tableau = ?");

  return {
    paires(): readonly Paire[] {
      return (toutesLesPaires.all() as LignePaire[]).map(versPaire);
    },

    saisirUnePaire(licences: readonly [Licence, Licence], quand: Date): Paire {
      // Rangées avant d'écrire, même si l'appelant l'a déjà fait : c'est
      // l'invariant que porte l'index d'unicité, et il ne doit dépendre
      // d'aucune politesse.
      const [un, autre] = paireCanonique(...licences);

      if (parLicences.get(un, autre) !== undefined) {
        throw new PaireRefusee("Cette paire est déjà saisie.");
      }

      const resultat = insertion.run(un, autre, quand.toISOString());
      const ligne = parLicences.get(un, autre) as LignePaire | undefined;
      if (ligne === undefined) {
        throw new Error(`Paire introuvable après saisie : ${String(resultat.lastInsertRowid)}`);
      }
      return versPaire(ligne);
    },

    privilegierLaPaire: (id, privilegiee) => void marquageDeLaPaire.run(privilegiee ? 1 : 0, id),

    oublierLaPaire: (id) => void suppression.run(id),

    marquesDeJoueurs(): readonly MarqueDeJoueur[] {
      return (toutesLesMarques.all() as LigneMarque[]).map((ligne) => ({
        licence: ligne.licence as Licence,
        tableau: ligne.tableau as Tableau,
      }));
    },

    // La marque est posée ou retirée, jamais basculée : c'est l'écran qui dit
    // ce qu'il veut obtenir, et un double envoi du même formulaire ne la fait
    // pas clignoter.
    marquerLeJoueur: (licence, tableau, marque, quand) =>
      void (marque
        ? marquer.run(licence, tableau, quand.toISOString())
        : demarquer.run(licence, tableau)),
  };
}

function versPaire(ligne: LignePaire): Paire {
  return {
    id: ligne.id,
    licences: [ligne.licence_a as Licence, ligne.licence_b as Licence],
    privilegiee: ligne.privilegiee === 1,
  };
}
