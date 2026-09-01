# Enregistrer les tableaux préférés des joueurs

| Champ  | Valeur     |
|--------|------------|
| id     | 010        |
| module | capitanat  |
| type   | feat       |

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

- Champs libres sur la fiche joueur. Souple, mais inexploitable
  automatiquement.
- Préférences structurées (tableau + niveau d'envie + partenaires). Exploitable
  par [[011__composition-de-journee]], plus de travail de modélisation.

Retenue : préférences structurées.

## Questions

- Une préférence est-elle un souhait ou une contrainte dure ?
- Le joueur peut-il éditer ses propres préférences ?

## Notes

Dépend de [[005__liste-des-membres-de-l-equipe]].
