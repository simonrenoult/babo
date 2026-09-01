# Ordonnancer les tâches périodiques et les échéances

| Champ  | Valeur |
|--------|--------|
| id     | 018    |
| module | socle  |
| type   | tech   |

## Contexte

Plusieurs traitements doivent se déclencher seuls : les deux scrapings
quotidiens de [[015__source-de-donnees]], le battement hebdomadaire de
[[019__robustesse-du-scraping]],
l'alerte de veille qui suit chaque indexation
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

## Questions

- Que deviennent les échéances dépassées pendant un arrêt : rattrapées au
  démarrage, ou abandonnées ? Un rappel J-1 envoyé à J+2 est pire qu'un rappel
  manquant.
- Un scraping en échec est-il réessayé dans la journée, ou attend-il la passe
  du lendemain ?
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

~~Bloque [[001__classement]]~~ : 001 est faite, sauf son déclencheur. Sa passe
existe — `releverLeClassement`, dans `socle/core/passe-classement.ts` — écrit
en base et consigne son rapport sous la tâche `acquisition:myffbad`. Elle ne
lève rien : toute panne devient un rapport en échec, parce qu'un ordonnanceur
n'a personne à qui remonter une exception. C'est cette fonction qu'il y aura à
appeler chaque jour, et le bouton de `/sources` disparaîtra alors.
