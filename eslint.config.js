import tseslint from "typescript-eslint";

/**
 * Découpage en modules hexagonaux — spec 022.
 *
 * Les trois interdits de la spec sont vérifiés ici plutôt que laissés à la
 * discipline : un `core` qui importe son infrastructure, un module qui importe
 * l'intérieur d'un autre, le `socle` qui importe une feature.
 *
 * La vérification porte sur le chemin importé, pas sur un graphe résolu : un
 * import relatif traverse forcément le nom du dossier qu'il vise
 * (`../infrastructure/...`, `../../veille/core/...`), donc le motif suffit.
 */
const MODULES = ["socle", "profil", "capitanat", "veille"];
const FEATURES = MODULES.filter((module) => module !== "socle");
const COUCHES = ["core", "presentation", "infrastructure"];

/**
 * Ce que ce fichier n'a pas le droit d'importer, et pourquoi.
 *
 * Un seul bloc de configuration par couple module × couche : deux blocs
 * portant `no-restricted-imports` sur un même fichier s'écraseraient l'un
 * l'autre, et la moitié des interdits disparaîtrait en silence.
 */
function interdits(module, couche) {
  const motifs = [];

  // 1. Le métier ne connaît pas ses adaptateurs : toutes les dépendances
  //    pointent vers le `core`, jamais l'inverse.
  if (couche === "core") {
    motifs.push({
      group: ["**/presentation/**", "**/infrastructure/**"],
      message:
        "Un `core` ne dépend ni de `presentation` ni de `infrastructure` : déclarer un port ici, en fournir l'adaptateur là-bas (spec 022).",
    });
  }

  // 2. Le socle ne connaît aucune feature. C'est l'erreur déjà corrigée deux
  //    fois dans le backlog : l'envoi de mail logé dans 013, le planificateur
  //    qu'on a failli loger dans 015.
  if (module === "socle") {
    motifs.push({
      group: FEATURES.map((feature) => `**/${feature}/**`),
      message:
        "Le socle ne connaît aucune feature : c'est la feature qui vient chercher la brique, jamais l'inverse (spec 022).",
    });
  }

  // 3. Une feature ignore les autres : un `core` par module, sans noyau
  //    commun et sans passerelle latérale.
  if (module !== "socle") {
    motifs.push({
      group: FEATURES.filter((autre) => autre !== module).map((autre) => `**/${autre}/**`),
      message: `Le module \`${module}\` ne peut pas importer un autre module de feature : ce qui n'appartient à personne descend dans \`socle/core\`, le reste est dupliqué sciemment (spec 022).`,
    });
  }

  return motifs;
}

const cloisonnement = MODULES.flatMap((module) =>
  COUCHES.map((couche) => ({
    files: [`src/${module}/${couche}/**/*.ts`],
    rules: {
      "no-restricted-imports": ["error", { patterns: interdits(module, couche) }],
    },
  })),
);

export default tseslint.config(
  { ignores: ["node_modules/", "data/"] },
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      // Express impose la signature du gestionnaire d'erreur : le paramètre
      // suivant doit être déclaré même inutilisé.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  ...cloisonnement,
  // Le point de composition est hors des modules : c'est le seul endroit qui a
  // le droit de tous les connaître pour les brancher entre eux.
  { files: ["src/main.ts"], rules: { "no-restricted-imports": "off" } },
);
