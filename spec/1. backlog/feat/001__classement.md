# Afficher mon classement

| Champ  | Valeur   |
|--------|----------|
| id     | 001      |
| module | profil   |
| type   | feat     |

## Contexte

Le classement FFBaD d'un joueur évolue à chaque publication (CPPH mensuel) et
conditionne les tableaux accessibles en tournoi. Aujourd'hui il faut aller le
consulter à la main sur myffbad.

## Problème à résoudre

Je ne sais pas, sans aller chercher l'information, quel est mon classement
courant dans chacun des trois tableaux (simple, double, mixte), ni comment il a
bougé depuis la dernière publication.

Résolu quand l'outil affiche, pour ma licence : le classement (lettre + CPPH)
par tableau, la date de la publication utilisée, et la variation par rapport à
la publication précédente.

## Solutions envisagées

- Scraper la fiche joueur myffbad à la demande. Simple, mais dépendant du HTML
  et sans historique.
- Ingérer le fichier CPPH publié chaque mois et le stocker. Donne l'historique
  et la variation gratuitement, demande un stockage et un job d'import.

Retenue : import CPPH, car [[004__ratio-victoire-defaite-par-tableau]] et
[[003__historique-de-matchs]] ont besoin du même historique.

## Questions

- Le fichier CPPH est-il récupérable sans authentification ?
- Une seule licence (la mienne) ou plusieurs profils dès le départ ?

## Notes

Le module `profil` partage sa source de données avec `capitanat`.

Bloquée par [[015__source-de-donnees]].
