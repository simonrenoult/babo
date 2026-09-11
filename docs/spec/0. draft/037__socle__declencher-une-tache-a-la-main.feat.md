# Déclencher une tâche à la main

| Champ       | Valeur |
|-------------|--------|
| id          | 037    |
| module      | socle  |
| type        | feat   |
| bloquée par | —      |

## Contexte

[[018__socle__ordonnancement.tech]] a donné à chaque tâche périodique une
cadence et une fenêtre de grâce, et [[019__socle__robustesse-du-scraping.tech]]
lui a donné un rapport d'exécution. Le planificateur se réveille seul, au
démarrage puis à la minute, et rejoue ce qui est dû tant que la grâce tient.

Ce mécanisme suppose l'application allumée. Tant qu'elle ne l'est pas — et elle
ne l'est pas, puisqu'elle n'est pas encore déployée — les échéances passent
sans être servies, et au prochain démarrage elles tombent hors fenêtre et sont
abandonnées plutôt que rejouées. C'est précisément ce que 018 a voulu pour les
rappels J-1, et c'est précisément le tort pour une passe périodique qu'on
voudrait justement pouvoir lancer à la main pendant la mise au point.

`/sources` porte déjà des boutons de dépannage — Sonder, Relever le
classement, Relever les engagements, Relever les tournois. Mais chacun appelle
sa propre méthode de `AccesAuxSources`, qui exécute la passe sans prévenir le
planificateur : l'échéance reste en attente, le rapport se consigne en double
sous la tâche, et la prochaine occurrence prévue ne bouge pas. La passe de
veille, elle, n'a pas de bouton du tout.

## Problème à résoudre

En l'état, l'écran d'exploitation ne permet pas de déclencher une tâche
ordonnancée **comme si le planificateur l'avait réveillée** : il faut choisir
entre exécuter la passe sans toucher à l'échéance (les boutons actuels) et
attendre que la grâce soit dépassée pour qu'elle s'exécute enfin — trop tard,
puisque dépassée veut alors dire abandonnée.

Résolu quand chaque tâche de l'ordonnancement porte un bouton qui l'exécute,
consigne son rapport sous le même identifiant, clôt son échéance et en inscrit
la suivante ; quand l'exécution manuelle d'une tâche la laisse dans le même état
qu'un réveil automatique ; et quand `npm run verifier` passe sans changement de
comportement pour les réveils automatiques.

## Solutions envisagées

- **Un bouton par tâche, qui délègue au planificateur.** Retenue : une seule
  méthode `executerMaintenant(tache)` sur l'ordonnanceur, qui rejoue le
  passage — `estDansLaFenetre` court-circuité, l'échéance clôturée à `faite`,
  la suivante inscrite, le rapport consigné comme pour un réveil. Une route
  `POST /sources/ordonnancement/:tache/executer` la branche ; le tableau
  d'ordonnancement gagne une colonne d'action. La grâce n'a plus à être
  enfreinte à la main : la passe part quand on clique, point.
- **Étendre les boutons actuels pour qu'ils touchent aussi l'échéance.** Refusé
  : chaque bouton dupliquerait la logique de clôture et de replanification, et
  la passe de veilles devrait en plus recevoir le sien. Un mécanisme unique
  remplace cinq dédoublements.
- **Ne rien faire, et s'appuyer sur le démarrage.** Au démarrage, le
  rattrapage rejoue ce qui est dû tant que la grâce tient. Mais la grâce, par
  construction, est dépassée après quelques jours d'arrêt — c'est le cas
  décrit ici, et précisément celui que 018 abandonne.

Contraintes :

- **Un bouton par tâche, pas un formulaire global.** Les tâches sont
  ordonnancées séparément (018) ; un déclenchement en série ne se justifie
  que pour le battement, qui n'a pas à être déclenché.
- **Le battement n'a pas de bouton.** Sa raison d'être est que son absence se
  remarque (019) : le déclencher à la main attesterait d'une santé qu'il n'a
  pas constatée à l'heure dite, exactement le mensonge que sa grâce nulle
  évite. Les boutons n'apparaissent que pour les tâches actives dont
  l'exécution est un dépannage.
- **Les rappels ponctuels de 014 ne sont pas concernés.** Une échéance
  ponctuelle n'est pas une passe : un rappel J-1 envoyé à la main après
  l'échéance est le pire cas que 018 cite pour justifier la grâce courte. Les
  boutons ne portent que sur les tâches à cadence.
- **Une exécution à la fois.** Le verrou `enCours` du réveil vaut pour le
  déclenchement manuel : une passe qui dure ne se superpose ni à elle-même ni
  à un réveil simultané (018, plafond de 015).

## Questions

- La route attend-elle la fin de la passe pour répondre, ou dépose-t-elle
  l'échéance et rend la main ? Une passe badnet peut durer ; tenir la requête
  ouverte n'est pas un problème en exploitation, mais l'est sur un proxy qui
  coupe à 30 s.
- L'échéance en cours d'exécution par le planificateur au moment du clic —
  `enCours` la protège déjà, mais le bouton le dit-il, ou échoue-t-il
  silencieusement ?
- Les boutons de passe actuels (Sonder, classement, engagements, tournois)
  disparaissent-ils au profit de celui-ci, ou coexistent-ils ? Sonder n'est pas
  une tâche ordonnancée et resterait ; les trois autres le deviendraient, mais
  leurs routes ont des tests et des modèles de vue dédiés.
- L'écran affiche-t-il le rapport rendu par le déclenchement, comme le font
  les boutons actuels, ou seulement la nouvelle prochaine échéance ?

## Notes

Prolonge [[018__socle__ordonnancement.tech]] (le planificateur) et
[[019__socle__robustesse-du-scraping.tech]] (le rapport d'exécution), et range
sous un même geste ce que les boutons de `/sources` font aujourd'hui chacun à
sa manière. Le tableau d'ordonnancement est l'endroit naturel : c'est déjà là
qu'on lit cadence, grâce et dernière issue, donc là que se lit aussi « je peux
la lancer ».

Sans dépendance bloquante : le planificateur existe, le port `AccesAuxSources`
expose déjà `ordonnancement` et `reglerLaTache`, il s'agit d'ajouter un geste
de la même famille.
