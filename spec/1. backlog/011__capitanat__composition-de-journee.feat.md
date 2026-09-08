# Aider à la saisie des compositions de journée

| Champ   | Valeur                                                                                                                                                                                                             |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| id      | 011                                                                                                                                                                                                                |
| module  | capitanat                                                                                                                                                                                                          |
| type    | feat                                                                                                                                                                                                               |
| bloquée | [[008__capitanat__disponibilites-interclubs.feat]], [[010__capitanat__tableaux-preferes.feat]], ~~[[005__capitanat__liste-des-membres-de-l-equipe.feat]], [[028__capitanat__nom-et-classement-de-l-equipe.feat]]~~ |

## Contexte

Avant chaque journée d'interclub, le capitaine doit produire une composition
valide : un nombre fixe de tableaux à remplir, des contraintes réglementaires
d'ordre de classement, et des joueurs disponibles en nombre limité.

## Problème à résoudre

La composition se fait à la main, souvent la veille. Une erreur d'ordre de
classement entre deux paires de double coûte le match par pénalité, et rien ne
la signale avant la feuille de match.

Résolu quand l'outil permet de composer une journée à partir des joueurs
disponibles, vérifie les contraintes réglementaires, signale les compositions
invalides, et conserve la composition retenue.

## Solutions envisagées

- Assistant de saisie avec validation : le capitaine compose, l'outil vérifie.
  Garde la main au capitaine, périmètre maîtrisé.
- Proposition automatique de composition optimale. Séduisant, mais suppose une
  fonction d'objectif discutable et le règlement entièrement modélisé.

Retenue : assistant de saisie avec validation. L'automatisation viendra
ensuite si le besoin se confirme.

## Questions

- Quel règlement fait foi (départemental, régional, national) — ils diffèrent.
- Les règles sont-elles figées dans le code ou configurables par saison ?
- Faut-il exporter la composition dans un format acceptable par la FFBaD ?

## Notes

Le cœur de valeur du module. Dépend de
[[008__capitanat__disponibilites-interclubs.feat]],
[[010__capitanat__tableaux-preferes.feat]] et
[[028__capitanat__nom-et-classement-de-l-equipe.feat]] — les contraintes
réglementaires s'ordonnent par classement, et le sexe qu'elles supposent vient
du CSV de [[005__capitanat__liste-des-membres-de-l-equipe.feat]].
