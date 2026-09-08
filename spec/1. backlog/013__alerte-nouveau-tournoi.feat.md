# Alerter par mail quand un nouveau tournoi correspond

| Champ  | Valeur  |
|--------|---------|
| id     | 013     |
| module | veille  |
| type   | feat    |

## Contexte

Les tournois intéressants se remplissent vite, parfois en quelques jours après
publication. Il faut donc être prévenu tôt, pas au moment où on pense à aller
regarder.

## Problème à résoudre

Rien ne me prévient qu'un tournoi correspondant à mes critères vient d'être
publié. Je dois penser à relancer la recherche, et je découvre souvent le
tournoi une fois complet.

Résolu quand l'outil envoie un mail dès qu'un tournoi non encore vu correspond
à mes critères, avec les informations utiles (dates, lieu, tableaux, date
limite, lien) et sans jamais alerter deux fois pour le même tournoi.

## Solutions envisagées

- Un mail par tournoi trouvé. Réactif, risque de spam en période de
  publication.
- Un digest quotidien ou hebdomadaire. Moins intrusif, mais fait perdre les
  heures qui comptent sur un tournoi qui se remplit.

À trancher : probablement mail immédiat, avec un regroupement si plusieurs
tournois sortent dans la même passe.

Plafond et rattrapage. À la première indexation, aucun tournoi n'a encore été
vu : sans règle, le catalogue entier partirait en une fois. Deux régimes
distincts, donc :

- **Un tournoi nouvellement publié alerte immédiatement, hors plafond.** C'est
  la raison d'être de cette spec : ces tournois-là se remplissent en quelques
  jours.
- **Le reste forme une file de rattrapage**, vidée à raison de dix par passe,
  pris par date de tournoi la plus proche, en signalant qu'il en existe
  davantage et en invitant à affiner les critères. Les tournois écartés ne sont
  pas marqués comme vus : ils repassent le lendemain sous la même règle.

Sans cette séparation, un catalogue initial de deux cents tournois mettrait
vingt jours à se vider, et une publication du jour attendrait derrière deux
cents tournois plus proches en date — dont beaucoup déjà complets.

Même mécanique de rattrapage à chaque élargissement des critères, qui rouvre le
même trou.

L'envoi lui-même relève de [[016__envoi-de-mail]].

## Questions

- Que se passe-t-il si un tournoi déjà notifié change de date ou de tableaux ?
- Comment reconnaît-on un tournoi « nouvellement publié » : badnet expose-t-il
  une date de publication, ou faut-il se fier à sa première apparition dans
  l'index ?

## Notes

Dépend de [[012__recherche-de-tournois]] pour la donnée et de
[[016__envoi-de-mail]] pour l'envoi. Les tournois déjà notifiés sont conservés
en base ([[017__persistance-sqlite]]) : c'est ce qui garantit qu'on n'alerte
jamais deux fois pour le même.
