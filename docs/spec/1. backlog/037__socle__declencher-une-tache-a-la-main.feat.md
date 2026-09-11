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

`/sources` porte déjà des boutons de dépannage — Sonder, Relever le classement,
Relever les engagements, Relever les tournois. Mais chacun appelle sa propre
méthode de `AccesAuxSources`, qui exécute la passe sans prévenir le
planificateur : l'échéance reste en attente, le rapport se consigne en double
sous la tâche, et la prochaine occurrence prévue ne bouge pas. La passe de
veille, elle, n'a pas de bouton du tout.

## Problème à résoudre

En l'état, l'écran d'exploitation ne permet pas de déclencher une tâche
ordonnancée **comme si le planificateur l'avait réveillée** : il faut choisir
entre exécuter la passe sans toucher à l'échéance (les boutons actuels) et
attendre que la grâce soit dépassée pour qu'elle s'exécute enfin — trop tard,
puisque dépassée veut alors dire abandonnée.

Résolu quand chaque tâche ordonnancée porte un bouton qui l'exécute, consigne
son rapport sous le même identifiant, clôt son échéance et en inscrit la
suivante ; quand l'exécution manuelle d'une tâche la laisse dans le même état
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
  remplace cinq dédoublements. C'est la même raison qui fait **disparaître**
  les trois boutons de passe au profit de la colonne d'action, plutôt que de
  les faire coexister : garder des boutons qui exécutent sans prévenir le
  planificateur perpétuerait exactement le défaut que cette spec retire.
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
  évite.
- **Toute tâche active à cadence a un bouton — règle uniforme, une exception
  (le battement).** Toutes les tâches périodiques de `main.ts` — classement,
  engagements, tournois, veilles, courrier — en portent un, y compris le
  courrier dont le déclenchement est inoffensif. Une règle unique et lisible
  vaut mieux qu'une liste d'exceptions. Les rappels ponctuels de 014 ne sont
  pas concernés : une échéance ponctuelle n'est pas une passe, et la contrainte
  du paragraphe suivant tient.
- **Les rappels ponctuels de 014 ne sont pas concernés.** Une échéance
  ponctuelle n'est pas une passe : un rappel J-1 envoyé à la main après
  l'échéance est le pire cas que 018 cite pour justifier la grâce courte. Les
  boutons ne portent que sur les tâches à cadence.
- **Une exécution à la fois.** Le verrou `enCours` du réveil vaut pour le
  déclenchement manuel : une passe qui dure ne se superpose ni à elle-même ni
  à un réveil simultané (018, plafond de 015). Le bouton le partage — un clic
  pendant une passe en cours attend qu'elle finisse.
- **Les trois boutons de passe disparaissent.** `classement`, `engagements` et
  `tournois` cèdent la place à la colonne d'action du tableau d'ordonnancement,
  et leurs routes comme leurs méthodes de `AccesAuxSources` sont retirées
  (`relever`, `releverLesEngagements`, `releverLesTournois`). `sonder` reste :
  ce n'est pas une tâche ordonnancée et n'a pas de bouton dans le tableau.
- **L'import d'équipe passe par la même geste.** La passe que `importerLEquipe`
  enchaîne après un import réussi (028) appelle désormais
  `executerMaintenant` sur la tâche de classement, pour qu'aucune passe ne
  s'exécute en dehors du planificateur. L'import reste sur `/sources` et son
  écran ne change pas de sens — il dit seulement « importé, et la passe a
  tourné ».
- **Une exécution manuelle est un coup unique, sans réessai.** Une passe
  déclenchée à la main qui finit en `echec` ne planifie pas les réessais à une
  et quatre heures du réveil automatique : elle clôt son échéance et inscrit la
  suivante. Pendant la mise au point on relance à la main, et un réessai
  silencieux une heure plus tard serait une surprise. Le rapport rendu montre
  l'échec tout de suite.
- **Le bouton attend la passe et rend son rapport.** Comme les boutons actuels,
  il tient la requête ouverte le temps de la passe — qui peut durer, le proxy
  coupant à 30 s étant assumé comme aujourd'hui — et réaffiche l'écran avec
  `rapport-de-passe`. C'est au déclenchement manuel qu'on veut le résultat
  maintenant, pas à la prochaine occurrence.

## Questions

- ~~La route attend-elle la fin de la passe pour répondre, ou dépose-t-elle
  l'échéance et rend la main ?~~ Elle attend, et rend le rapport — le modèle
  des boutons actuels, et le moment où on veut le verdict.
- ~~L'échéance en cours d'exécution par le planificateur au moment du clic —
  `enCours` la protège déjà, mais le bouton le dit-il, ou échoue-t-il
  silencieusement ?~~ Le bouton partage le verrou et attend que la passe en
  cours finisse ; il ne se superpose jamais et ne joue pas en double.
- ~~Les boutons de passe actuels (Sonder, classement, engagements, tournois)
  disparaissent-ils au profit de celui-ci, ou coexistent-ils ?~~ Sonder reste ;
  les trois autres disparaissent, routes et méthodes comprises. Coexister
  perpétuerait le demi-câblage que la spec retire. La passe enchaînée par
  l'import suit la même décision.
- ~~L'écran affiche-t-il le rapport rendu par le déclenchement, comme le font
  les boutons actuels, ou seulement la nouvelle prochaine échéance ?~~ Il
  affiche le rapport, parce que c'est exactement ce qu'on veut voir d'un
  déclenchement manuel.
- ~~Une passe manuelle qui échoue entre-t-elle dans le cycle de réessai à une
  et quatre heures ?~~ Non : un coup unique, sans réessai automatique. Le
  rapport montre l'échec, et on relance à la main.

## Notes

Prolonge [[018__socle__ordonnancement.tech]] (le planificateur) et
[[019__socle__robustesse-du-scraping.tech]] (le rapport d'exécution), et range
sous un même geste ce que les boutons de `/sources` font aujourd'hui chacun à
sa manière.

**Un seul joint de test, au niveau du planificateur.** `executerMaintenant` vit
dans `creerOrdonnanceur`, la seule instance qui possède `passer`/`executer`,
l'échéance et le rapport : c'est le joint le plus haut et le seul nouveau.
`AccesAuxSources` n'expose qu'un appel, et la route ne fait que le brancher.
Les tests portent là :

- `ordonnancement.test.ts` — sur le joint existant, avec la même doublure en
  mémoire et `tacheTemoin` : une exécution manuelle clôt l'échéance et inscrit
  la suivante même hors fenêtre de grâce ; elle consigne sous l'identifiant de
  la tâche ; un échec manuel est un coup unique sans réessai ; une tâche non
  branchée est refusée/consignée `inconnue` ; deux déclenchements simultanés
  partagent le verrou d'une seule exécution.
- `routeur-sources.test.ts` — sur le joint existant de la doublure
  `AccesAuxSources` : la route lie la tâche du chemin et réaffiche l'écran
  avec le rapport rendu ; et l'import enchaîne désormais par la même geste.

Le tableau d'ordonnancement est l'endroit naturel : c'est déjà là qu'on lit
cadence, grâce et dernière issue, donc là que se lit aussi « je peux la
lancer ». La colonne d'action ne porte un bouton que pour les tâches actives à
cadence (toute tâche du tableau sauf le battement, et sauf une cadence
ponctuelle — aucune n'est en base aujourd'hui).

Sans dépendance bloquante : le planificateur existe, le port `AccesAuxSources`
expose déjà `ordonnancement` et `reglerLaTache`, il s'agit d'ajouter un geste
de la même famille.
