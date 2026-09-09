# Consulter mon historique de matchs

| Champ       | Valeur                                     |
|-------------|--------------------------------------------|
| id          | 003                                        |
| module      | mon-profil                                 |
| type        | feat                                       |
| bloquée par | ~~[[015__socle__source-de-donnees.tech]]~~ |

## Contexte

Chaque match officiel (tournoi ou interclub) est enregistré à la FFBaD, mais
l'historique n'est consultable que match par match, sans vue d'ensemble.

**Sonde du 9 septembre 2026.** myffbad expose deux fonctions serveur, et le
projet n'en connaissait qu'une. La première — celle que
[[015__socle__source-de-donnees.tech]] avait relevée sous le nom `resultats` —
ne rend pas des matchs : une ligne par **tableau joué**, avec `MatchCount`, un
`WinPoints` global et l'état d'intégration au CPPH. La seconde, jamais vue,
rend les matchs eux-mêmes : adversaires, partenaire, score set par set, tour,
et les points de chaque joueur.

Les deux s'emboîtent exactement. Le tableau des Plumes Givrées annonce
`MatchCount: "5"` et `WinPoints: "74.0000"` ; le détail rend cinq matchs où mes
points sont `+23, +17, +26, +20, −12` — somme : 74. Le second appel se demande
avec `{personId, date, disciplineId, bracketId}`, trois champs que le premier
donne.

## Problème à résoudre

Je ne peux pas revoir facilement mes matchs passés : contre qui, dans quel
tableau, avec quel partenaire, avec quel score, et à quelle date.

Résolu quand l'outil affiche mes sorties de compétition — un tournoi, une
rencontre d'interclub — chacune dépliable sur ses matchs, avec pour chaque
match le tour, le score set par set, mon partenaire, mes adversaires et l'issue,
filtrables par période et par tableau.

~~filtrable par adversaire~~ — **retiré le 9 septembre 2026** : un filtre par
adversaire n'a pas d'usage identifié. Les adversaires restent affichés et
stockés, on ne les cherche pas.

## Solutions envisagées

**Deux appels, en cascade, et un registre entre les deux.** L'agrégat par
licence, puis un détail par tableau joué qu'on ne connaît pas encore. C'est la
table des tableaux joués qui dit ce qui a déjà son détail — sans elle, chaque
passage redemanderait toute la saison.

**Trois tables, et non une.** Le *tableau joué* (l'agrégat), le *match*, et la
*participation* — une ligne par joueur présent, quatre en double, qui porte son
côté, s'il a gagné et ses points. C'est la forme de la source elle-même :
`Top`/`Bottom` avec une liste de personnes et un `WinPoints` **par personne**.
Une table unique à quatre colonnes de joueurs obligerait à désigner
arbitrairement un « joueur 1 » et n'aurait pas de place pour les points.

**L'identité vient de myffbad**, `ResultId` pour un tableau joué, `MatchId`
pour un match — jamais une clé fabriquée, et **jamais préfixée par la licence**.
Un match joué à deux arrive dans les deux listes avec le même `MatchId` : ma
finale du 4 juillet est aussi celle de mon partenaire, et une clé par licence
l'écrirait deux fois. Ces numéros ne sont pas décoratifs, myffbad s'en sert pour
recoudre le tableau (`ParentMatchId` désigne la demi-finale depuis la finale).

**L'acquisition descend dans le socle et relève les quinze licences.** C'est le
chemin de [[028__capitanat__nom-et-classement-de-l-equipe.feat]] : une passe
unique qui boucle sur les licences suivies, un rapport, une date. Un résultat de
match est un fait fédéral au même titre qu'un classement — il n'en existe pas
une version vue par `mon-profil` et une autre par `capitanat`. La page, elle,
reste dans `mon-profil` et n'affiche que moi : les pages d'équipe sont à
[[006__capitanat__performance-individuelle.feat]] et
[[007__capitanat__ratio-victoire-defaite-equipe.feat]].

**Rien ne s'efface, une ligne connue se met à jour.** La source ne rend qu'une
saison, et il faut supposer que celle de 2025-2026 disparaîtra de la réponse
quand 2026-2027 se remplira. Ce qui est entré en base y reste, même absent de la
réponse du jour. La mise à jour sur place plutôt que l'ajout couvre le cas
qu'ouvrait la troisième question ci-dessous : une correction de score côté FFBaD
se voit sans réécrire l'historique. **Et une saison entière qui s'évapore d'un
coup de la réponse déclenche une alerte** — le jour où ça arrive, on veut le
lire dans un rapport, pas le découvrir deux ans plus tard.

**Un plafond de trente détails par passage.** Le premier passage coûte quinze
agrégats et environ cent cinquante détails — quatorze tableaux joués sur une
saison pour moi, six pour un coéquipier moins assidu. Cent cinquante requêtes
d'affilée sur un compte fédéral personnel est exactement le risque de
bannissement que 015 accepte à condition de ne pas le provoquer. Le rattrapage
s'étale donc sur cinq jours, le reste repris le lendemain — c'est la borne que
[[012__veille__recherche-de-tournois.feat]] s'est déjà donnée avec ses cent
fiches par passage. En régime de croisière, un week-end de tournoi ajoute un ou
deux tableaux aux joueurs qui ont joué.

**Tâche `acquisition:myffbad:resultats`, quotidienne à 2 h, grâce de 12 h.**
Séparée de la passe de classement, qui est anonyme depuis 028 et doit le rester
— celle-ci exige une session, et les mêler ferait tomber le classement avec le
jeton. 2 h parce que myffbad intègre de nuit : les résultats du 4 juillet
portent `IntegrationDate: "2026-07-09 01:27:56"`, soit cinq jours de décalage et
une fenêtre d'intégration vers 1 h 30. Quotidienne parce que le plafond a besoin
de passages répétés : hebdomadaire, le rattrapage initial prendrait cinq
semaines.

**Échec ligne à ligne, plus une bascule collective.** Une licence muette est
notée et la passe continue — « 13 licences sur 15 » —, parce qu'un coéquipier
qui n'a rien joué depuis un mois rend une liste vide sans qu'il y ait panne.
Mais **toutes** les licences muettes le même jour, au lendemain d'un jour où
quatorze parlaient, c'est une session morte, et c'est ça qu'on signale : le
succès vide de [[019__socle__robustesse-du-scraping.tech]], à l'échelle de la
passe plutôt que de la ligne.

**Regroupement par `(EventId, Date)`**, une règle unique pour les tournois et
pour l'interclub. Conséquence assumée : un tournoi où j'ai joué deux tableaux
sur deux jours se présente en deux blocs — la Musau, `EventId 2300008697`, le DH
du 14 février et le mixte du 15. Grouper par `EventId` seul rassemblerait ce
tournoi mais collerait ensemble les onze rencontres d'une saison d'interclub,
qui portent toutes le même `EventId`.

**Les champs de tour sont stockés bruts** — `RoundName`, `RoundTypeName`,
`RoundPositionName`, `RoundOrderSupra` — et interprétés à l'affichage. Le même
`RoundName` porte deux choses selon la compétition : « Pos. 1-12 # Finale » pour
un tournoi, « 75-CPS10-5 contre 75-APSAP-5 » pour une rencontre. Trancher à
l'acquisition jetterait `RoundPositionName` (`"Final"`, `"1/2F"`, `"1/4F"`) et
`RoundOrderSupra`, qui donnent déjà l'information propre et son ordre.

**On stocke tout des adversaires** — nom, licence, club, classement et catégorie
au moment du match. C'est un écart délibéré à la règle de
[[005__capitanat__liste-des-membres-de-l-equipe.feat]] (« une colonne remplie au
cas où serait de la donnée personnelle de tiers stockée sans usage »), et il est
motivé : le détail des adversaires est ce qui rend un match lisible, et
l'amputer fermerait des évolutions qu'on ne veut pas fermer aujourd'hui. Écrit
ici pour que ce soit une décision et non un oubli.

## Questions

- ~~Jusqu'où remonter dans l'historique ?~~ **Sans objet** : la source ne donne
  qu'une saison et aucun réglage n'en sort. `isHistory:true` rend une liste
  vide ; `season` refuse `"2025"`, `2025`, `"2024"`, `"2025-2026"` et
  `"2026-2027"`, alors que la fiche annonce `currentSeasonName: "2026-2027"`.
  Seul `$undefined` répond. La profondeur ne se demande donc pas à myffbad :
  elle s'accumule chez nous, une saison à la fois.
- ~~Les matchs d'interclub sont-ils exposés au même endroit que ceux de
  tournoi ?~~ **Oui**, même appel, même forme. Et le type est nommé plutôt que
  déduit : `EventTypeId` vaut `"108"` / « Tournoi individuel » ou `"105"` /
  « Interclubs ». C'est lui qui servira au « distingue tournoi et interclub » de
  [[004__mon-profil__ratio-victoire-defaite-par-tableau.feat]].
- ~~Les pages myffbad portent-elles un identifiant de match stable ?~~ **Oui**,
  `ResultId` sur le tableau joué et `MatchId` sur le match. La crainte qui
  suivait — « une correction de score réécrit l'historique en silence » — est
  levée autrement : la mise à jour se fait sur place, sur un identifiant connu,
  donc une correction se voit au lieu de remplacer.
- Les tableaux dames n'ont jamais été observés. `DisciplineId` vaut 1 (SH), 3
  (DH) et 5 (MX) sur les deux joueurs sondés, tous deux hommes ; 2 et 4 sont SD
  et DD **par élimination**. À confirmer sur une licence féminine de l'équipe au
  premier passage réel.
- Cette spec déborde la page que `TEMPLATE.md` accorde — trois tables, deux
  appels, un plafond, une tâche, une page. La couture la plus propre serait de
  sortir l'acquisition dans une spec `socle` et de garder la page ici. Écarté
  pour l'instant : les deux moitiés ne se vérifient qu'ensemble.

## Notes

Volume attendu : quelques centaines de matchs par joueur, pas un enjeu de
performance.

~~Bloquée par [[015__socle__source-de-donnees.tech]].~~ **Faite** : la fiche et
l'espace du licencié sont atteignables, et les captures sont archivées avant
analyse.

~~Préalable : la table des matchs n'existe pas.~~ Elle est dessinée ici, et
c'est le dernier schéma que [[017__socle__persistance-sqlite.tech]] laissait
ouvert. L'ordre voulu par 015 a tenu jusqu'au bout : la sonde d'abord, sur des
pages réellement observées, le schéma ensuite.

**Les deux appels exigent la session, vérifié en anonyme.** L'agrégat rend `[]`,
le détail rend `"$undefined"`. Cette seconde forme n'est pas une liste vide :
`issueDuVolume` de 019 attend une liste pour compter, et doit la traiter en
panne franche, du côté de `404 Server action not found` plutôt que d'une
extraction vide.

**Une session lit n'importe quel licencié.** Les deux appels prennent un
`personId` en paramètre et répondent pour un autre que le sien — vérifié sur un
coéquipier. C'est ce qui rend la passe à quinze licences possible sans quinze
sessions, et ce qui débloque 006 et 007.

**Le `BracketId` d'interclub est négatif, et doit le rester.** `-2300586404`
rend le match ; `"2300586404"`, le même nombre, rend une liste vide. Une
normalisation bien intentionnée casserait toute la moitié interclub sans erreur
visible — exactement la panne muette que 019 existe pour attraper.

**`personId` est déjà acquis.** `migrations/005__identite.sql` le porte, et
`passe-classement.ts` sait le mettre en cache et relire la fiche quand le cache
est périmé. Rien à construire : la chaîne d'identité des quinze licences existe.

**Amende [[005__capitanat__liste-des-membres-de-l-equipe.feat]] et
[[028__capitanat__nom-et-classement-de-l-equipe.feat]] sur le ménage.** Un
coéquipier retiré du CSV perd son nom et ses relevés de classement ; il **garde
ses matchs et ses participations**. Un match est un fait passé, daté, partagé
avec trois autres personnes : il ne cesse pas d'être le mien parce qu'un
partenaire a changé de club, et l'effacer rendrait faux le bilan d'équipe de 007
sur les saisons écoulées.

**Réduit [[006__capitanat__performance-individuelle.feat]].** Ses Notes la
disent dépendante de 003 « pour l'historique complet » ; elle en héritera la
table déjà remplie pour les quinze licences. Ce qui lui reste est une page et un
calcul de forme, pas une acquisition.

Cette spec est seule sur ces trois tables, et trois autres les liront telles
quelles : [[004__mon-profil__ratio-victoire-defaite-par-tableau.feat]],
[[006__capitanat__performance-individuelle.feat]] et
[[007__capitanat__ratio-victoire-defaite-equipe.feat]] n'ont pas d'autre source.
C'est ce qui fait d'elle le meilleur point d'entrée du backlog.
