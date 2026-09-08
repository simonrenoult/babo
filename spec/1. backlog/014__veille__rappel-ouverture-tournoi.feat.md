# Rappeler par mail l'ouverture des inscriptions

| Champ  | Valeur  |
|--------|---------|
| id     | 014     |
| module | veille  |
| type   | feat    |

## Contexte

Un tournoi est souvent publié bien avant l'ouverture de ses inscriptions. Pour
les tournois demandés, les places partent dans les heures qui suivent
l'ouverture.

## Problème à résoudre

Je repère un tournoi qui m'intéresse, puis j'oublie la date d'ouverture des
inscriptions et je m'y prends trop tard.

Résolu quand je peux marquer un tournoi comme suivi, et recevoir un mail de
rappel avant l'ouverture de ses inscriptions, ainsi qu'avant sa date limite
d'inscription si je ne me suis pas inscrit.

## Solutions envisagées

- Rappel unique la veille de l'ouverture. Simple, mais tout repose sur un seul
  mail.
- Rappels échelonnés et configurables (J-7, J-1, date limite). Plus utile,
  demande une planification par tournoi.

Retenue : rappels échelonnés, avec des délais par défaut modifiables.

## Questions

- La date d'ouverture des inscriptions est-elle publiée de façon fiable ?
- Comment l'outil sait-il que je me suis inscrit, pour arrêter les rappels ?

## Notes

Dépend de [[012__veille__recherche-de-tournois.feat]] pour la donnée, de
[[016__socle__envoi-de-mail.tech]] pour l'envoi et de
[[018__socle__ordonnancement.tech]] pour les échéances par tournoi, qui doivent
survivre à un redémarrage.
