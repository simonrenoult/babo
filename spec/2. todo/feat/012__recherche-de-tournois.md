# Rechercher des tournois selon des critères

| Champ  | Valeur  |
|--------|---------|
| id     | 012     |
| module | veille  |
| type   | feat    |

## Contexte

Les tournois sont publiés au fil de l'eau sur badnet. Trouver ceux qui me
concernent suppose de parcourir des listes non filtrées sur ce qui compte
vraiment pour moi.

## Problème à résoudre

Chercher un tournoi est fastidieux : je ne peux pas filtrer d'un coup sur la
distance, la date, les tableaux proposés et mon classement d'admission. Je
passe à côté de tournois qui m'auraient convenu.

Résolu quand l'outil retourne les tournois à venir filtrés sur : périmètre
géographique (distance depuis une adresse), fenêtre de dates, tableaux
proposés, série ouverte à mon classement, et date limite d'inscription.

## Solutions envisagées

- Interroger badnet à chaque recherche. Toujours à jour, mais lent et fragile.
- Indexer quotidiennement les tournois publiés, puis chercher en local. Rapide,
  et surtout indispensable pour détecter les nouveautés.

Retenue : indexation quotidienne depuis badnet, conformément à
[[015__source-de-donnees]] — [[013__alerte-nouveau-tournoi]] en dépend.

## Questions

- La distance se calcule-t-elle à vol d'oiseau ou en temps de trajet ?
- Un tournoi disparu de badnet reste-t-il dans l'index, ou est-il retiré ?

## Notes

Socle du module `veille`. Alimente [[002__prochains-tournois]] une fois
l'inscription faite.

Bloquée par [[015__source-de-donnees]].
