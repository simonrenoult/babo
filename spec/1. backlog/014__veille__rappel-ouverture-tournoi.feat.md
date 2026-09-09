# Rappeler par mail l'ouverture des inscriptions

| Champ       | Valeur                                                                                                                                                                    |
|-------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| id          | 014                                                                                                                                                                       |
| module      | veille                                                                                                                                                                    |
| type        | feat                                                                                                                                                                      |
| bloquée par | ~~[[012__veille__recherche-de-tournois.feat]], [[036__socle__fiche-publique-sans-gymnase.fix]], [[016__socle__envoi-de-mail.tech]], [[018__socle__ordonnancement.tech]]~~ |

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

- ~~La date d'ouverture des inscriptions est-elle publiée de façon fiable ?~~
  **Oui, tranché le 8 septembre 2026.** Elle n'est ni dans la recherche ni dans
  l'onglet « Présentation », mais sur l'**enveloppe** de la fiche publique —
  celle que [[036__socle__fiche-publique-sans-gymnase.fix]] met en service :
  `div.limit > p > span` porte « Ouverture des inscriptions 01/09/2026 08:00 »
  et « Fermeture 01/11/2026 23:59 », **à l'heure près**. C'est ce qui rend cette
  spec réalisable : « les places partent dans les heures qui suivent
  l'ouverture » ne se planifie pas sur une date sans heure.
- Comment l'outil sait-il que je me suis inscrit, pour arrêter les rappels ?
  Piste : le rapprochement avec les engagements de
  [[027__socle__engagements-badnet.tech]], qui portent le même identifiant
  d'événement que l'index de 012.
- Un tournoi suivi dont la veille qui me l'a fait connaître se resserre garde-t-il
  ses rappels ? Oui : 012 sépare l'appartenance à une veille — qui se termine —
  du tournoi lui-même, qui reste. C'est nommément pour cette spec que la
  distinction a été faite.

## Notes

Dépend de [[012__veille__recherche-de-tournois.feat]] pour la donnée, de
[[016__socle__envoi-de-mail.tech]] pour l'envoi et de
[[018__socle__ordonnancement.tech]] pour les échéances par tournoi, qui doivent
survivre à un redémarrage.
