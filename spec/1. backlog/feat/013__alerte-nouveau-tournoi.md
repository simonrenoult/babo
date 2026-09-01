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

## Questions

- Comment envoyer les mails (SMTP perso, service tiers) ?
- Que se passe-t-il si un tournoi déjà notifié change de date ou de tableaux ?

## Notes

Dépend de [[012__recherche-de-tournois]]. Partage la brique d'envoi de mails
avec [[008__disponibilites-interclubs]] et [[014__rappel-ouverture-tournoi]].
