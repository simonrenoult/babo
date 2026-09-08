# Calculer le ratio victoire/défaite de l'équipe

| Champ   | Valeur                                         |
|---------|------------------------------------------------|
| id      | 007                                            |
| module  | capitanat                                      |
| type    | feat                                           |
| bloquée | [[003__mon-profil__historique-de-matchs.feat]] |

## Contexte

Le classement de la poule donne le résultat des rencontres, mais pas le détail
de ce qui se gagne et se perd match par match, ni par tableau.

## Problème à résoudre

Je ne sais pas quels tableaux font gagner ou perdre l'équipe. Je ne peux donc
pas cibler où renforcer la composition.

Résolu quand l'outil affiche le bilan de l'équipe sur la saison : ratio global,
ratio par tableau, ratio par joueur, et le détail rencontre par rencontre.

## Solutions envisagées

- Agréger les matchs d'interclub déjà importés. Cohérent avec le reste, aucune
  source supplémentaire.
- Saisir les feuilles de match à la main. Exact même si la source est
  incomplète, mais fastidieux.

Retenue : agrégation de l'existant, saisie manuelle en dépannage.

## Questions

- Faut-il aussi le bilan des équipes adverses, pour préparer une rencontre ?
- Comment traiter une rencontre jouée avec un joueur hors équipe déclarée ?

## Notes

Même calcul que [[004__mon-profil__ratio-victoire-defaite-par-tableau.feat]],
appliqué à un groupe de licences.

**Dépend donc de [[003__mon-profil__historique-de-matchs.feat]]**, comme 004.
Ces Notes ne déclaraient aucune dépendance, alors que la solution retenue — «
agrégation de l'existant » — n'a rien à agréger tant que les matchs ne sont pas
en base. Le lien passait par 004 sans être écrit, ce qui suffisait à le rendre
invisible à un tri qui lit les Notes.
