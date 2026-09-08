# Calculer mon ratio victoire/défaite par tableau

| Champ  | Valeur   |
|--------|----------|
| id     | 004      |
| module | mon-profil |
| type   | feat     |

## Contexte

Le classement seul ne dit pas dans quel tableau je suis réellement performant.
Un joueur peut être bien classé en double et en difficulté en simple.

## Problème à résoudre

Je ne sais pas objectivement quel est mon tableau le plus rentable, ni si ma
forme évolue. Le calcul à la main sur l'historique n'est pas tenable.

Résolu quand l'outil affiche, par tableau (SH/SD, DH/DD, MX) : nombre de
matchs, victoires, défaites, ratio, sur une période choisie — et distingue
tournoi et interclub.

## Solutions envisagées

- Calcul à la volée sur l'historique. Simple, suffisant au volume attendu.
- Agrégats pré-calculés. Inutile tant que le volume reste faible.

Retenue : calcul à la volée.

## Questions

- Un ratio par partenaire en double a-t-il un intérêt ici, ou est-ce une spec
  à part ?
- Que faire des forfaits et des WO — comptés, ignorés, comptés à part ?

## Notes

Dépend de [[003__mon-profil__historique-de-matchs.feat]]. La même mécanique sert
à [[007__capitanat__ratio-victoire-defaite-equipe.feat]].
