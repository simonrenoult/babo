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
[[015__socle__source-de-donnees.tech]] —
[[013__veille__alerte-nouveau-tournoi.feat]] en dépend.

## Questions

- La distance se calcule-t-elle à vol d'oiseau ou en temps de trajet ?
- Un tournoi disparu de badnet reste-t-il dans l'index, ou est-il retiré ?

## Notes

Socle du module `veille`. Alimente [[002__mon-profil__prochains-tournois.feat]]
une fois l'inscription faite.

~~Bloquée par [[015__socle__source-de-donnees.tech]].~~ **Faite**, et mieux que
prévu : la recherche badnet est **publique et anonyme** — un POST sur
`/index.php`, sans cookie, dont la réponse embarque la liste en JSON dans
`div.b-markers`. C'est la seule requête du projet qui ne dépende d'aucune
session, et elle ne doit jamais passer sous session, sous peine de mettre la
veille quotidienne sous le même risque de bannissement que le reste.

**Préalable : la table des tournois n'existe pas.**
[[017__socle__persistance-sqlite.tech]] a délibérément laissé ce schéma à
dessiner, et 015 a fixé l'ordre — la sonde d'abord, le schéma ensuite. La sonde
a livré : `badnet-recherche.html` est dans le dépôt, à côté des tests.

Cette spec dessine donc l'index des tournois. Elle partage avec
[[002__mon-profil__prochains-tournois.feat]] la description d'un tournoi : la
première des deux traitée la paiera pour l'autre.
