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

- ~~Saisie manuelle des engagements.~~ Écartée : elle oublie exactement comme
  une mémoire oublie, et la double inscription — le problème que cette spec
  vise — reste invisible tant que la seconde n'a pas été recopiée.
- ~~Récupération automatique depuis myffbad.~~ Écartée par
  [[027__engagements-badnet]] : `/mes-inscriptions` reflète ce que la fédération
  enregistre, pas ce que j'ai engagé.
- **Récupération automatique depuis badnet, sous session.** Retenue, et portée
  par [[027__engagements-badnet]] : badnet est l'endroit où l'inscription se
  fait, donc celui où elle est complète.

~~À trancher une fois la faisabilité du scraping myffbad établie.~~ **Tranché** :
la sonde du 1er septembre 2026 a atteint `/mes-inscriptions`, 015 a cherché la
donnée à trois endroits, et 027 a retenu `badnet.fr/competitions`.

## Questions

- ~~Les inscriptions sont-elles visibles sur myffbad de façon exploitable, ou
  faut-il passer par une saisie manuelle ?~~ **Ni l'un ni l'autre : elles
  viennent de badnet**, sous session — voir 027.
- Faut-il gérer les inscriptions en attente / non confirmées ? **Reportée à
  027**, qui pose la même question sur `/competitions` : personne ne sait encore
  quels statuts badnet distingue, et inventer ici une échelle qui ne
  correspondrait à rien serait pire qu'une colonne absente.

## Notes

**Dépend de [[027__engagements-badnet]]**, qui acquiert les engagements et
dessine leur table. Cette spec les affiche, rien de plus.

Recoupe [[012__recherche-de-tournois]] : un tournoi trouvé par la veille doit
pouvoir devenir un engagement.

~~Bloquée par [[015__source-de-donnees]].~~ **Faite** : l'accès aux deux
sources est en place, sessions, plafond de requêtes et archivage des captures
compris.

~~Préalable : la table des engagements n'existe pas [...] c'est donc cette spec
qui la dessine.~~ **Inversé le 5 septembre 2026 :
[[027__engagements-badnet]] passe devant.**

Le raisonnement écrit ici la veille supposait que 002 démarrerait sur une saisie
manuelle, que 027 remplacerait ensuite. Construire une saisie pour la jeter est
du travail pour rien : 027 dessine la table des engagements et la remplit depuis
badnet, et **002 se contente d'afficher ce qui s'y trouve**.

Ce qui reste à cette spec est donc entièrement de la présentation : le tri par
date, le signalement des chevauchements, et la page. C'est peu, et c'est ce qui
la rend faisable d'un trait une fois 027 finie.

Elle partage toujours avec [[012__recherche-de-tournois]] la description d'un
tournoi — mais c'est 027 qui la paiera désormais.
