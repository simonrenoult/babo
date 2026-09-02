# Rendre les scrapings observables et rejouables

| Champ  | Valeur |
|--------|--------|
| id     | 019    |
| module | socle  |
| type   | tech   |

## Contexte

[[015__source-de-donnees]] établit l'accès à myffbad et à badnet. Une fois cet
accès en place, deux scrapings tournent seuls chaque jour
([[018__ordonnancement]]) sans que personne ne les regarde, et alimentent
presque tout le backlog.

## Problème à résoudre

Le mode de panne d'un scraper n'est pas l'exception, c'est le succès vide : la
page répond, le parseur s'exécute sans rien lever, mais une classe CSS a changé
et il n'extrait plus rien. Rien ne casse visiblement, aucun mail ne part, et
l'application sert indéfiniment une donnée figée. Une exception se voit ; un
parseur devenu aveugle ne se voit pas.

Deux manques s'ajoutent : rien ne dit ce que l'interface affiche quand la
donnée n'a pas pu être rafraîchie, et corriger un parseur suppose aujourd'hui
de refaire une requête réelle sur un compte dont le bannissement est un risque
assumé.

Résolu quand toute exécution laisse un rapport, quand toute panne — exception
comme extraction vide — déclenche un mail, quand l'absence de panne est
elle-même signalée périodiquement, quand l'interface affiche l'ancienneté de
chaque source, et quand un parseur se corrige et se teste sans requête réseau.

## Solutions envisagées

- **Archivage des réponses brutes.** Chaque réponse HTML est écrite en base
  ([[017__persistance-sqlite]]) avant analyse, sans limite de durée. Un bug de
  parseur se corrige en rejouant les captures, sans requête supplémentaire, et
  ces mêmes captures servent de fixtures : la testabilité hors ligne devient un
  effet de bord de l'archivage, pas un chantier séparé.
- **Détection de panne par le volume extrait.** Une exécution qui n'extrait
  rien alors que la précédente extrayait quelque chose est un échec, même sans
  erreur levée. Règle volontairement binaire : un seuil en pourcentage
  produirait surtout de fausses alertes, les volumes variant légitimement
  beaucoup — matchs après un week-end de compétition, tournois en début de
  saison.

  La règle porte sur le volume **extrait de la page**, jamais sur le nombre de
  nouveautés : une passe badnet qui ne trouve aucun tournoi inédit est
  normale, une passe qui n'extrait aucun tournoi du tout est une panne.
- **Rapport d'exécution** à chaque passage, conservé en base, et mail via
  [[016__envoi-de-mail]] en cas d'échec. L'envoi de ce mail ne dépend d'aucun
  scraper.
- **Battement hebdomadaire**, à jour et heure fixes pour que son absence se
  remarque : nombre d'exécutions, volumes extraits, date de la dernière donnée
  par source, taille de la base. Sans lui, l'arrêt complet du planificateur est
  indiscernable d'une semaine sans incident.
- **Donnée toujours servie, même périmée.** L'interface affiche le dernier
  relevé disponible et son ancienneté, source par source — jamais une
  ancienneté globale, les scrapings tombant indépendamment.

## Questions

- Le rapport d'exécution est-il consultable dans l'interface, ou seulement reçu
  par mail ? Par mail seul, on ne voit que les échecs et jamais l'historique.
- Combien de temps conserve-t-on les rapports ?
- Une panne persistante doit-elle continuer à envoyer un mail chaque jour, ou
  se taire après le premier ?

## Notes

Dépend de [[016__envoi-de-mail]], [[017__persistance-sqlite]] et
[[018__ordonnancement]]. Prolonge [[015__source-de-donnees]], qui établit
l'accès ; celui-ci n'a pas à porter en plus l'exploitation quotidienne.

L'archivage des captures a une valeur avant même la mise en production : il
rend la sonde de 015 rejouable, donc il est utile dès la première requête.
