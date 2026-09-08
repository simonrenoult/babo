# Journaliser chaque action

| Champ   | Valeur |
|---------|--------|
| id      | 031    |
| module  | socle  |
| type    | tech   |
| bloquée | —      |

> Ébauche : le problème est posé, les pistes ne sont pas tranchées.

## Contexte

[[019__socle__robustesse-du-scraping.tech]] a donné aux scrapings ce qu'il
fallait pour les surveiller : un rapport par exécution, une alerte à l'entrée en
panne, un battement hebdomadaire. Cela couvre les tâches du planificateur, et
rien d'autre.

Le reste du programme parle par dix-huit `console.log` et `console.error`
posés au fil des specs, préfixés `[socle]` : migrations appliquées, courrier
non configuré, port d'écoute, signal d'arrêt, erreur non rattrapée, échec de
réveil, échec d'alerte. La page d'erreur promet déjà au lecteur que « le
détail est dans le journal du service » — un journal qui n'existe comme notion
nulle part dans le code.

## Problème à résoudre

Trois familles d'événements ne laissent aucune trace :

- **lire une ressource** — page servie, requête sortante vers myffbad ou
  badnet, lecture en base ;
- **action de l'utilisateur** — connexion, saisie d'une paire, marquage d'un
  favori, changement de cadence, collage d'un cookie, code 2FA recopié ;
- **action du système** — réveil d'une tâche, envoi de mail, migration,
  arrêt.

Entre deux battements hebdomadaires, quand une page affiche une donnée fausse
ou qu'une session meurt sans raison visible, il ne reste que la table des
rapports — une ligne par passe — et l'état final de la base. On ne peut pas
reconstituer l'enchaînement. Et une ligne `console.log` écrite à la main ne se
filtre ni ne se recoud : elle se lit, une par une, à l'œil.

Résolu quand chaque événement des trois familles laisse une ligne datée,
attribuée à une famille et à un module ; quand aucun secret n'y figure ; quand
on retrouve toutes les lignes d'une même action ; et quand plus aucun appel
direct à `console` ne subsiste hors du point de composition.

## Solutions envisagées

- **Un port `Journal` dans `socle/core`, un adaptateur qui écrit.** C'est la
  forme imposée par [[022__socle__decoupage-du-code.tech]], et elle laisse
  changer de destination — sortie standard, fichier, base — sans toucher un seul
  appelant.
- **Des décorateurs plutôt que des appels dispersés.** C'est déjà le choix de
  [[015__socle__source-de-donnees.tech]] (`enArchivant`, `sousPlafond`) et de
  [[019__socle__robustesse-du-scraping.tech]] (`enAlertant`), pour la même
  raison : une action qu'on peut oublier de journaliser finira par être oubliée.
  Un intergiciel Express couvre toute page servie, un décorateur du client
  d'acquisition toute requête sortante, un décorateur de l'ordonnanceur tout
  réveil. Restent à écrire à la main les actions de l'utilisateur, qui n'ont pas
  de forme commune.
- **Zéro dépendance nouvelle.** Le projet en a quatre ; une ligne `clé=valeur`
  ou un objet JSON par événement se produisent sans bibliothèque.
- **Deux niveaux, pas cinq** — ce qui s'est passé, ce qui a mal tourné.
- **Aucun secret dans le journal** : mot de passe, cookie, jeton, code de
  [[027__socle__engagements-badnet.tech]], adresse mail. À rendre structurel
  plutôt que moral, comme les interdits de 022.

## Questions

- Sortie standard seule, ou aussi en base ? La base rendrait le journal
  consultable depuis `/sources` à côté des rapports de 019 — mais journaliser
  les lectures en base fait écrire la base à chaque lecture.
- Rétention ? 017 et 019 ont choisi de ne rien purger ; un journal de lectures
  ne pèse pas comme une ligne de rapport.
- Faut-il un identifiant par requête pour recoudre les lignes d'une même
  action ?
- Le journal recouvre-t-il `rapport_execution` de 019, ou vit-il à côté ? Deux
  récits de la même passe est un de trop.
- Niveau réglable depuis `/sources`, comme la cadence de
  [[018__socle__ordonnancement.tech]], ou par l'environnement seul ?
- Que devient `npm run capture` ? Il parle à un humain sur la sortie standard
  et n'est pas un service : ses `console.log` ne sont pas des lignes de
  journal.

## Notes

Prolonge [[019__socle__robustesse-du-scraping.tech]], qui rend les scrapings
observables et s'arrête là. Aucune dépendance bloquante.
