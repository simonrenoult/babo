# Afficher mon classement

| Champ  | Valeur     |
|--------|------------|
| id     | 001        |
| module | mon-profil |
| type   | feat       |

## Contexte

Le classement FFBaD d'un joueur évolue à chaque publication (CPPH mensuel) et
conditionne les tableaux accessibles en tournoi. Aujourd'hui il faut aller le
consulter à la main sur myffbad.

C'est aussi la première spec à tirer une donnée métier de myffbad :
[[015__source-de-donnees]] prouve l'accès, celle-ci en fait quelque chose. Elle
apporte donc le premier parseur de production — page, table, migration.

## Problème à résoudre

Je ne sais pas, sans aller chercher l'information, quel est mon classement
courant dans chacun de mes tableaux (simple, double, mixte).

Résolu quand la page `/mon-profil` affiche, pour la licence de la
configuration : le numéro de licence, la date de la passe qui a relevé ces
valeurs, puis une ligne par tableau présent sur la fiche — tableau, lettre,
CPPH — dans l'ordre simple, double, mixte.

Vérifié de deux façons : le parseur rejoué sur une capture réelle archivée,
sans réseau ; et une passe réelle constatée une fois à la mise en service.
La première seule ne prouverait que le parseur, pas la chaîne session →
requête → base → page.

## Solutions envisagées

- Scraper la fiche joueur myffbad. Retenue, conformément à
  [[015__source-de-donnees]] : c'est la source unique du classement.
- Ingérer le fichier CPPH publié chaque mois. Écarté en
  [[015__source-de-donnees]] au profit de myffbad, qui couvre aussi le
  classement des coéquipiers.

Où le code atterrit :

- `socle/core` porte `Classement` — une lettre et un CPPH rattachés à un
  `Tableau`. C'est un fait fédéral, pas la représentation d'un module : il
  rejoint `Licence` et `Tableau`, et [[022__decoupage-du-code]] est amendée en
  ce sens. `Joueur`, lui, reste dupliqué entre modules.
- `socle/infrastructure` porte le parseur de la fiche et le dépôt SQLite : le
  parsing d'un site vit dans un module unique ([[015__source-de-donnees]]).
- `mon-profil` lit le dépôt et affiche. Aucune feature ne parle à myffbad.

La lettre est une valeur fermée — `N1` à `N3`, `R4` à `R6`, `D7` à `D9`, `P10`
à `P12`, `NC` — et le CPPH un nombre. Une valeur inattendue fait échouer
l'extraction plutôt que d'entrer en base : c'est exactement le succès vide
décrit par [[019__robustesse-du-scraping]], et le seul moyen qu'il se voie.
Contrepartie assumée : une évolution légitime du barème casse la passe jusqu'à
correction, la capture archivée permettant de corriger hors ligne.

Une ligne par changement de valeur, jamais une par passe : le classement ne
bouge qu'à la publication mensuelle, une passe quotidienne écrirait trois cent
cinquante lignes identiques par an. Chaque ligne porte `apparu_le` et `vu_le`,
ce dernier mis à jour à chaque passe réussie ; la page affiche `vu_le`.
Conservation sans limite : une douzaine de lignes par an et par tableau.

Écarté : un bouton « rafraîchir maintenant ». 015 accepte le risque de
bannissement sur la base d'un passage par jour ; un bouton met ce plafond dans
les mains de l'utilisateur.

## Questions

Aucune. Ce que la fiche expose exactement — libellé des tableaux, présence
d'un tableau jamais joué — sera constaté par la sonde de
[[015__source-de-donnees]] : on affiche ce qu'elle donne, `NC` compris, sans
rien inventer.

## Notes

Une seule licence, la mienne, lue dans la configuration. Les classements des
coéquipiers relèvent de [[005__liste-des-membres-de-l-equipe]], dans
`capitanat`, qui partage la source de données sans partager le modèle joueur.

Avant la première passe réussie, la page affiche « aucun relevé : la première
passe myffbad n'a pas encore abouti » — jamais un tableau de tirets, qui se
confondrait avec un joueur non classé.

Bloquée par [[015__source-de-donnees]] pour l'accès et par
[[018__ordonnancement]] pour le déclenchement quotidien. Suppose
[[025__renommage-du-module-profil]] fait.

Prolongée par [[024__historique-du-classement]] : la variation et l'évolution
en relèvent. C'est pour elle qu'`apparu_le` est écrit dès maintenant — un
historique ne se rattrape pas après coup, et l'antériorité myffbad n'est pas
importée.
