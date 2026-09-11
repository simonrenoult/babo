# Déclencher une tâche à la main

| Champ       | Valeur |
|-------------|--------|
| id          | 037    |
| module      | socle  |
| type        | feat   |
| bloquée par | —      |

## Problem Statement

[[018__socle__ordonnancement.tech]] a donné à chaque tâche périodique une
cadence et une fenêtre de grâce, et [[019__socle__robustesse-du-scraping.tech]]
lui a donné un rapport d'exécution. Le planificateur se réveille seul, au
démarrage puis à la minute, et rejoue ce qui est dû tant que la grâce tient.

Ce mécanisme suppose l'application allumée. Tant qu'elle ne l'est pas — et elle
ne l'est pas, puisqu'elle n'est pas encore déployée — les échéances passent
sans être servies, et au prochain démarrage elles tombent hors fenêtre et sont
abandonnées plutôt que rejouées. C'est précisément ce que 018 a voulu pour les
rappels J-1, et c'est précisément le tort pour une passe périodique qu'on
voudrait lancer à la main pendant la mise au point.

`/sources` porte déjà des boutons de dépannage — Sonder, Relever le classement,
Relever les engagements, Relever les tournois. Mais chacun appelle sa propre
méthode, qui exécute la passe **sans prévenir le planificateur** : l'échéance
reste en attente, le rapport se consigne en double sous la tâche, et la
prochaine occurrence prévue ne bouge pas. La passe de veilles, elle, n'a pas de
bouton du tout.

En l'état, l'écran d'exploitation ne permet donc pas de déclencher une tâche
ordonnancée **comme si le planificateur l'avait réveillée** : il faut choisir
entre exécuter la passe sans toucher à l'échéance (les boutons actuels) et
attendre que la grâce soit dépassée pour qu'elle s'exécute enfin — trop tard,
puisque « dépassée » veut alors dire « abandonnée ».

## Solution

Un seul geste, sur le tableau d'ordonnancement de `/sources` : un bouton
« Lancer » par tâche, qui déclenche la passe **comme le planificateur l'aurait
faite** — grâce court-circuitée, échéance clôturée, suivante inscrite, rapport
consigné sous le même identifiant. Le rapport s'affiche aussitôt sur l'écran.

Ce geste unique remplace les trois boutons de passe actuels (classement,
engagements, tournois), qui disparaissent : garder des boutons qui exécutent
sans prévenir le planificateur perpétuerait le défaut que cette spec retire.
`sonder` reste, car ce n'est pas une tâche ordonnancée. La passe enchaînée par
l'import d'équipe (028) passe, elle aussi, par ce même geste.

Règle uniforme : toute tâche active à cadence porte un bouton, à une exception
près — le battement, dont le silence est précisément l'information que 019
veut préserver.

## User Stories

1. En tant qu'opérateur, je veux déclencher à la main une tâche périodique,
   pour la constater pendant la mise au point sans attendre son échéance.
2. En tant qu'opérateur, je veux que le déclenchement clôture l'échéance et
   inscrive la suivante, pour que la tâche se retrouve dans le même état qu'après
   un réveil automatique.
3. En tant qu'opérateur, je veux que le rapport de la passe s'affiche
   immédiatement après le clic, pour lire son verdict sans aller le chercher
   ailleurs.
4. En tant qu'opérateur, je veux un bouton pour la passe des veilles, pour que
   celle-ci soit enfin déclenchable comme les autres.
5. En tant qu'opérateur, je veux qu'un échec manuel ne planifie pas de réessai
   silencieux à une heure puis quatre heures, pour ne pas être surpris par une
   passe qui repart toute seule pendant la mise au point.
6. En tant qu'opérateur, je veux qu'un clic pendant une passe en cours ne
   double pas l'exécution, pour ne pas marteler un compte dont le bannissement
   est un risque assumé (015).
7. En tant qu'opérateur, je veux que tous les déclenchements se fassent au même
   endroit — le tableau d'ordonnancement — plutôt que dispersés sur la page,
   pour qu'une seule lecture me dise ce qui est lancé et ce qui ne l'est pas.
8. En tant qu'opérateur, je veux que les anciens boutons de passe disparaissent,
   pour qu'aucune passe ne puisse s'exécuter en dehors du planificateur.
9. En tant qu'opérateur, je veux que l'import d'équipe enchaîne sa passe par le
   même geste que le bouton, pour que la règle « toute passe passe par le
   planificateur » tienne sans exception.
10. En tant qu'opérateur, je veux que le battement n'ait pas de bouton, pour que
    son absence constatée le lundi matin reste une information et non un mensonge
    sur l'heure à laquelle il a tourné.
11. En tant qu'opérateur, je veux que le courrier ait un bouton comme les
    autres, pour pouvoir vider la boîte d'envoi à la main si besoin.
12. En tant qu'opérateur, je veux que `sonder` reste accessible, parce que ce
    n'est pas une tâche ordonnancée et qu'elle n'a pas sa place dans le tableau.
13. En tant qu'opérateur, je veux qu'une tâche inconnue ou non branchée soit
    refusée clairement, pour ne pas croire qu'une passe a tourné quand elle
    n'existait pas.

## Implementation Decisions

- **Une seule méthode sur le planificateur.** L'ordonnanceur gagne
  `executerMaintenant(tache): Promise<Passage>`, qui rejoue le passage existant
  (`passer`/`executer`) avec `estDansLaFenetre` court-circuité : l'échéance est
  clôturée à `faite`, la suivante inscrite, le rapport consigné sous
  l'identifiant de la tâche par le même chemin qu'un réveil. C'est le seul
  module qui possède à la fois l'échéance et le rapport, donc le seul endroit
  où ce geste puisse tenir.
- **Verrou partagé avec le réveil.** `executerMaintenant` réutilise le verrou
  `enCours` du réveil : une passe qui dure ne se superpose ni à elle-même ni à
  un réveil automatique simultané (018, plafond de 015). Un déclenchement
  pendant une passe en cours attend qu'elle finisse, silencieusement, puis rend
  le rapport de sa propre passe — cohérent avec « on attend la passe et on rend
  son verdict ». Pendant la mise au point l'application est fraîche, un réveil
  automatique simultané est rare ; le risque proxy est assumé comme pour les
  boutons actuels.
- **Coup unique, sans réessai.** Une passe manuelle qui finit en `echec` ne
  planifie pas les réessais à une et quatre heures du réveil automatique : elle
  clôt l'échéance et inscrit la suivante. Le réessai est propre au réveil ; au
  déclenchement manuel, le rapport montre l'échec tout de suite et on relance à
  la main.
- **Route.** `POST /sources/ordonnancement/:tache/executer` branche la méthode.
  Elle attend la fin de la passe (le proxy coupant à 30 s est assumé, comme pour
  les boutons actuels) et réaffiche `/sources` avec le rapport rendu par la vue
  `rapport-de-passe`. L'identifiant de tâche (`acquisition:myffbad`, etc.) passe
  dans le segment du chemin.
- **Cible invalide.** Une tâche inconnue répond 404. Le battement, une tâche
  inactive et une cadence ponctuelle ne sont pas rendus comme boutons ; appelés
  directement à la route, ils sont refusés (400) plutôt qu'exécutés.
- **Port `AccesAuxSources`.** Il gagne
  `executerMaintenant(tache): Promise<RapportArchive>` et perd `relever`,
  `releverLesEngagements` et `releverLesTournois`. Les routes `/sources/classement`,
  `/sources/engagements` et `/sources/tournois` sont retirées. `sonder` reste.
- **L'import d'équipe délègue.** La passe que `importerLEquipe` enchaîne après
  un import réussi (028) appelle désormais `executerMaintenant` sur la tâche de
  classement, au lieu d'appeler la passe directement. L'import reste sur
  `/sources` et son écran ne change pas de sens : il dit « importé, et la passe
  a tourné ».
- **Tableau d'ordonnancement.** Il gagne une colonne d'action « Lancer », un
  bouton par tâche active à cadence — règle uniforme, une seule exception : le
  battement. Les cadences ponctuelles (rappels de 014) n'en portent pas, car ce
  ne sont pas des passes.
- **Rendu du rapport.** Un bloc « Dernier déclenchement » rend le rapport du
  déclenchement, remplaçant les emplacements dédiés `passe`/`engagements`/
  `tournois` de la vue `sources`. Placé juste sous le tableau d'ordonnancement :
  c'est là qu'on a cliqué, et c'est l'information qu'on cherche immédiatement après.
- **Pas de changement de schéma.** Échéances et rapports existent déjà (017,
  019) ; aucune table nouvelle ni colonne nouvelle.

## Testing Decisions

- **Ce qui fait un bon test.** On ne teste que le comportement externe : un
  déclenchement manuel laisse la tâche dans le même état qu'un réveil —
  échéance clôturée, suivante inscrite, rapport consigné sous l'identifiant —
  sans inspecter les entrailles de l'ordonnanceur.
- **Modules testés.**
  - `Ordonnanceur.executerMaintenant`, sur le joint existant
    `ordonnancement.test.ts` (doublure en mémoire + `tacheTemoin`).
  - La route, sur le joint existant `routeur-sources.test.ts` (doublure
    `AccesAuxSources`).
- **Prior art.** `ordonnancement.test.ts` teste déjà `reveiller`, `regler` et le
  rattrapage après arrêt sur le même joint ; `routeur-sources.test.ts` teste
  déjà `/sources/classement` et `/sources/engagements` sur la même doublure —
  ce sont exactement les coutures à réutiliser, aucune nouvelle à créer.
- **Cas couverts.**
  - Un déclenchement hors fenêtre de grâce clôt l'échéance et inscrit la
    suivante (la grâce est court-circuitée).
  - Le rapport est consigné sous l'identifiant de la tâche, pas en double.
  - Un échec manuel est un coup unique : pas de `reportee` à une heure.
  - Une tâche inconnue est refusée/consignée `inconnue`, pas exécutée.
  - Deux déclenchements simultanés partagent le verrou : une seule exécution.
  - La route lie la tâche du chemin et réaffiche l'écran avec le rapport.
  - L'import enchaîne par le même geste (la passe tourne via
    `executerMaintenant`, pas en direct).
  - Le battement n'a pas de bouton dans le tableau.

## Out of Scope

- **Le battement.** Pas de bouton — son silence est l'information que 019
  préserve ; le déclencher à la main mentirait sur l'heure à laquelle il a
  constaté ce qu'il annonce.
- **Les rappels ponctuels de 014.** Une échéance ponctuelle n'est pas une
  passe : un rappel J-1 envoyé à la main après l'échéance est le pire cas que
  018 cite pour justifier la grâce courte.
- **Un formulaire « tout lancer » en série.** Les tâches sont ordonnancées
  séparément (018) ; un déclenchement en série ne se justifierait que pour le
  battement, qui est exclu.
- **Un mode asynchrone.** Déposer l'échéance et rendre la main immédiatement :
  écarté — on attend la passe et on rend son rapport, parce que c'est au
  déclenchement manuel qu'on veut le verdict maintenant.
- **Le cycle de réessai sur déclenchement manuel.** Coup unique, par décision.
- **Le remplacement de `sonder`.** Ce n'est pas une tâche ordonnancée ; elle
  reste là, séparément.
- **Le redémarrage automatique de l'application.** C'est 020 ; hors sujet ici.

## Further Notes

Prolonge [[018__socle__ordonnancement.tech]] (le planificateur) et
[[019__socle__robustesse-du-scraping.tech]] (le rapport d'exécution), et range
sous un même geste ce que les boutons de `/sources` faisaient aujourd'hui chacun
à sa manière. Le tableau d'ordonnancement est l'endroit naturel : c'est déjà là
qu'on lit cadence, grâce et dernière issue, donc là que se lit aussi « je peux
la lancer ».

Sans dépendance bloquante : le planificateur existe, le port `AccesAuxSources`
expose déjà `ordonnancement` et `reglerLaTache`, il s'agit d'ajouter un geste de
la même famille.
