# Lister mes prochains tournois

| Champ  | Valeur   |
|--------|----------|
| id     | 002      |
| module | profil   |
| type   | feat     |

## Contexte

Je m'inscris à des tournois plusieurs semaines à l'avance, via des canaux
variés (mail de l'organisateur, badnet, club). Le suivi se fait de mémoire ou
dans un agenda séparé.

## Problème à résoudre

Je n'ai pas de vue unique de mes engagements à venir : je peux oublier un
tournoi, ou m'inscrire deux fois sur le même week-end.

Résolu quand l'outil liste mes tournois à venir avec date, lieu, tableaux
engagés et partenaire, triés par date, et signale les chevauchements de dates.

## Solutions envisagées

- Saisie manuelle des engagements. Fiable, mais du travail de recopie.
- Récupération automatique depuis myffbad / badnet. Zéro saisie, mais dépend de
  ce que la source expose réellement.

À trancher une fois la source de données arbitrée.

## Questions

- Les inscriptions sont-elles visibles quelque part de façon exploitable, ou
  faut-il passer par une saisie manuelle ?
- Faut-il gérer les inscriptions en attente / non confirmées ?

## Notes

Recoupe [[012__recherche-de-tournois]] : un tournoi trouvé par la veille doit
pouvoir devenir un engagement.

Bloquée par [[015__source-de-donnees]].
