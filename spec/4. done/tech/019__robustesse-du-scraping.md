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

**Amendé : « toute panne » est devenu « toute *entrée* en panne ».** Un parseur
aveugle le reste jusqu'à correction, et un mail quotidien identique se filtre en
trois jours — une alerte qu'on filtre est pire qu'une alerte absente. Le trou
que cela ouvre, celui de la panne qu'on oublie, est fermé par le battement
hebdomadaire, qui rappelle ce qui est encore cassé. La sortie de panne est
annoncée aussi, pour une raison symétrique : sans elle, on ne saurait jamais si
le silence veut dire réparé ou toujours cassé.

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

## Ce qui a été fait

**Une bonne moitié existait déjà**, posée au fil de 015, 017 et 018 :
l'archivage des réponses brutes avant analyse, la table `rapport_execution` avec
son issue à trois valeurs, `issueDuVolume`, et l'ancienneté par source sur
`/sources`. Cette spec livre le reste.

**L'alerte est un décorateur du dépôt de rapports**, pas un appel dans chaque
passe : `enAlertant` enveloppe `DepotRapports` et compare l'issue à la
précédente. C'est le choix déjà fait pour les requêtes sortantes de 015 —
`enArchivant`, `sousPlafond` —, et pour la même raison : une passe qui pourrait
oublier d'alerter alerterait moins bien qu'une passe qui ne le peut pas. Les
passes quotidiennes de 015 s'y brancheront sans une ligne de plus.

**Le courrier est exclu de l'alerte**, et ce n'est pas un détail : 016 écrit
qu'un échec d'envoi ne peut pas être signalé par mail, et sans cette exclusion
un vidage en échec déposerait un message, dont le dépôt consignerait un rapport,
qui déposerait un message. La boucle serait infinie. L'ordre de construction
dans `main.ts` la rend d'ailleurs impossible à écrire par accident : le
décorateur a besoin du courrier, qui existe donc avant lui et reçoit le dépôt
nu.

**Le dépôt reste synchrone**, et l'alerte est déposée sans être attendue. C'est
ce qui permet aux passes de consigner sans devenir asynchrones. Rien n'est
perdu pour autant : l'écriture en base est la première instruction de `deposer`,
donc le message existe avant que la promesse ne suspende.

**Le battement est le lundi à 8 h**, quand on lit ses mails, et non la nuit où
il se noierait dans le reste. Grâce nulle (018). Il nomme les tâches qui n'ont
jamais tourné — une tâche absente du rapport est une tâche dont on ne saura
jamais qu'elle s'est tue — et distingue la **dernière donnée** du dernier
réveil : une passe qui échoue depuis trois semaines a tourné hier et ne rapporte
pourtant rien de neuf. Son issue est `succes` même quand il n'annonce que des
pannes : un `echec` ici enverrait une alerte pour dire qu'on a bien alerté.

**La péremption se juge sur la cadence de la tâche qui alimente la page**, lue
dans les réglages de 018. Aucun seuil nouveau à inventer, et une cadence
modifiée depuis `/sources` déplace le seuil sans redémarrage. La mention ne
s'affiche que lorsque la donnée est effectivement en retard : une mention
permanente « donnée fraîche » deviendrait un élément de décor et ne se
remarquerait plus le jour où elle change. Et « jamais relevée » n'est pas
« périmée » — les pages disent déjà la première en toutes lettres, et confondre
les deux ferait passer une mise en service pour une panne.

**Le rejeu est un script, pas un écran** : `npm run capture` liste les dernières
captures par source, `npm run capture -- <id>` en écrit une à côté des tests.
Corriger un parseur est un geste de développement ; la capture doit atterrir
dans un fichier, ce qu'un écran web ne fait pas bien. Le script refuse
d'écraser un fichier existant — les fixtures de ce dossier sont choisies à la
main et servent aux tests. C'est la première utilisation de `parIdentifiant`,
déclaré depuis 017 et jamais appelé.

## Questions

- ~~Le rapport d'exécution est-il consultable dans l'interface, ou seulement
  reçu par mail ?~~ **Dans l'interface** : une section « Exécutions » sur
  `/sources`, les cinquante dernières. Par mail seul on ne voit que les échecs,
  jamais la semaine qui s'est bien passée — et c'est cette semaine-là qui
  distingue « rien ne s'est cassé » de « plus rien ne tourne ».
- ~~Combien de temps conserve-t-on les rapports ?~~ **Aucune purge.** Une ligne
  pèse quelques dizaines d'octets, et le battement annonce la taille de la base :
  si la croissance devient un problème, la mesure le dira avant que l'estimation
  ne le devine. C'est le choix déjà fait pour les captures (017) et pour la
  boîte d'envoi (016).
- ~~Une panne persistante doit-elle continuer à envoyer un mail chaque jour, ou
  se taire après le premier ?~~ **Un seul mail, à l'entrée en panne**, et le
  battement hebdomadaire rappelle ce qui traîne. Voir l'amendement ci-dessus.

## Notes

Dépend de [[016__envoi-de-mail]], [[017__persistance-sqlite]] et
[[018__ordonnancement]]. Prolonge [[015__source-de-donnees]], qui établit
l'accès ; celui-ci n'a pas à porter en plus l'exploitation quotidienne.

L'archivage des captures a une valeur avant même la mise en production : il
rend la sonde de 015 rejouable, donc il est utile dès la première requête.
