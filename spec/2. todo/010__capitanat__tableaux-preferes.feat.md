# Enregistrer les tableaux préférés des joueurs

| Champ   | Valeur                                                     |
|---------|------------------------------------------------------------|
| id      | 010                                                        |
| module  | capitanat                                                  |
| type    | feat                                                       |
| bloquée | ~~[[005__capitanat__liste-des-membres-de-l-equipe.feat]]~~ |

## Contexte

Chaque joueur a des préférences : certains ne veulent pas jouer le simple,
d'autres tiennent à un partenaire de double précis. Ces préférences sont
connues du capitaine mais nulle part écrites.

## Problème à résoudre

Les préférences reposent sur la mémoire du capitaine. Un changement de
capitaine, ou simplement un oubli, mène à des compositions mal reçues.

Résolu quand l'outil enregistre pour chaque joueur ses tableaux souhaités,
ses tableaux refusés et ses partenaires de double privilégiés, et les affiche
au moment de composer.

## Solutions envisagées

- Champs libres sur la fiche joueur. Souple, mais inexploitable automatiquement.
- Préférences structurées (tableau + niveau d'envie + partenaires). Exploitable
  par [[011__capitanat__composition-de-journee.feat]], plus de travail de
  modélisation.

Retenue : préférences structurées.

## Questions

- Une préférence est-elle un souhait ou une contrainte dure ?
- Le joueur peut-il éditer ses propres préférences ?

## Notes

Dépend de [[005__capitanat__liste-des-membres-de-l-equipe.feat]].

**Frontière avec [[030__capitanat__paires-et-preferences-du-capitaine.feat]].**
030 porte un marqueur que *le capitaine* pose sur une paire qu'il a assemblée,
ou sur un joueur pour un tableau donné. Cette spec-ci porte ce que *le joueur
déclare* de lui-même — ses tableaux souhaités, ses tableaux refusés, ses
partenaires privilégiés à lui. Elle ne perd donc rien au profit de 030 : ce sont
deux informations différentes, et 030 n'a pas attendu celle-ci parce qu'un
capitaine n'a besoin de personne pour savoir qui il veut aligner.

Les deux **peuvent se contredire**, et ce désaccord est lui-même une
information : un joueur qui se déclare à l'aise dans une paire que le capitaine
n'aligne jamais se voit en mettant les deux côte à côte. Elles s'affichent donc
l'une à côté de l'autre, jamais fusionnées en une préférence unique — la fusion
ferait disparaître précisément ce qu'on veut lire.
