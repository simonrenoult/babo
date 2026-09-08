# Consulter mon historique de matchs

| Champ       | Valeur                                     |
|-------------|--------------------------------------------|
| id          | 003                                        |
| module      | mon-profil                                 |
| type        | feat                                       |
| bloquée par | ~~[[015__socle__source-de-donnees.tech]]~~ |

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
- Synchronisation quotidienne depuis myffbad vers une base locale, qui sert
  aussi de socle aux statistiques.

Retenue : synchronisation quotidienne, conformément à
[[015__socle__source-de-donnees.tech]] — c'est la donnée de base de
[[004__mon-profil__ratio-victoire-defaite-par-tableau.feat]].

Un match est identifié par la combinaison licence + date + événement, complétée
du tableau et du tour, faute de quoi deux matchs joués le même jour dans la
même compétition se confondent.

## Questions

- Jusqu'où remonter dans l'historique ?
- Les matchs d'interclub sont-ils exposés au même endroit que ceux de tournoi ?
- Les pages myffbad portent-elles un identifiant de match stable ? À défaut, la
  synchronisation remplace l'existant, et une correction de score côté FFBaD
  réécrit l'historique en silence.

## Notes

Volume attendu : quelques centaines de matchs par joueur, pas un enjeu de
performance.

~~Bloquée par [[015__socle__source-de-donnees.tech]].~~ **Faite** : la fiche et
l'espace du licencié sont atteignables, et les captures sont archivées avant
analyse.

**Préalable : la table des matchs n'existe pas.**
[[017__socle__persistance-sqlite.tech]] a délibérément laissé ce schéma à
dessiner, et 015 a fixé l'ordre — la sonde d'abord, sur des pages réellement
observées, le schéma ensuite, « le dessiner avant d'avoir vu les pages serait la
même erreur que de concevoir une interface avant ses adaptateurs ». La sonde a
livré : `myffbad-resultats.txt` est dans le dépôt, à côté des tests.

Cette spec est seule sur cette table, et trois autres la liront telle quelle :
[[004__mon-profil__ratio-victoire-defaite-par-tableau.feat]],
[[006__capitanat__performance-individuelle.feat]] et
[[007__capitanat__ratio-victoire-defaite-equipe.feat]] n'ont pas d'autre source.
C'est ce qui fait d'elle le meilleur point d'entrée du backlog.
