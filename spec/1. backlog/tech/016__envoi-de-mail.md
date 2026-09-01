# Envoyer des mails depuis l'application

| Champ  | Valeur |
|--------|--------|
| id     | 016    |
| module | socle  |
| type   | tech   |

## Contexte

Plusieurs specs ont besoin d'envoyer un mail : l'alerte de nouveau tournoi
[[013__alerte-nouveau-tournoi]], les rappels d'ouverture
[[014__rappel-ouverture-tournoi]], la sollicitation des joueurs
[[008__disponibilites-interclubs]], et le socle lui-même —
[[019__robustesse-du-scraping]] signale par mail les échecs de scraping et
émet un battement hebdomadaire.

Aujourd'hui cette brique est décrite dans 013, une spec de feature dont 014 et
008 se déclarent dépendantes.

## Problème à résoudre

L'envoi de mail est une dépendance transverse logée dans une feature. Comme 013
dépend de [[012__recherche-de-tournois]], qui dépend de
[[015__source-de-donnees]], qui a lui-même besoin d'envoyer des mails, le
backlog se referme sur lui-même : la brique se retrouve en aval des specs
qu'elle alimente, et rien ne peut être traité en premier.

Résolu quand un module unique porte l'envoi de mail, que 013, 014, 008 et 015
l'utilisent sans rien connaître du transport, et qu'un échec d'envoi est
observable autrement que par un mail.

## Solutions envisagées

- SMTP d'un fournisseur personnel. Pas de dépendance à un tiers, mais
  délivrabilité incertaine depuis un serveur perso : les mails partis d'une IP
  résidentielle finissent souvent en indésirables, ce qui est un mode de panne
  silencieux de plus.
- Service tiers avec API. Délivrabilité correcte et échecs remontés
  explicitement, au prix d'un compte externe.

À trancher — c'est la seule vraie question de cette spec, et le critère est la
délivrabilité, pas la simplicité de mise en œuvre : une alerte de tournoi
classée en spam équivaut à pas d'alerte.

Contraintes :

- Le module ignore le contenu métier : il envoie un message, il ne décide pas
  quand ni pourquoi.
- Un échec d'envoi ne peut pas être signalé par mail. Il est consigné dans le
  rapport d'exécution et visible dans l'interface.
- En développement et en test, les mails sont écrits en base plutôt qu'envoyés.

## Questions

- SMTP personnel ou service tiers ?
- Un envoi qui échoue est-il réessayé, et combien de fois avant abandon ?
- Une seule adresse de destination (la mienne), ou faut-il déjà prévoir l'envoi
  aux coéquipiers pour [[008__disponibilites-interclubs]] ?

## Notes

Utilisé par [[013__alerte-nouveau-tournoi]],
[[014__rappel-ouverture-tournoi]], [[008__disponibilites-interclubs]] et
[[019__robustesse-du-scraping]].

Le battement hebdomadaire de [[019__robustesse-du-scraping]] est le seul moyen
de s'apercevoir que cette brique est morte : sans mail, le silence est
indiscernable du fonctionnement normal.

À traiter avec ou avant [[019__robustesse-du-scraping]], qui en est le premier
appelant.
