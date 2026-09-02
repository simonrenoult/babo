# Ordonnancer les tâches périodiques et les échéances

| Champ  | Valeur |
|--------|--------|
| id     | 018    |
| module | socle  |
| type   | tech   |

## Contexte

Plusieurs traitements doivent se déclencher seuls : les deux scrapings
quotidiens de [[015__source-de-donnees]], la passe de classement de
[[001__classement]] — hebdomadaire, le vendredi à 1 h du matin, parce que le
CPPH est publié une fois par semaine —, le battement hebdomadaire de
[[019__robustesse-du-scraping]], l'alerte de veille qui suit chaque indexation
([[013__alerte-nouveau-tournoi]]), et les rappels échelonnés de
[[014__rappel-ouverture-tournoi]].

Aucune spec ne dit qui les déclenche.

## Problème à résoudre

Ces traitements ne sont pas de même nature. Les scrapings et le battement sont
périodiques et fixes. Les rappels de 014 sont des échéances calculées par
tournoi suivi — J-7, J-1, date limite — donc créées et annulées au fil de l'eau.
Faute de responsable désigné, chaque spec inventerait son propre déclenchement,
et loger le planificateur dans 015 reproduirait le défaut qu'on a corrigé en
sortant l'envoi de mail de 013 : une brique de socle logée chez un appelant.

Résolu quand un planificateur unique porte les deux natures de tâches, que ses
échéances survivent à un redémarrage, et que ses fréquences se modifient sans
redéploiement.

## Solutions envisagées

- **Cron système.** Écarté : configuration statique, éditée hors de
  l'application, et incapable de porter des échéances calculées par tournoi.
- **Planificateur interne à l'application.** Retenue : les fréquences sont des
  données, modifiables depuis l'interface, et les échéances par tournoi se
  gèrent comme le reste de l'état.

Contraintes :

- Fréquences et échéances persistées en base ([[017__persistance-sqlite]]) :
  un redémarrage ne doit ni perdre un rappel, ni le renvoyer.
- Les sources sont ordonnancées séparément : un scraping myffbad en échec, par
  exemple faute de session valide, n'empêche pas l'indexation badnet.
- Battement hebdomadaire à jour et heure fixes, pour que son absence se
  remarque.

### Rattrapage : une fenêtre de validité par tâche

Chaque tâche déclare, à côté de sa fréquence, un délai de grâce. Au démarrage,
une échéance dépassée n'est rejouée que si elle tient encore dans sa fenêtre ;
sinon elle est abandonnée et consignée en échec, ce qui la rend visible sans la
faire aboutir. Ni tout rattraper — un rappel J-1 envoyé à J+2 est pire qu'un
rappel manquant — ni tout abandonner : un arrêt du vendredi soir coûterait une
semaine de classement.

La grâce est large pour les passes périodiques, dont la donnée est de toute
façon périmée, et courte pour les rappels de 014, qui n'ont de sens qu'avant
l'échéance annoncée. Elle est **nulle pour le battement de 019** : rattrapé, il
attesterait d'une santé qu'il n'a pas constatée à l'heure dite, et c'est
justement son absence qui doit se remarquer.

| tâche                | période  | grâce |
|----------------------|----------|-------|
| passe de classement  | 1 sem    | 48 h  |
| acquisition badnet   | 1 j      | 12 h  |
| battement 019        | 1 sem    | 0     |
| rappel J-7 (014)     | échéance | 6 h   |
| rappel J-1 (014)     | échéance | 2 h   |

Valeurs de départ, en base et modifiables comme les fréquences. Une seule est
posée aujourd'hui, la passe de classement : les autres tâches n'existent pas
encore, et poser leur cadence d'avance créerait des échéances que personne ne
sait exécuter. Chacune arrivera avec sa spec, à une ligne dans `main.ts`.

### Échec : trois tentatives, espacées

Une échéance en échec est réessayée deux fois — à 1 h puis 4 h —, chaque
tentative laissant son rapport ; au-delà, abandon jusqu'à la passe suivante.
Borné, parce qu'un scraper qui boucle vaut un compte banni (015). Le même
plafond pour toutes les tâches : c'est la passe hebdomadaire qui le justifie —
y renoncer coûte une semaine — et l'appliquer aussi au quotidien ne coûte rien.

## Questions

- ~~Les fréquences et les délais de grâce s'éditent-ils depuis `/sources`, ou
  depuis un écran d'ordonnancement à part ?~~ Depuis `/sources`. Une cadence ne
  se lit qu'en regard de ce qu'elle a produit, et c'est déjà cet écran qui
  porte l'ancienneté des sources et le rapport de la dernière passe. Un écran de
  plus les aurait séparés.
- ~~Une échéance rejouée au démarrage repart-elle avec trois tentatives, ou
  reprend-elle le compteur de celles déjà consommées avant l'arrêt ?~~ Elle
  reprend le compteur : il est dans la ligne d'échéance, qui survit au
  redémarrage comme le reste. Trois tentatives par occurrence, quoi qu'il
  arrive entre-temps — sinon un processus qui redémarre en boucle rejouerait
  la même passe indéfiniment, trois fois par redémarrage.
- Qu'est-ce qui garantit le redémarrage automatique de l'application, et qui
  n'est donc pas dans l'application elle-même ? Tranché par
  [[020__architecture-applicative]] : un service supervisé.

## Notes

La mort de l'application n'est pas traitée : on compte sur un redémarrage
automatique. Tant qu'elle est arrêtée, plus rien ne s'exécute et rien ne
prévient — l'absence du battement hebdomadaire reste le seul indice. Risque
accepté.

Utilisé par [[015__source-de-donnees]], [[019__robustesse-du-scraping]],
[[013__alerte-nouveau-tournoi]] et [[014__rappel-ouverture-tournoi]].

~~Bloque [[001__classement]]~~ : 001 était faite, sauf son déclencheur. Sa passe
— `releverLesClassements`, dans `socle/core/passe-classement.ts` — consigne son
rapport sous la tâche `acquisition:myffbad`, et c'est sous ce nom que le
planificateur l'ordonnance : l'identifiant d'une tâche est celui de son rapport,
ce qui met la prochaine échéance en regard de la dernière exécution sans table
de correspondance.

Le bouton de `/sources` ne disparaît pas, contrairement à ce que cette note
prévoyait : il reste en dépannage, pour ne pas avoir à attendre le vendredi
quand on veut constater une passe réelle. C'est déjà ce que l'écran en disait.

Fait. `socle/core/ordonnancement.ts` porte les cadences, la fenêtre de grâce,
les réessais et la boucle de réveil ; `depot-reglages-sqlite.ts` et
`depot-echeances-sqlite.ts` les persistent ; `migrations/007__ordonnancement.sql`
crée les deux tables ; `/sources` affiche et règle. Voir
[ARCHITECTURE.md](../../../ARCHITECTURE.md), section « Le planificateur ».
