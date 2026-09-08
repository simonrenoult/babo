# Afficher mon classement

| Champ       | Valeur                                                                                                                                    |
|-------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| id          | 001                                                                                                                                       |
| module      | mon-profil                                                                                                                                |
| type        | feat                                                                                                                                      |
| bloquée par | ~~[[015__socle__source-de-donnees.tech]], [[018__socle__ordonnancement.tech]], [[025__mon-profil__renommage-du-module-profil.refactor]]~~ |

## Contexte

Le classement FFBaD d'un joueur évolue à chaque publication (CPPH
hebdomadaire) et conditionne les tableaux accessibles en tournoi. Aujourd'hui
il faut aller le consulter à la main sur myffbad.

C'est aussi la première spec à tirer une donnée métier de myffbad :
[[015__socle__source-de-donnees.tech]] prouve l'accès, celle-ci en fait quelque
chose. Elle apporte donc le premier parseur de production — page, table,
migration.

## Problème à résoudre

Je ne sais pas, sans aller chercher l'information, quel est mon classement
courant dans chacun de mes tableaux (simple, double, mixte).

Résolu quand la page `/mon-profil` affiche, pour la licence de la
configuration : le numéro de licence, la date de la passe qui a relevé ces
valeurs, puis une ligne par tableau présent sur la fiche — tableau, lettre,
CPPH — dans l'ordre simple, double, mixte.

Vérifié de deux façons : le parseur rejoué sur une capture réelle archivée, sans
réseau ; et une passe réelle constatée une fois à la mise en service. La
première seule ne prouverait que le parseur, pas la chaîne ~~session →~~ requête
→ base → page. **Amendée par
[[028__capitanat__nom-et-classement-de-l-equipe.feat]] : la chaîne n'a plus de
session.**

## Solutions envisagées

- Scraper la fiche joueur myffbad. Retenue, conformément à
  [[015__socle__source-de-donnees.tech]] : c'est la source unique du classement.
- Ingérer le fichier CPPH publié chaque semaine. Écarté en
  [[015__socle__source-de-donnees.tech]] au profit de myffbad, qui couvre aussi
  le classement des coéquipiers.

Où le code atterrit :

- `socle/core` porte `Classement` — une lettre et un CPPH rattachés à une
  **discipline**, et non à un `Tableau` : voir la correction en Notes. C'est un
  fait fédéral, pas la représentation d'un module : il rejoint `Licence` et
  `Tableau`, et [[022__socle__decoupage-du-code.tech]] est amendée en ce sens.
  `Joueur`, lui, reste dupliqué entre modules.
- `socle/infrastructure` porte le parseur de la fiche et le dépôt SQLite : le
  parsing d'un site vit dans un module unique
  ([[015__socle__source-de-donnees.tech]]).
- `mon-profil` lit le dépôt et affiche. Aucune feature ne parle à myffbad.

La lettre est une valeur fermée — `N1` à `N3`, `R4` à `R6`, `D7` à `D9`, `P10` à
`P12`, `NC` — et le CPPH un nombre. Une valeur inattendue fait échouer
l'extraction plutôt que d'entrer en base : c'est exactement le succès vide
décrit par [[019__socle__robustesse-du-scraping.tech]], et le seul moyen qu'il
se voie. Contrepartie assumée : une évolution légitime du barème casse la passe
jusqu'à correction, la capture archivée permettant de corriger hors ligne.

Une passe par semaine, le vendredi à 1 h du matin. Le CPPH est publié une fois
par semaine, en fin de semaine : relever à l'heure creuse qui suit donne la
valeur du jour même, et une passe quotidienne coûterait sept requêtes là où une
seule valeur peut avoir changé. C'est [[018__socle__ordonnancement.tech]] qui
portera l'horaire.

Une ligne par changement de valeur, jamais une par passe : le classement ne
bouge qu'aux publications qui suivent une compétition jouée, et sans cette
règle la passe hebdomadaire écrirait cinquante-deux lignes identiques par an
et par discipline. Chaque ligne porte `apparu_le` et `vu_le`, ce dernier mis à
jour à chaque passe réussie ; la page affiche `vu_le`. Conservation sans
limite : une douzaine de lignes par an et par tableau.

Écarté : un bouton « rafraîchir maintenant ». 015 accepte le risque de
bannissement sur la base d'un passage par jour ; un bouton met ce plafond dans
les mains de l'utilisateur.

## Questions

Aucune. ~~Ce que la fiche expose exactement — libellé des tableaux, présence
d'un tableau jamais joué — sera constaté par la sonde de
[[015__socle__source-de-donnees.tech]]~~ **Constaté : voir Notes.** On affiche
ce qu'elle donne, `NC` compris, sans rien inventer.

## Notes

~~Une seule licence, la mienne, lue dans la configuration. Les classements des
coéquipiers relèvent de [[005__capitanat__liste-des-membres-de-l-equipe.feat]],
dans `capitanat`, qui partage la source de données sans partager le modèle
joueur.~~

**Amendée par [[028__capitanat__nom-et-classement-de-l-equipe.feat]] sur deux
points, et c'est la même découverte qui les emporte tous les deux.**

*La session.* Cette passe exigeait un jeton myffbad valide et refusait de partir
sans, au motif que l'action `classement` prend un `personId` que seul le JWT
porterait. La sonde du 2 septembre 2026 a montré le contraire : la fiche
publique `/joueur/<licence>` porte ce `personId`, répond avec
`isAuthenticated:false`, et l'action rend ensuite 2229 octets à froid — la même
taille qu'archivée sous session. L'exigence est retirée. Elle supprime un mode
de panne entier : le vendredi où le jeton est mort, le classement est relevé
quand même.

*Une seule licence.* Puisque la chaîne est anonyme et prend une licence en
entrée, rien ne justifiait plus une passe par joueur. Il n'y en a qu'une, qui
boucle sur les licences suivies — la mienne et celles de l'équipe, dédoublonnées.
Un seul relevé, un seul rapport, une seule date affichée. `capitanat` continue
de ne pas partager le modèle joueur : ce qui descend dans le socle, c'est le
nom et le classement, deux faits fédéraux — jamais `Joueur`.

Avant la première passe réussie, la page affiche « aucun relevé : la première
passe myffbad n'a pas encore abouti » — jamais un tableau de tirets, qui se
confondrait avec un joueur non classé.

Bloquée par [[015__socle__source-de-donnees.tech]] pour l'accès et par
[[018__socle__ordonnancement.tech]] pour le déclenchement hebdomadaire —
vendredi 1 h. Suppose [[025__mon-profil__renommage-du-module-profil.refactor]]
fait.

Prolongée par [[024__mon-profil__historique-du-classement.feat]] : la variation
et l'évolution en relèvent. C'est pour elle qu'`apparu_le` est écrit dès
maintenant — un historique ne se rattrape pas après coup, et l'antériorité
myffbad n'est pas importée.

## Ce que la fiche a montré

**Trois disciplines, pas cinq tableaux.** La capture du 1er septembre 2026
expose `SimpleSubLevel`, `DoubleSubLevel` et `MixteSubLevel`, avec les CPPH
`SimpleRate`, `DoubleRate` et `MixteRate`. Cette spec disait « rattachés à un
`Tableau` » avant qu'on ait vu la fiche ; c'est faux, et le `core` porte
désormais une `Discipline` — `simple`, `double`, `mixte` — distincte de
`Tableau`. Passer de « simple » à `SH` demanderait le sexe du licencié, que rien
ne configure et que la fiche ne donne pas : ce serait inventer là où cette spec
demande d'afficher ce que la source donne. `Tableau` reste ce qu'il est, le
tableau d'une compétition — celui de
[[004__mon-profil__ratio-victoire-defaite-par-tableau.feat]],
[[010__capitanat__tableaux-preferes.feat]] et
[[012__veille__recherche-de-tournois.feat]].

**La fiche porte sa propre date de publication**, `RankingDate` — `2026-09-01`
sur la capture. Elle n'est pas lue : cette spec affiche `vu_le`, la date de la
passe, et c'est bien à cette question-là que la page répond (« est-ce à jour ?
»). Mais elle rouvre l'arbitrage de
[[024__mon-profil__historique-du-classement.feat]], qui écartait l'import de
l'antériorité « faute de savoir ce que la fiche expose réellement » : la fiche
donne aussi `Best*SubLevel` et `Best*RankingDate`, soit un point d'antériorité
par discipline, déjà archivé dans la capture.

**Le CPPH arrive en chaîne** — `"936.00"`. Il devient un nombre au parsing ;
une valeur qui ne s'y convertit pas fait échouer la passe, au même titre qu'une
lettre hors barème.

## Ce qui reste à 018

La passe existe et écrit ; elle n'a pas de déclencheur hebdomadaire, qui est le
sujet de [[018__socle__ordonnancement.tech]]. En attendant, `/sources` la lance
à la main. Ce n'est pas le bouton « rafraîchir maintenant » écarté ci-dessus :
celui-là serait sur `/mon-profil`, entre les mains de l'utilisateur ; celui-ci
est sur l'écran d'exploitation, il rend possible la passe réelle exigée à la
mise en service, et il disparaît avec 018.
