# Voir mes forces tableau par tableau

| Champ  | Valeur    |
|--------|-----------|
| id     | 029       |
| module | capitanat |
| type   | feat      |

## Contexte

`/capitanat` liste l'équipe et, pour chaque membre, ses trois classements —
simple, double, mixte ([[028__nom-et-classement-de-l-equipe]]). C'est une liste
de personnes.

Une rencontre, elle, se joue en **six matchs répartis sur cinq tableaux : deux
SH, un SD, un DH, un DD, un MX** (`Tableau`, dans `socle/core/tableau.ts` — la
fédération écrit MX là où l'usage dit souvent DX). Aucun écran ne les montre.

Nous sommes en début de saison : l'équipe vient d'être importée.

## Problème à résoudre

Pour planifier, il faut savoir tableau par tableau qui est alignable, dans quel
ordre de force, et où l'effectif ne suit pas. Rien ne le dit : il faut le
reconstituer de tête depuis un tableau de neuf colonnes, en croisant le sexe et
la bonne colonne de classement.

Résolu quand chaque tableau a sa page, listant les joueurs éligibles du plus
fort au plus faible avec leur cote et leur lettre, et quand l'index nomme les
tableaux que l'effectif ne permet pas de remplir.

## Solutions envisagées

- **Tout dériver de ce qui est déjà en base.** Retenue. Le sexe vient du CSV de
  [[005__liste-des-membres-de-l-equipe]], cote et lettre de la passe de 028 :
  aucune saisie, aucune source nouvelle, aucune table. C'est ce qui sépare cette
  spec de [[010__tableaux-preferes]], qui attend une déclaration des joueurs, et
  de [[011__composition-de-journee]], qui attend le règlement modélisé.
- **Une page par tableau**, sous `/capitanat` devenu index. Retenue : on
  consulte un tableau à la fois, chacun est une URL qu'on met en favori, et
  l'écran reste court sur un téléphone. Écartée, la page unique à cinq sections,
  qui ferait défiler le DH pour atteindre le DD.

Trois points qui ne sont pas des détails d'affichage.

**Cote et lettre sont lues, jamais calculées.** myffbad rend les deux par
discipline — `SimpleRate` et `SimpleSubLevel` — et 028 les range toutes deux en
base. La page affiche « 1311 — D8 » sans rien convertir. Une table
d'équivalence a été envisagée puis écartée : elle aurait permis de reconvertir
un nombre en lettre, mais rien ici n'en a besoin, et 001 refuse d'inventer une
valeur fédérale.

**Les cinq listes ne se cumulent pas**, et la page doit le dire. Un joueur
figure dans tous les tableaux où il est éligible ; il ne fera pourtant pas les
six matchs. Lire les cinq pages côte à côte surestime la profondeur, ce qui
serait le pire défaut d'un écran censé montrer des manques. Le plafond de matchs
par joueur relève de 011, qui compose vraiment.

**Une lacune se compte, elle ne s'estime pas.** Deux faits par tableau, et rien
d'autre : l'effectif permet-il de le remplir — deux hommes classés en simple
pour les deux SH, une femme pour le SD, deux hommes pour le DH, deux femmes pour
le DD, un de chaque pour le MX — et combien de joueurs sont éligibles. Pas de
verdict de niveau : il faudrait un seuil, et 001 a déjà refusé les seuils au
motif qu'ils produisent surtout de fausses alertes.

**Un amendement à 028.** 028 refusait de dériver SH/SD de « simple + sexe », au
motif que le sexe importé est une saisie manuelle et qu'en tirer une série
serait inventer une donnée fédérale. Cette spec fait cette dérivation, et c'est
tenable pour une raison précise : elle ne présente aucun fait fédéral, elle
range des joueurs pour le capitaine qui a saisi ce sexe lui-même. La page le dit
— aide à la décision, pas classement officiel. Un joueur sans classement dans la
discipline est écarté de l'ordre et nommé à part : en début de saison, c'est
presque toujours une licence fausse, pas un joueur faible.

## Questions

- Le format à six matchs est celui de la division actuelle et s'écrit en dur.
  Faudra-t-il le rendre configurable le jour où la division change, ou 011
  portera-t-il le règlement, format compris ?

## Notes

Ne dépend que de 005 et 028, toutes deux faites.

[[030__paires-et-preferences-du-capitaine]] ajoute à ces pages les paires
saisies et les marques du capitaine — c'est là que la persistance apparaît, et
c'est pourquoi les deux specs sont séparées.

Prépare [[011__composition-de-journee]], qui composera pour de bon.
