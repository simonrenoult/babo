import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { licence } from "../../socle/core/licence.ts";
import { ouvrirLaPersistance } from "../../socle/infrastructure/base/persistance.ts";
import { depotIdentitesSqlite } from "../../socle/infrastructure/base/depot-identites-sqlite.ts";
import { depotCoequipiersSqlite } from "./depot-coequipiers-sqlite.ts";

const CLE = "clé-de-test";

describe("l'équipe en base", () => {
  let dossier: string;
  let persistance: ReturnType<typeof ouvrirLaPersistance>;
  let depot: ReturnType<typeof depotCoequipiersSqlite>;

  before(() => {
    dossier = mkdtempSync(join(tmpdir(), "babo-equipe-"));
    persistance = ouvrirLaPersistance({ chemin: join(dossier, "babo.db"), cle: CLE });
    depot = depotCoequipiersSqlite(persistance.base);
  });

  after(() => {
    persistance.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });

  it("rend l'équipe par licence croissante, quel que soit l'ordre du fichier", () => {
    // Arbitraire mais stable et sans code : 028 le remplacera par le nom.
    depot.remplacer([
      { licence: licence("07194591"), sexe: "M", telephone: "0612345678" },
      { licence: licence("02345678"), sexe: "F", telephone: "0612345679" },
    ]);

    assert.deepEqual(
      depot.tous().map(({ licence: numero }) => numero),
      ["02345678", "07194591"],
    );
  });

  it("remplace la liste entière plutôt que de la compléter", () => {
    depot.remplacer([{ licence: licence("03456789"), sexe: "F", telephone: "0612345670" }]);

    assert.deepEqual(depot.tous(), [
      { licence: "03456789", sexe: "F", telephone: "0612345670" },
    ]);
  });

  it("emporte le nom du partant, pas seulement son classement", () => {
    // Le nom que 028 relève est de la donnée personnelle au même titre que le
    // téléphone — davantage, même : il désigne la personne (021).
    const identites = depotIdentitesSqlite(persistance.base);
    const partant = licence("04567890");
    depot.remplacer([{ licence: partant, sexe: "F", telephone: "0612345670" }]);
    identites.enregistrer({ licence: partant, nom: "Alice DUPONT", personId: 7 }, new Date());

    depot.remplacer([{ licence: licence("07194591"), sexe: "M", telephone: "0612345678" }]);

    assert.equal(identites.lire(partant), null);
  });

  it("emporte les relevés de classement du partant", () => {
    // Ce sont les données de quelqu'un qui ne joue plus ici : les garder « au
    // cas où » est exactement ce qui rendrait une fuite impardonnable (021).
    const partant = licence("03456789");
    const restant = licence("07194591");
    depot.remplacer([
      { licence: partant, sexe: "F", telephone: "0612345670" },
      { licence: restant, sexe: "M", telephone: "0612345678" },
    ]);
    for (const numero of [partant, restant]) {
      persistance.classements.relever(
        numero,
        [{ discipline: "simple", lettre: "D9", cpph: 936 }],
        new Date("2026-09-01T05:00:00Z"),
      );
    }

    depot.remplacer([{ licence: restant, sexe: "M", telephone: "0612345678" }]);

    assert.deepEqual(persistance.classements.derniers(partant), []);
    assert.equal(persistance.classements.derniers(restant).length, 1, "le restant garde le sien");
  });

  it("survit à un redémarrage", () => {
    const apres = depotCoequipiersSqlite(persistance.base);

    assert.deepEqual(apres.tous(), [
      { licence: "07194591", sexe: "M", telephone: "0612345678" },
    ]);
  });

  it("refuse en base ce que le parseur refuse déjà, plutôt que d'écrire à moitié", () => {
    // Ceinture et bretelles : la contrainte SQL ne remplace pas la validation
    // du CSV, elle garantit qu'aucun autre chemin ne pourra la contourner.
    assert.throws(() =>
      depot.remplacer([
        { licence: licence("07194591"), sexe: "M", telephone: "0612345678" },
        // @ts-expect-error — un sexe hors barème n'existe pas dans le type.
        { licence: licence("02345678"), sexe: "X", telephone: "0612345679" },
      ]),
    );

    assert.deepEqual(
      depot.tous().map(({ licence: numero }) => numero),
      ["07194591"],
      "la transaction a tout annulé",
    );
  });
});
