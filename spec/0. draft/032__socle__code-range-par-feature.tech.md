# Ranger le code par feature plutôt que par couche

| Champ       | Valeur |
|-------------|--------|
| id          | 032    |
| module      | socle  |
| type        | tech   |
| bloquée par | —      |

> Ébauche : la découpe visée est esquissée, le partagé intra-module n'est pas
> tranché.

## Contexte

[[022__socle__decoupage-du-code.tech]] découpe le code en quatre modules —
`socle`, `mon-profil`, `capitanat`, `veille` — et donne à chacun la même forme
interne : `core`, `presentation`, `infrastructure`. La couche est donc le
premier niveau de rangement sous un module, et la feature n'apparaît nulle part.

`capitanat` porte aujourd'hui trois fichiers de `core`, trois d'`infrastructure`
et deux de `presentation`, issus de quatre specs — 005, 028,
[[029__capitanat__forces-par-tableau.feat]] et
[[030__capitanat__paires-et-preferences-du-capitaine.feat]]. Rien dans
l'arborescence ne dit laquelle a produit quoi.

## Problème à résoudre

Le code d'une spec est éparpillé sur trois dossiers. Pour 030 :
`core/paires.ts`, `infrastructure/depot-preferences-sqlite.ts`, une portion de
`presentation/module-web.ts` et une vue. Il faut trois lectures pour voir la
feature entière, et aucun geste simple ne permet de la retirer, de la lire ou
de la confier à quelqu'un d'un bloc.

Le backlog compte encore une dizaine de specs de feature. À ce rythme,
`capitanat/core` devient un sac où le nom du fichier est le seul indice de ce
qu'il sert.

Attendu : le premier niveau sous un module est une feature nommée par le geste
qu'elle rend possible — `marquer-paire-comme-favorite`,
`scanner-mes-inscriptions`, `composer-une-journee`.

Résolu quand le code d'une spec tient dans un dossier qui porte son nom, quand
les trois interdits de 022 restent vérifiés par `npm run lint`, et quand
`npm run verifier` passe sans un changement de comportement.

## Solutions envisagées

- **Feature au premier niveau, couches à l'intérieur** —
  `capitanat/marquer-paire-comme-favorite/{core,presentation,infrastructure}`.
  Les interdits de 022 survivent tels quels : ils portent sur le chemin
  importé (`**/core/**`, `**/<module>/**`), pas sur un graphe résolu. Coût :
  beaucoup de dossiers d'un ou deux fichiers.
- **Feature au premier niveau, fichiers plats à l'intérieur.** Plus léger à
  lire, mais la règle de lint repose sur les noms de couche : il faudrait lui
  trouver un autre appui, ou perdre la vérification.
- **Feature comme sous-dossier de couche** — `core/marquer-paire-comme-favorite/`.
  Le changement est minime et ne résout rien : la feature reste coupée en
  trois.
- **Supprimer les modules, ne garder que des features à plat sous `src/`.** Le
  module deviendrait un simple préfixe d'URL. À écarter probablement : c'est
  le module qui porte l'interdit « une feature n'en importe pas une autre » et
  l'idée, centrale dans 022, qu'un joueur vu par `capitanat` n'est pas celui
  de `mon-profil`.

**Le point dur est le partagé à l'intérieur d'un module.** `coequipier.ts` sert
à 005, 028, 029 et 030 ; `classement.ts` sert à 001 et à
[[024__mon-profil__historique-du-classement.feat]]. 022 assume la duplication
*entre* modules, mais pas dedans, et un dossier `commun/` par module recréerait
le sac qu'on cherche à défaire — un cran plus bas.

## Questions

- Où vit ce que deux features d'un même module partagent ?
- Une feature vaut-elle une spec, ou peut-elle en regrouper plusieurs (029 et
  030 servent le même geste : composer une journée) ? Si une feature vaut une
  spec, le dossier vieillit mal dès le premier amendement.
- Un routeur par feature, monté par le module, ou le `module-web.ts` unique
  d'aujourd'hui ? Et les vues, qui sont déclarées par dossier ?
- Le `socle` se range-t-il pareil ? Il n'a pas de features, il a des briques —
  base, mail, planificateur, acquisition.
- Quand ? Un déplacement transverse au milieu de
  [[027__socle__engagements-badnet.tech]] rendrait son diff illisible.
  [[025__mon-profil__renommage-du-module-profil.refactor]] a déjà tranché ce
  type de question : avant la feature suivante, jamais pendant.
- Que deviennent `eslint.config.js` et `test/architecture.test.ts`, qui encodent
  la découpe actuelle ?

## Notes

Amende [[022__socle__decoupage-du-code.tech]] si elle est retenue, ainsi que la
section « Où atterrit le code d'une nouvelle spec » d'`ARCHITECTURE.md`.

Le nom des features est une décision de vocabulaire autant que de rangement :
un verbe à l'infinitif dit un geste, un nom commun dit un sac.
