import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { licence } from "../../socle/core/licence.ts";
import type { Coequipier, DepotCoequipiers } from "./coequipier.ts";
import { listeDeLEquipe } from "./coequipier.ts";

function depot(coequipiers: readonly Coequipier[]): DepotCoequipiers {
  return { remplacer: () => {}, tous: () => coequipiers };
}

describe("la liste de l'équipe", () => {
  it("rend un lien d'appel et un lien vers la fiche fédérale", () => {
    // C'est tout l'objet de la spec : relier le tableur du club à la fiche
    // myffbad, et rendre le numéro cliquable depuis un téléphone.
    const [membre] = listeDeLEquipe(
      depot([{ licence: licence("07194591"), sexe: "M", telephone: "06 12 34 56 78" }]),
    );

    assert.equal(membre?.telephone, "06 12 34 56 78", "affiché tel qu'il a été saisi");
    assert.equal(membre?.appel, "0612345678", "et composable sans sa mise en forme");
    assert.equal(membre?.fiche, "https://www.myffbad.fr/joueur/07194591");
  });

  it("garde l'indicatif international dans le lien d'appel", () => {
    const [membre] = listeDeLEquipe(
      depot([{ licence: licence("02345678"), sexe: "F", telephone: "+32 475 12 34 56" }]),
    );

    assert.equal(membre?.appel, "+32475123456");
  });

  it("ne montre ni nom ni classement : cette spec n'appelle personne", () => {
    // 005 doit pouvoir se livrer et se vérifier sans source externe. C'est
    // 028 qui accroche la passe et ajoute les deux colonnes.
    const [membre] = listeDeLEquipe(
      depot([{ licence: licence("07194591"), sexe: "M", telephone: "0612345678" }]),
    );

    assert.deepEqual(Object.keys(membre ?? {}).sort(), [
      "appel",
      "fiche",
      "licence",
      "sexe",
      "telephone",
    ]);
  });

  it("rend une liste vide quand rien n'a été importé", () => {
    assert.deepEqual(listeDeLEquipe(depot([])), []);
  });
});
