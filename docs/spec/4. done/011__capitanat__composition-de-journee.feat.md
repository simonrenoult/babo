# Aider à la saisie des compositions de journée

| Champ       | Valeur                                                                                         |
|-------------|------------------------------------------------------------------------------------------------|
| id          | 011                                                                                            |
| module      | capitanat                                                                                      |
| type        | feat                                                                                           |
| bloquée par | —      |

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

- ~~Quel règlement fait foi (départemental, régional, national) — ils diffèrent.~~
  **Celui de l'ICD75 D3 Mixte**, réduit aux trois règles que le capitaine a
  données : voir Notes.
- ~~Les règles sont-elles figées dans le code ou configurables par saison ?~~
  **Figées dans le code** : trois règles, une saison. On les rendra
  configurables le jour où une deuxième division le demandera.
- ~~Faut-il exporter la composition dans un format acceptable par la FFBaD ?~~
  **La feuille de rencontre d'icbad elle-même**, complétée de la composition :
  c'est le document que le comité attend, pas un format à inventer.

## Notes

Le cœur de valeur du module. Dépend de
[[008__capitanat__disponibilites-interclubs.feat]],
[[010__capitanat__tableaux-preferes.feat]] et
[[028__capitanat__nom-et-classement-de-l-equipe.feat]] — les contraintes
réglementaires s'ordonnent par classement, et le sexe qu'elles supposent vient
du CSV de [[005__capitanat__liste-des-membres-de-l-equipe.feat]].

**Livrée le 30 septembre 2026**, onglet « Planification » du capitanat, une
page par journée. Assistant de saisie, comme retenu : le capitaine compose,
l'outil vérifie.

- Six matchs, neuf places : 2 SH, 1 SD, 1 DH, 1 DD, 1 DX, chaque place
  réservée à un sexe.
- Seul se sélectionne un joueur qui a répondu oui ou si besoin au sondage de
  la journée ([[008__capitanat__disponibilites-interclubs.feat]]).
- Deux matchs au plus par joueur sur la rencontre.
- Le SH1 n'a pas une moyenne de simple inférieure au SH2 ; un non-classé
  compte pour zéro. « Supérieure » a été lu « pas inférieure » : l'égalité
  passe.
- Une composition fautive n'est pas écrite ; une incomplète l'est — on
  planifie en plusieurs fois.
- La feuille de rencontre officielle d'icbad s'imprime pré-remplie de la
  composition enregistrée.

**N'a finalement pas attendu [[010__capitanat__tableaux-preferes.feat]]** :
les règles données ne font pas intervenir les préférences, et celles de
[[030__capitanat__paires-et-preferences-du-capitaine.feat]] couvrent déjà les
paires et les joueurs privilégiés. 010 reste ouverte, pour elle-même.
