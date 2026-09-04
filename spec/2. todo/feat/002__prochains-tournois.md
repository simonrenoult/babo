# Lister mes prochains tournois

| Champ  | Valeur   |
|--------|----------|
| id     | 002      |
| module | mon-profil |
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
- Récupération automatique depuis myffbad, source des données personnelles
  retenue en [[015__source-de-donnees]]. Zéro saisie, mais dépend de ce que la
  fiche joueur expose réellement des inscriptions.

À trancher une fois la faisabilité du scraping myffbad établie : c'est la seule
donnée du backlog dont on ignore encore si la source la porte.

## Questions

- Les inscriptions sont-elles visibles sur myffbad de façon exploitable, ou
  faut-il passer par une saisie manuelle ?
- Faut-il gérer les inscriptions en attente / non confirmées ?

## Notes

Recoupe [[012__recherche-de-tournois]] : un tournoi trouvé par la veille doit
pouvoir devenir un engagement.

~~Bloquée par [[015__source-de-donnees]].~~ **Faite** : l'accès aux deux
sources est en place, sessions, plafond de requêtes et archivage des captures
compris.

**Préalable : la table des engagements n'existe pas.**
[[017__persistance-sqlite]] a délibérément laissé le schéma des matchs et des
tournois à dessiner, et 015 a fixé l'ordre — « une base minimale, puis la sonde
d'accès jusqu'à extraire un match et un tournoi réels, puis seulement le schéma
définitif ». La sonde a livré : `badnet-recherche.html` est dans le dépôt, à
côté des tests.

C'est donc cette spec qui dessine la table des engagements — celle que
[[027__engagements-badnet]] viendra ensuite remplir sans la main. Elle partage
avec [[012__recherche-de-tournois]] la description d'un tournoi : la première
des deux traitée la paiera pour l'autre.
