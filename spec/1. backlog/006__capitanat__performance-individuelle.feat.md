# Suivre la performance individuelle des joueurs

| Champ   | Valeur                                                                                                                                                             |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| id      | 006                                                                                                                                                                |
| module  | capitanat                                                                                                                                                          |
| type    | feat                                                                                                                                                               |
| bloquée | [[003__mon-profil__historique-de-matchs.feat]], ~~[[005__capitanat__liste-des-membres-de-l-equipe.feat]], [[028__capitanat__nom-et-classement-de-l-equipe.feat]]~~ |

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

- Réutiliser la mécanique de [[003__mon-profil__historique-de-matchs.feat]]
  appliquée à chaque licence de l'équipe.
- Se limiter aux matchs d'interclub de l'équipe, plus étroit mais plus simple.

Retenue : réutiliser l'historique complet, avec un filtre interclub.

## Questions

- « Performance » = bilan brut, ou pondéré par le niveau des adversaires ?
- Sur quelle profondeur juger la forme : 5 matchs, 10, la saison ?

## Notes

Dépend de [[028__capitanat__nom-et-classement-de-l-equipe.feat]] — donc de
[[005__capitanat__liste-des-membres-de-l-equipe.feat]], qui la précède — pour la
liste des joueurs et l'évolution de leur classement.

**Et de [[003__mon-profil__historique-de-matchs.feat]]**, que ces Notes
omettaient. La solution retenue plus haut est explicite : « réutiliser
l'historique complet, avec un filtre interclub ». Deux des trois choses que
cette spec promet d'afficher — les derniers matchs officiels et le bilan sur les
N dernières rencontres — n'existent nulle part avant 003. Seule la troisième,
l'évolution du classement, est disponible aujourd'hui, et c'est
[[024__mon-profil__historique-du-classement.feat]] qui la porte.

Sans ce renvoi, 006 paraissait n'attendre que des specs faites, et serait sortie
du backlog sur un tri qu'elle aurait fait mentir.
