# Collecter les disponibilités aux interclubs

| Champ  | Valeur     |
|--------|------------|
| id     | 008        |
| module | capitanat  |
| type   | feat       |

## Contexte

Avant chaque journée d'interclub, le capitaine demande aux joueurs s'ils sont
disponibles. Cela se passe aujourd'hui par messages, et les réponses se perdent
dans le fil.

## Problème à résoudre

Recueillir et consolider les disponibilités est manuel et peu fiable : il faut
relancer les silencieux, et l'état des réponses n'est jamais consolidé au même
endroit.

Résolu quand l'outil affiche, pour chaque journée à venir, l'état des réponses
de chaque joueur (disponible / indisponible / sans réponse) et permet de
relancer ceux qui n'ont pas répondu.

## Solutions envisagées

- Saisie par le capitaine de ce qu'il reçoit par ailleurs. Immédiat, mais ne
  supprime pas le travail de collecte.
- Sollicitation par mail avec réponse par lien. Automatise la collecte,
  demande une interface exposée aux joueurs.

À trancher : dépend de la volonté d'exposer une interface publique.

## Questions

- Les joueurs répondent-ils dans l'outil, ou le capitaine reste-t-il le seul
  utilisateur ?
- Faut-il gérer une disponibilité partielle (« oui si je joue en double ») ?

## Notes

Alimente [[011__composition-de-journee]] et
[[009__taux-de-sollicitation]]. Réutilise l'envoi de mails de
[[013__alerte-nouveau-tournoi]].
