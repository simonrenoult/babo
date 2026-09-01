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
par tableau, la date du relevé utilisé, et la variation par rapport au relevé
précédent enregistré par l'outil.

## Solutions envisagées

- Scraper la fiche joueur myffbad. Retenue, conformément à
  [[015__source-de-donnees]] : c'est la source unique du classement.
- Ingérer le fichier CPPH publié chaque mois. Écarté en
  [[015__source-de-donnees]] au profit de myffbad, qui couvre aussi le
  classement des coéquipiers.

Conséquence du choix : myffbad n'expose que le classement courant, pas
l'antériorité. L'historique se constitue en enregistrant chaque relevé
quotidien, donc aucune variation n'est affichable avant la première
publication suivant la mise en service.

## Questions

- Une seule licence (la mienne) ou plusieurs profils dès le départ ?
- Affiche-t-on « — » pour la variation tant que le second relevé manque, ou
  masque-t-on la colonne ?

## Notes

Le module `profil` partage sa source de données avec `capitanat`.

Bloquée par [[015__source-de-donnees]].
