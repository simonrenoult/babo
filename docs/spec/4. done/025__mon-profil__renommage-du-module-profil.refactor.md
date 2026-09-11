# Renommer le module `profil` en `mon-profil`

| Champ       | Valeur     |
|-------------|------------|
| id          | 025        |
| module      | mon-profil |
| type        | refactor   |
| bloquée par | —          |

## Contexte

Les trois modules de feature s'appellent `profil`, `capitanat` et `veille`.
L'interface, elle, affiche déjà « Mon profil »
(`src/profil/presentation/module-web.ts`, vérifié par `test/interface.test.ts`) :
seul l'identifiant technique est resté `profil`.

## Problème à résoudre

`profil` se lit comme « le profil de n'importe qui », alors que le module ne
porte que le mien — `capitanat` manipule lui aussi des profils, ceux des
coéquipiers, et [[022__socle__decoupage-du-code.tech]] insiste précisément sur
le fait que les deux ne partagent pas leur modèle. Le nom technique et le nom
affiché divergent, ce qui oblige à traduire mentalement à chaque lecture.

Résolu quand `mon-profil` est le nom du dossier, de la route, de l'identifiant
exporté et de la vue, que `npm run verifier` passe, et qu'aucune occurrence de
`profil` comme nom de module ne subsiste dans le code ni dans les documents.

## Solutions envisagées

- **Renommer en `mon-profil`.** Retenue : le possessif est ce qui lève
  l'ambiguïté, et c'est déjà le mot affiché.
- **`moi`.** Écarté : aussi clair, mais se lit mal en chemin d'URL et en nom de
  dossier.
- **Garder `profil` et documenter.** Écarté : une convention qui s'explique en
  commentaire est une convention qu'on réapprend à chaque relecture.

Portée du renommage :

- `src/profil/` → `src/mon-profil/`, la vue `profil.ejs` → `mon-profil.ejs`,
  l'export `moduleProfil` → `moduleMonProfil`, l'import dans `src/main.ts` ;
- la route `/profil` → `/mon-profil` ;
- `MODULES` dans `eslint.config.js`, qui produit les règles d'architecture ;
- `test/architecture.test.ts` et `test/interface.test.ts` ;
- le tableau des modules d'`ARCHITECTURE.md` ;
- le tableau des modules de [[022__socle__decoupage-du-code.tech]], spec `done`,
  et les commentaires de `src/socle/core/licence.ts` et `tableau.ts` ;
- la description de `README.md` et de `package.json`.

## Questions

Aucune.

## Notes

À faire avant [[001__mon-profil__classement.feat]] : un renommage transverse
mêlé à la première feature rendrait son diff illisible et ferait passer la
modification d'une spec `done` pour un détail d'implémentation.

Aucun lien externe à préserver : application personnelle, non exposée, sans
signet partagé.

Le champ `module` des specs [[001__mon-profil__classement.feat]] à
[[004__mon-profil__ratio-victoire-defaite-par-tableau.feat]] porte déjà
`mon-profil`.
