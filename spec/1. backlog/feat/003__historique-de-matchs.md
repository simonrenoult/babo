# Consulter mon historique de matchs

| Champ  | Valeur   |
|--------|----------|
| id     | 003      |
| module | profil   |
| type   | feat     |

## Contexte

Chaque match officiel (tournoi ou interclub) est enregistré à la FFBaD, mais
l'historique n'est consultable que match par match, sans vue d'ensemble.

## Problème à résoudre

Je ne peux pas revoir facilement mes matchs passés : contre qui, dans quel
tableau, avec quel partenaire, avec quel score, et à quelle date.

Résolu quand l'outil affiche la liste de mes matchs officiels, filtrable par
période, par tableau et par adversaire, avec le score et le contexte
(compétition, tour).

## Solutions envisagées

- Import ponctuel à la demande depuis la fiche joueur.
- Synchronisation périodique dans une base locale, qui sert aussi de socle aux
  statistiques.

Retenue : synchronisation périodique — c'est la donnée de base de
[[004__ratio-victoire-defaite-par-tableau]].

## Questions

- Jusqu'où remonter dans l'historique ?
- Les matchs d'interclub sont-ils exposés au même endroit que ceux de tournoi ?

## Notes

Volume attendu : quelques centaines de matchs par joueur, pas un enjeu de
performance.

Bloquée par [[015__source-de-donnees]].
