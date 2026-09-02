# Collecter les disponibilités aux interclubs

| Champ  | Valeur     |
|--------|------------|
| id     | 008        |
| module | capitanat  |
| type   | feat       |

## Contexte

Avant chaque journée d'interclub, le capitaine demande aux joueurs s'ils sont
disponibles. Cela se passe aujourd'hui par messages, et les réponses se perdent
dans le fil.

## Problème à résoudre

Recueillir et consolider les disponibilités est manuel et peu fiable : il faut
relancer les silencieux, et l'état des réponses n'est jamais consolidé au même
endroit.

Résolu quand l'outil affiche, pour chaque journée à venir, l'état des réponses
de chaque joueur (disponible / indisponible / sans réponse) et permet de
relancer ceux qui n'ont pas répondu.

## Solutions envisagées

- Saisie par le capitaine, la collecte se faisant via un questionnaire externe
  (Doodle, Framadate) dont le lien est diffusé aux joueurs. Retenue.
- Sollicitation par mail avec réponse par lien dans l'outil. Écartée : elle
  suppose des pages accessibles sans authentification, alors que Bado est un
  service personnel protégé par identifiant et mot de passe
  ([[021__authentification]]). C'est la seule
  spec qui percerait cette clôture, et elle ferait en plus transiter les
  réponses de tiers par un serveur exposé.

Le questionnaire externe reste hors de l'outil : Bado n'en lit pas les
réponses, le capitaine les reporte.

## Questions

- Faut-il gérer une disponibilité partielle (« oui si je joue en double ») ?
- ~~« Relancer les silencieux » se fait-il par un mail depuis l'outil
  ([[016__envoi-de-mail]]) ?~~ **Non : à la main du capitaine.** L'outil n'a
  pas les mails — voir Notes.
- Le lien du questionnaire est-il stocké par journée d'interclub ?

## Notes

**Bado n'a pas les mails des coéquipiers.**
[[005__liste-des-membres-de-l-equipe]] a retiré le mail de la fiche d'équipe :
myffbad ne publie pas les coordonnées de ses licenciés, et une colonne sans
usage ne se stocke pas. « Relancer les silencieux » ne peut donc pas partir de
l'outil — c'est un geste manuel, par téléphone ou par le fil du club, et
l'outil se borne à afficher qui n'a pas répondu. Rouvrir la question suppose de
remettre une colonne mail dans l'import.

Alimente [[011__composition-de-journee]] et
[[009__taux-de-sollicitation]]. Réutilise l'envoi de mails de
[[016__envoi-de-mail]].
