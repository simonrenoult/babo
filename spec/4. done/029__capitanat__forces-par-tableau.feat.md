# Voir mes forces tableau par tableau

| Champ  | Valeur    |
|--------|-----------|
| id     | 029       |
| module | capitanat |
| type   | feat      |

## Contexte

`/capitanat` liste l'équipe et, pour chaque membre, ses trois classements —
simple, double, mixte ([[028__capitanat__nom-et-classement-de-l-equipe.feat]]).
C'est une liste de personnes.

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
  [[005__capitanat__liste-des-membres-de-l-equipe.feat]], cote et lettre de la
  passe de 028 : aucune saisie, aucune source nouvelle, aucune table. C'est ce
  qui sépare cette spec de [[010__capitanat__tableaux-preferes.feat]], qui
  attend une déclaration des joueurs, et de
  [[011__capitanat__composition-de-journee.feat]], qui attend le règlement
  modélisé.
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
  portera-t-il le règlement, format compris ? **Toujours ouverte.** Le format
  est la constante `FORMAT` de `capitanat/core/forces-par-tableau.ts` : cinq
  lignes à relire, au même endroit que ce qui les consomme. Une constante que
  l'on relit vaut mieux qu'un réglage que personne n'a jamais changé, et le
  jour où la division change, la question se posera avec le règlement de 011
  sous les yeux plutôt qu'avant.

## Notes

Ne dépend que de 005 et 028, toutes deux faites.

[[030__capitanat__paires-et-preferences-du-capitaine.feat]] ajoute à ces pages
les paires saisies et les marques du capitaine — c'est là que la persistance
apparaît, et c'est pourquoi les deux specs sont séparées.

Prépare [[011__capitanat__composition-de-journee.feat]], qui composera pour de
bon.

## Fait

**Cinq pages sous un index, le 3 septembre 2026.** `/capitanat` garde l'équipe
et gagne l'index des cinq tableaux ; chacun a sa page sous
`/capitanat/tableau/<code>` — `SH`, `SD`, `DH`, `DD`, `MX`, tolérants à la
casse parce qu'une URL qu'on met en favori se retape aussi à la main. Ce qui
n'est pas un tableau tombe sur le 404 du socle plutôt que de rendre une page
vide de sens. Aucune table, aucune migration, aucune requête réseau : tout se
dérive du sexe importé par 005 et de la passe de 028.

**L'unité de compte est la place, pas le match.** Décidé en écrivant : deux SH
sont deux matchs à un joueur chacun, un DH un seul match à deux joueurs, et les
deux réclament pourtant deux hommes. Compter les matchs aurait rendu le DH
faisable à un joueur. Le manque se compte donc par sexe — six matchs, cinq
tableaux, neuf places — et c'est la seule façon de dire qu'un mixte de trois
hommes reste infaisable, ce que le total des éligibles laisserait passer.

**Le sexe décide qui est concerné, le classement décide seulement du rang.**
Une femme n'est pas « écartée du DH faute de classement » : elle n'y joue pas,
et la nommer là serait un reproche adressé à la mauvaise personne. Seuls les
joueurs du bon sexe sont écartés, et leur motif est distingué : `jamais-releve`
— aucune passe n'a abouti, le cas qui sent la licence fausse — ou
`discipline-absente`, un joueur relevé qui n'a jamais joué cette discipline en
compétition. Les deux ne veulent pas dire la même chose et l'écran les sépare.

**Trois pièces mises en commun plutôt que dupliquées.** L'intitulé d'un tableau
(« Double mixte ») descend dans `socle/core/tableau.ts` avec `Tableau` : il n'en
existe pas une version vue par `capitanat` et une autre par `veille`. Le tri par
nom de 028 est exporté et sert à départager deux joueurs à la même cote — deux
tris qui départageraient les homonymes différemment feraient bouger un joueur
d'une page à l'autre sans raison lisible. Et l'accord grammatical des places
(« une femme classée en double », « un homme et une femme classés en mixte »)
sort dans `presentation/mots.ts` : une page qui écrit mal ce qu'elle a compté
fait douter du compte.

**Une chose que la spec ne demandait pas** : la page porte la date du dernier
relevé des joueurs qu'elle liste. Un ordre de force calculé sur un relevé de
trois semaines n'est pas faux, mais la page qui se tait là-dessus laisse croire
qu'il est d'aujourd'hui — c'est la règle de 001, reprise ici.

Vérifié sur deux plans. Le cœur pour lui-même : l'ordre à la cote, l'éligibilité
par sexe, le mixte qui réclame un de chaque, le décompte des manques, les
écartés et leurs deux motifs, la cote et la lettre jamais converties, et le
non-cumul — un même homme alignable en SH, DH et MX. Puis l'assemblage réel,
avec l'équipe de début de saison de 028 : l'index nomme les cinq tableaux
infaisables, `/capitanat/tableau/DH` range Simon RENOULT avec 1 311 et D8,
`/capitanat/tableau/SD` nomme à part la licence muette, `/capitanat/tableau/mx`
répond et `/capitanat/tableau/XY` rend 404. La porte de 021 couvre ces pages
sans qu'on l'ait branchée : le garde est monté avant les routes.
