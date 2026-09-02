# Suivre la performance individuelle des joueurs

| Champ  | Valeur     |
|--------|------------|
| id     | 006        |
| module | capitanat  |
| type   | feat       |

## Contexte

Composer une équipe suppose de savoir qui est en forme, au-delà du classement
qui ne bouge qu'une fois par semaine et intègre les résultats de tournoi.

## Problème à résoudre

Je juge la forme de mes joueurs à l'impression, sur ce dont je me souviens des
dernières journées. Je n'ai pas de vue factuelle des résultats récents de
chacun.

Résolu quand l'outil affiche, pour chaque membre de l'équipe : ses derniers
matchs officiels, son bilan sur les N dernières rencontres, et l'évolution de
son classement.

## Solutions envisagées

- Réutiliser la mécanique de [[003__historique-de-matchs]] appliquée à chaque
  licence de l'équipe.
- Se limiter aux matchs d'interclub de l'équipe, plus étroit mais plus simple.

Retenue : réutiliser l'historique complet, avec un filtre interclub.

## Questions

- « Performance » = bilan brut, ou pondéré par le niveau des adversaires ?
- Sur quelle profondeur juger la forme : 5 matchs, 10, la saison ?

## Notes

Dépend de [[028__nom-et-classement-de-l-equipe]] — donc de
[[005__liste-des-membres-de-l-equipe]], qui la précède — pour la liste des
joueurs et l'évolution de leur classement.
