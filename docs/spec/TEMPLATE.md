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


## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.
