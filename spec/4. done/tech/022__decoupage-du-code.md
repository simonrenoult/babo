# Découper le code en modules hexagonaux

| Champ  | Valeur |
|--------|--------|
| id     | 022    |
| module | socle  |
| type   | tech   |

## Contexte

[[020__architecture-applicative]] fixe la forme de l'artefact : un processus
Node, Express, rendu côté serveur. Express n'impose aucune structure, et les
specs emploient déjà un vocabulaire de modules — `mon-profil`, `capitanat`,
`veille`, `socle` — sans que rien ne le matérialise dans le code.

## Problème à résoudre

Deux couplages ont déjà coûté cher dans le backlog, avant même la première
ligne de code : l'envoi de mail logé dans une feature ([[013__alerte-nouveau-tournoi]]),
qui refermait le backlog sur lui-même, et le planificateur qu'on a failli
loger dans [[015__source-de-donnees]]. Les deux ont la même forme — une brique
de socle rangée chez un de ses appelants.

Sans structure imposée, la même erreur se reproduira à l'intérieur du code :
une page web qui déclenche un scraping, une règle métier qui écrit du SQL, un
module qui importe le modèle d'un autre.

Résolu quand chaque module a la même forme interne, quand le sens des
dépendances est explicite, et qu'une nouvelle spec sait sans hésiter dans quel
dossier son code atterrit.

## Solutions envisagées

Quatre modules, ceux qu'emploient déjà les specs :

| Module      | Porte                                                                   |
|-------------|-------------------------------------------------------------------------|
| `socle`     | base, mail, planificateur, authentification, acquisition, interface      |
| `mon-profil`| [[001__classement]] à [[004__ratio-victoire-defaite-par-tableau]]        |
| `capitanat` | [[005__liste-des-membres-de-l-equipe]] à [[011__composition-de-journee]] |
| `veille`    | [[012__recherche-de-tournois]] à [[014__rappel-ouverture-tournoi]]       |

Chaque module est un hexagone — trois dossiers :

| Dossier          | Porte                                                        |
|------------------|--------------------------------------------------------------|
| `core`           | les notions métier : veille, composition, joueur, indicateur  |
| `presentation`   | routes HTTP et pages                                          |
| `infrastructure` | accès à la base, scrapers, envoi de mail                      |

`core` ne dépend ni de `presentation` ni de `infrastructure`. Il déclare des
ports, les deux autres en fournissent les adaptateurs : toutes les dépendances
pointent vers le métier.

Deux règles au-dessus des modules, chacune tirée d'une erreur déjà corrigée :

- Le socle ne connaît aucune feature. C'est ce qui a imposé de sortir l'envoi
  de mail de 013 et de refuser de loger le planificateur dans 015.
- Une feature ne parle jamais à myffbad ni à badnet : elle lit la base.
  L'hexagone rend la règle structurelle plutôt que morale — le `core` lit un
  port de dépôt, l'acquisition est un adaptateur en amont, et aucune page web
  n'a de chemin vers un scraper.

Les décisions des specs de socle deviennent ainsi des adaptateurs : SQLite
(017), les scrapers myffbad et badnet (015), l'envoi de mail (016). Deux
contraintes déjà écrites en tombent gratuitement — les mails écrits en base en
développement (016) et les parseurs rejoués sur captures sans réseau (019) sont
des adaptateurs de remplacement, pas des cas particuliers à aménager.

**Un `core` par module, sans noyau commun.** `mon-profil` et `capitanat` partagent
leur source de données ([[001__classement]]) et manipuleront des notions
proches — joueur, match. Ils garderont pourtant chacun leur représentation :
la source commune est un fait d'infrastructure, elle n'oblige pas à un modèle
métier commun. Un joueur vu par `capitanat` est un coéquipier qu'on aligne ;
vu par `mon-profil`, c'est moi. La duplication est acceptée en échange de deux
modules qui évoluent sans se consulter.

Ce qui n'est spécifique à aucun module appartient au `socle` : un numéro de
licence, une date de journée d'interclub, un tableau. La frontière est celle
que trace la décision précédente — le `socle` porte les types que personne ne
possède, jamais les représentations métier d'un module. Y remonter `Joueur`
parce que deux modules s'en servent recréerait le noyau commun qu'on vient
d'écarter, par la petite porte.

Les règles ci-dessus sont vérifiées par une règle de lint sur les imports, pas
laissées à la discipline : un `core` qui importe son infrastructure, un module
qui importe le `core` d'un autre, le `socle` qui importe une feature — chacun
de ces cas casse la construction. Une convention non outillée tient le temps
qu'on y pense, et le backlog a déjà montré deux fois qu'on n'y pense pas.

## Questions

Aucune : les choix de cette spec sont tranchés.

## Notes

Architecture hexagonale au sens ports et adaptateurs :
<https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)>.

Duplication assumée entre `mon-profil` et `capitanat` : si les deux modèles se
mettent à diverger, c'est la preuve que le choix était bon ; s'ils restent
identiques pendant plusieurs specs, la question se rouvrira sur des faits.

Amendée par [[001__classement]] : `classement` a été retiré de la liste des
notions dupliquées ci-dessus et descend dans `socle/core`, avec `Licence` et
`Tableau`. Une lettre et un CPPH sont un fait fédéral : il n'en existe pas une
version vue par `mon-profil` et une autre vue par `capitanat`, c'est le critère
même de cette spec. `Joueur` reste dupliqué, et la règle est inchangée.

Détaillée depuis [[020__architecture-applicative]], qui portait ce découpage et
débordait. À traiter avec elle.

Renommée par [[025__renommage-du-module-profil]] : le module `profil` s'appelle
`mon-profil`, dans le tableau ci-dessus comme partout ailleurs. `capitanat`
manipule lui aussi des profils, ceux des coéquipiers — c'est le possessif qui
lève l'ambiguïté que cette spec insiste à maintenir.
