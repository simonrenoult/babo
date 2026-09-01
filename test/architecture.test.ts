import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ESLint } from "eslint";

/**
 * Le découpage de la spec 022 est vérifié par une règle de lint, pas laissé à
 * la discipline. Ce test vérifie la règle elle-même : une convention outillée
 * dont l'outil ne dit rien est une convention non outillée.
 */
const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

async function violations(fichier: string, code: string): Promise<readonly string[]> {
  const [resultat] = await eslint.lintText(code, { filePath: fichier, warnIgnored: false });
  return (resultat?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.message);
}

describe("le cloisonnement des modules", () => {
  it("casse quand un `core` importe son infrastructure", async () => {
    const refus = await violations(
      "src/socle/core/faux.ts",
      `import { ouvrirLaBase } from "../infrastructure/base/connexion.ts";\nexport const x = ouvrirLaBase;\n`,
    );
    assert.equal(refus.length, 1);
    assert.match(refus[0] ?? "", /core/);
  });

  it("casse quand un `core` importe sa présentation", async () => {
    const refus = await violations(
      "src/veille/core/faux.ts",
      `import { moduleVeille } from "../presentation/module-web.ts";\nexport const x = moduleVeille;\n`,
    );
    assert.equal(refus.length, 1);
  });

  it("casse quand un module importe le `core` d'un autre", async () => {
    const refus = await violations(
      "src/mon-profil/core/faux.ts",
      `import type { Joueur } from "../../capitanat/core/joueur.ts";\nexport type X = Joueur;\n`,
    );
    assert.equal(refus.length, 1);
    assert.match(refus[0] ?? "", /socle\/core/);
  });

  it("casse quand le socle importe une feature", async () => {
    const refus = await violations(
      "src/socle/presentation/faux.ts",
      `import { moduleMonProfil } from "../../mon-profil/presentation/module-web.ts";\nexport const x = moduleMonProfil;\n`,
    );
    assert.equal(refus.length, 1);
    assert.match(refus[0] ?? "", /aucune feature/);
  });

  it("laisse passer ce que l'hexagone autorise", async () => {
    const adaptateur = await violations(
      "src/socle/infrastructure/base/faux.ts",
      `import type { Capture } from "../../core/capture.ts";\nexport type X = Capture;\n`,
    );
    assert.deepEqual(adaptateur, []);

    const featureSurSocle = await violations(
      "src/mon-profil/presentation/faux.ts",
      `import type { Tableau } from "../../socle/core/tableau.ts";\nexport type X = Tableau;\n`,
    );
    assert.deepEqual(featureSurSocle, []);
  });

  it("laisse le point de composition connaître tout le monde", async () => {
    const refus = await violations(
      "src/main.ts",
      `import { moduleMonProfil } from "./mon-profil/presentation/module-web.ts";
import { moduleVeille } from "./veille/presentation/module-web.ts";
import { ouvrirLaPersistance } from "./socle/infrastructure/base/persistance.ts";
export const x = [moduleMonProfil, moduleVeille, ouvrirLaPersistance];
`,
    );
    assert.deepEqual(refus, []);
  });
});
