# Titre

> Copier ce fichier sous le nom `id__module__mon-titre.<type>.md`, directement
> dans le dossier d'état — ex.
> `spec/1. backlog/042__veille__import-csv.feat.md`.
> La spec se déplace de dossier d'état en dossier d'état, en gardant son nom :
> seul l'état est une arborescence, parce que seul l'état change. Module et type
> tiennent dans le nom, pour qu'un état se lise d'un coup d'œil.

| Champ       | Valeur                                      |
|-------------|---------------------------------------------|
| id          | `000` — `999`, unique, sur 3 chiffres       |
| module      | nom du module concerné                      |
| type        | voir ci-dessous                             |
| bloquée par | les specs à finir d'abord, ou `—` si aucune |

Les specs bloquantes se listent par leur renvoi complet, séparées par une
virgule — ex. `[[015__socle__source-de-donnees.tech]],
[[017__socle__persistance-sqlite.tech]]`. Une seule raison de figurer là :
sans elle, celle-ci ne peut pas commencer. Une spec qu'on préférerait faire
avant n'est pas bloquante — c'est un ordre, et l'ordre se lit dans le backlog.

**Le champ ne contient que du vivant.** Une spec qui passe en `4. done`
disparaît du champ de toutes celles qu'elle bloquait ; quand il ne reste rien,
le champ vaut `—`. Il répond à une seule question, « puis-je ouvrir cette
spec ? », et tout ce qui n'y répond pas la brouille — un renvoi barré s'est déjà
fait lire comme un blocage vivant. L'histoire du blocage, elle, se raconte dans
les `## Notes`, où elle a la place de dire aussi pourquoi.

Types : `feat` (nouvelle capacité), `fix` (correctif), `refactor` (même
comportement, meilleure forme), `tech` (chantier de socle : choix
d'architecture, intégration d'une source, outillage — pas de valeur
utilisateur directe, mais débloque d'autres specs), `chore`, `docs`, `test`.

## Contexte

D'où vient le besoin ? Ce qui existe aujourd'hui, ce qui a changé, qui est
concerné. Factuel : pas encore de solution ici.

## Problème à résoudre

Une formulation précise et vérifiable du problème. Décrire le comportement
actuel, le comportement attendu, et à quoi on reconnaîtra que c'est réglé.
Éviter le flou (« c'est lent », « c'est compliqué ») : donner des cas concrets,
des chiffres, des exemples.

## Solutions envisagées

Les pistes considérées, avec pour chacune ses avantages et ses limites.
Indiquer celle qui est retenue et pourquoi.

## Questions

Ce qui reste ouvert et bloque une décision. Une question par ligne.

## Notes

Liens, références, décisions annexes, historique.

---

**Une spec ne doit pas dépasser une page.** Si elle déborde, c'est que le
périmètre est trop large : la découper en plusieurs specs.
