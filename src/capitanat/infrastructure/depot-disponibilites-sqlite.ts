import type { BaseSqlite } from "../../socle/infrastructure/base/connexion.ts";
import type { Licence } from "../../socle/core/licence.ts";
import type { DepotDisponibilites, Repondant, Reponse, Sondage } from "../core/disponibilite.ts";

type LigneRepondant = { nom: string; remarque: string | null; licence: string | null };
type LigneReponse = { nom: string; journee: number; reponse: string };

/**
 * Adaptateur SQLite du port `DepotDisponibilites` — spec 008.
 *
 * Dans `capitanat/infrastructure`, pour la raison de 005 : le socle ne connaît
 * aucune feature (022), et c'est `main.ts` qui passe la base.
 */
export function depotDisponibilitesSqlite(base: BaseSqlite): DepotDisponibilites {
  const tousLesRepondants = base.prepare("select nom, remarque, licence from repondant order by nom");
  const toutesLesReponses = base.prepare("select nom, journee, reponse from disponibilite order by nom, journee");
  const oublierLaJournee = base.prepare("delete from disponibilite where journee = ?");
  // La remarque suit le dernier sondage ; le rattachement, lui, reste.
  const inscrire = base.prepare(
    `insert into repondant (nom, remarque) values (?, ?)
     on conflict (nom) do update set remarque = excluded.remarque`,
  );
  const repondre = base.prepare("insert into disponibilite (nom, journee, reponse) values (?, ?, ?)");
  const rattachement = base.prepare("update repondant set licence = ? where nom = ?");
  // Un nom qui n'a plus aucune réponse et que personne n'a rattaché n'est plus
  // qu'une ligne vide dans la grille.
  const orphelins = base.prepare(
    `delete from repondant
     where licence is null and nom not in (select nom from disponibilite)`,
  );

  const enregistrer = base.transaction((sondage: Sondage) => {
    for (const { journee } of sondage.journees) oublierLaJournee.run(journee);
    for (const repondant of sondage.repondants) {
      inscrire.run(repondant.nom, repondant.remarque);
      for (const [journee, reponse] of repondant.reponses) repondre.run(repondant.nom, journee, reponse);
    }
    orphelins.run();
  });

  return {
    enregistrer: (sondage) => void enregistrer(sondage),

    repondants(): readonly Repondant[] {
      return (tousLesRepondants.all() as LigneRepondant[]).map((ligne) => ({
        nom: ligne.nom,
        remarque: ligne.remarque,
        licence: ligne.licence as Licence | null,
      }));
    },

    reponses() {
      return (toutesLesReponses.all() as LigneReponse[]).map((ligne) => ({
        nom: ligne.nom,
        journee: ligne.journee,
        reponse: ligne.reponse as Reponse,
      }));
    },

    rattacher: (nom, licence) => void rattachement.run(licence, nom),
  };
}
