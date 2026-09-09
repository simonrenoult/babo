import type { Lettre } from "../../socle/core/classement.ts";
import type { Tableau } from "../../socle/core/tableau.ts";
import type { Categorie } from "../../socle/core/tournoi.ts";
import type { BaseSqlite } from "../../socle/infrastructure/base/connexion.ts";
import type { DepotVeilles, Fenetre, Veille } from "../core/veille.ts";

type LigneVeille = {
  id: number;
  nom: string;
  active: number;
  latitude: number;
  longitude: number;
  rayon_km: number;
  fenetre_jours: number | null;
  fenetre_du: string | null;
  fenetre_au: string | null;
  tableaux: string;
  series: string;
  categories: string;
  ouvertes: number;
};

/**
 * Adaptateur SQLite du port `DepotVeilles` — specs 017 et 012.
 *
 * Monté sur la même base que le reste, mais pas par la persistance du socle :
 * une veille est une notion de feature, et le socle n'en connaît aucune (022).
 * C'est `main.ts` qui les rapproche, comme il le fait pour `capitanat`.
 *
 * Les listes sont rangées en texte séparé par des virgules, et non en tables de
 * liaison : ce sont des codes fermés, validés à l'écriture, qu'on ne cherche
 * jamais autrement que veille par veille. Trois tables de plus pour ça
 * coûteraient à lire ce qu'elles ne rapporteraient nulle part.
 */
export function depotVeillesSqlite(base: BaseSqlite): DepotVeilles {
  const toutes = base.prepare("select * from veille order by nom");
  const parId = base.prepare("select * from veille where id = ?");
  const inserer = base.prepare(
    `insert into veille (nom, active, latitude, longitude, rayon_km,
                         fenetre_jours, fenetre_du, fenetre_au,
                         tableaux, series, categories, ouvertes, creee_le)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const mettreAJour = base.prepare(
    `update veille set nom = ?, active = ?, latitude = ?, longitude = ?, rayon_km = ?,
                       fenetre_jours = ?, fenetre_du = ?, fenetre_au = ?,
                       tableaux = ?, series = ?, categories = ?, ouvertes = ?
     where id = ?`,
  );
  const effacer = base.prepare("delete from veille where id = ?");

  const champsDeLaFenetre = (fenetre: Fenetre) =>
    fenetre.nature === "glissante"
      ? ([fenetre.jours, null, null] as const)
      : ([null, fenetre.du.toISOString(), fenetre.au.toISOString()] as const);

  return {
    toutes: () => (toutes.all() as LigneVeille[]).map(versVeille),

    parId(id: number): Veille | null {
      const ligne = parId.get(id) as LigneVeille | undefined;
      return ligne === undefined ? null : versVeille(ligne);
    },

    creer(saisie: Omit<Veille, "id">, quand: Date): Veille {
      const [jours, du, au] = champsDeLaFenetre(saisie.fenetre);
      const { lastInsertRowid } = inserer.run(
        saisie.nom,
        saisie.active ? 1 : 0,
        saisie.latitude,
        saisie.longitude,
        saisie.rayonKm,
        jours,
        du,
        au,
        saisie.tableaux.join(","),
        saisie.series.join(","),
        saisie.categories.join(","),
        saisie.ouvertes ? 1 : 0,
        quand.toISOString(),
      );
      return { ...saisie, id: Number(lastInsertRowid) };
    },

    modifier(veille: Veille): void {
      const [jours, du, au] = champsDeLaFenetre(veille.fenetre);
      mettreAJour.run(
        veille.nom,
        veille.active ? 1 : 0,
        veille.latitude,
        veille.longitude,
        veille.rayonKm,
        jours,
        du,
        au,
        veille.tableaux.join(","),
        veille.series.join(","),
        veille.categories.join(","),
        veille.ouvertes ? 1 : 0,
        veille.id,
      );
    },

    // Les appartenances partent avec elle : la contrainte `on delete cascade`
    // s'en charge. C'est le prix assumé d'une suppression, et la raison pour
    // laquelle une veille se suspend plutôt qu'elle ne se supprime.
    supprimer: (id: number) => void effacer.run(id),
  };
}

function versVeille(ligne: LigneVeille): Veille {
  return {
    id: ligne.id,
    nom: ligne.nom,
    active: ligne.active === 1,
    latitude: ligne.latitude,
    longitude: ligne.longitude,
    rayonKm: ligne.rayon_km,
    fenetre:
      ligne.fenetre_jours !== null
        ? { nature: "glissante", jours: ligne.fenetre_jours }
        : {
            nature: "intervalle",
            du: new Date(ligne.fenetre_du ?? ""),
            au: new Date(ligne.fenetre_au ?? ""),
          },
    tableaux: listeDe(ligne.tableaux) as readonly Tableau[],
    series: listeDe(ligne.series) as readonly Lettre[],
    categories: listeDe(ligne.categories) as readonly Categorie[],
    ouvertes: ligne.ouvertes === 1,
  };
}

function listeDe(brut: string): readonly string[] {
  return brut === "" ? [] : brut.split(",");
}
