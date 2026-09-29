# Mesurer le taux de sollicitation aux interclubs

| Champ       | Valeur                                                                                              |
|-------------|-----------------------------------------------------------------------------------------------------|
| id          | 009                                                                                                 |
| module      | capitanat                                                                                           |
| type        | feat                                                                                                |
| bloquée par | [[011__capitanat__composition-de-journee.feat]] |

## Contexte

Sur une saison, certains joueurs sont alignés à presque toutes les journées et
d'autres rarement. C'est une source de tension dans l'équipe, et le capitaine
n'a pas de vue d'ensemble.

## Problème à résoudre

Je ne sais pas, en cours de saison, qui a été sollicité et combien de fois,
rapporté à ses disponibilités. Je risque d'oublier durablement un joueur
disponible.

Résolu quand l'outil affiche, par joueur : nombre de journées disponibles,
nombre de journées alignées, taux de sollicitation, et met en évidence les
joueurs souvent disponibles mais peu alignés.

## Solutions envisagées

- Calcul à partir des compositions enregistrées et des disponibilités
  collectées. Automatique, mais nécessite que les deux soient renseignées.
- Compteur tenu à la main. Sans dépendance, mais retombe dans le manuel.

Retenue : calcul automatique.

## Questions

- Un joueur remplaçant présent mais non aligné compte-t-il comme sollicité ?
- Le taux doit-il être un simple ratio, ou pondéré par le nombre de places ?

## Notes

Dépend de [[008__capitanat__disponibilites-interclubs.feat]] et
[[011__capitanat__composition-de-journee.feat]].
