import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VEILLES_AU_PLUS,
  VeilleRefusee,
  bornesDeLaFenetre,
  disciplinesDe,
  verifierLaVeille,
  type Veille,
} from "./veille.ts";

const SAISIE: Omit<Veille, "id"> = {
  nom: "DH avec Louis",
  active: true,
  latitude: 48.8534,
  longitude: 2.3488,
  rayonKm: 50,
  fenetre: { nature: "glissante", jours: 90 },
  tableaux: ["DH", "MX"],
  series: ["D7", "D8", "D9"],
  categories: ["seniors"],
  ouvertes: true,
};

const veille = (id: number, nom: string): Veille => ({ ...SAISIE, id, nom });

const motifsDe = (saisie: Omit<Veille, "id">, existantes: readonly Veille[] = []): readonly string[] => {
  try {
    verifierLaVeille(saisie, { existantes });
    return [];
  } catch (erreur) {
    assert.ok(erreur instanceof VeilleRefusee);
    return erreur.motifs;
  }
};

describe("ce qu'une veille doit respecter", () => {
  it("accepte une saisie complète", () => {
    assert.deepEqual(motifsDe(SAISIE), []);
  });

  it("refuse une veille qui ne filtrerait rien", () => {
    // Sans tableau ni série, la veille rendrait le catalogue entier et 013
    // alerterait sur tout. Mieux vaut refuser que de laisser croire à un filtre.
    assert.deepEqual(motifsDe({ ...SAISIE, tableaux: [], series: [] }), [
      "Aucun tableau : la veille ne filtrerait rien.",
      "Aucune série : la veille ne filtrerait rien.",
    ]);
  });

  it("rend tous les motifs d'un coup", () => {
    // Corriger un formulaire une erreur à la fois est le meilleur moyen de le
    // fermer : c'est le choix de l'import de 005.
    const motifs = motifsDe({ ...SAISIE, nom: "  ", rayonKm: 0, latitude: 200 });

    assert.equal(motifs.length, 3);
    assert.ok(motifs.some((motif) => motif.includes("nom est vide")));
    assert.ok(motifs.some((motif) => motif.includes("rayon")));
    assert.ok(motifs.some((motif) => motif.includes("latitude")));
  });

  it("refuse la sixième veille, et jamais la modification d'une des cinq", () => {
    const cinq = Array.from({ length: VEILLES_AU_PLUS }, (_, rang) => veille(rang + 1, `veille ${rang}`));

    assert.ok(motifsDe(SAISIE, cinq).some((motif) => motif.includes("Cinq veilles au plus")));
    assert.doesNotThrow(() =>
      verifierLaVeille({ ...SAISIE, nom: "veille 0" }, { existantes: cinq, id: 1 }),
    );
  });

  it("refuse deux veilles du même nom : c'est lui qui les distingue au mail", () => {
    assert.ok(
      motifsDe(SAISIE, [veille(1, "DH avec Louis")]).some((motif) => motif.includes("s'appelle déjà")),
    );
  });

  it("refuse un intervalle qui finit avant de commencer", () => {
    const motifs = motifsDe({
      ...SAISIE,
      fenetre: { nature: "intervalle", du: new Date("2026-11-01"), au: new Date("2026-10-01") },
    });
    assert.ok(motifs.some((motif) => motif.includes("précède son début")));
  });

  it("refuse une série hors barème et un tableau qui n'en est pas un", () => {
    const motifs = motifsDe({
      ...SAISIE,
      tableaux: ["ST"] as never,
      series: ["D13"] as never,
    });
    assert.equal(motifs.length, 2);
  });
});

describe("ce que la veille demande à badnet", () => {
  it("déduit la discipline du tableau, sans la faire saisir", () => {
    // badnet ne distingue pas le genre : demander la discipline *en plus* du
    // tableau ferait deux champs qui peuvent se contredire, et l'un des deux
    // serait forcément faux.
    assert.deepEqual(disciplinesDe(["DH", "MX"]), ["double", "mixte"]);
    assert.deepEqual(disciplinesDe(["SH", "SD"]), ["simple"], "dédoublonnées");
    assert.deepEqual(disciplinesDe([]), []);
  });

  it("fait glisser la fenêtre avec le jour où on la lit", () => {
    // « Les trois prochains mois » dit la même chose en janvier et en juin.
    const maintenant = new Date("2026-09-09T12:00:00.000Z");
    const { du, au } = bornesDeLaFenetre({ nature: "glissante", jours: 90 }, maintenant);

    assert.equal(du.getTime(), maintenant.getTime());
    assert.equal(au.toISOString().slice(0, 10), "2026-12-08");
  });

  it("laisse un intervalle fixe où il est", () => {
    const bornes = bornesDeLaFenetre(
      { nature: "intervalle", du: new Date("2026-10-17"), au: new Date("2026-11-02") },
      new Date("2026-09-09"),
    );
    assert.equal(bornes.du.toISOString().slice(0, 10), "2026-10-17");
    assert.equal(bornes.au.toISOString().slice(0, 10), "2026-11-02");
  });
});
