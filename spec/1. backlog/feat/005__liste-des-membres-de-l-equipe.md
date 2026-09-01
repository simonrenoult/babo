# Lister les membres de mon équipe

| Champ  | Valeur     |
|--------|------------|
| id     | 005        |
| module | capitanat  |
| type   | feat       |

## Contexte

En tant que capitaine, je dois joindre mes joueurs, vérifier qu'ils sont
licenciés et connaître leur classement pour composer les équipes. Ces
informations sont dispersées entre myffbad, un fichier du club et mes contacts.

## Problème à résoudre

Je n'ai pas de fiche d'équipe unique et à jour. Reconstituer les coordonnées et
les classements avant chaque journée d'interclub prend du temps et laisse
passer des erreurs (licence expirée, classement périmé).

Résolu quand l'outil affiche la liste des membres de l'équipe avec, pour
chacun : sexe, numéro de licence, classement par tableau, mail, téléphone et
lien vers la fiche myffbad — et signale les licences non valides.

## Solutions envisagées

- Fichier de configuration listant les licences, le reste étant complété
  automatiquement depuis la source FFBaD. Peu de saisie, données à jour.
- Saisie complète manuelle. Plus lourd, mais sans dépendance.

Retenue : liste de licences + enrichissement automatique.

## Questions

- Une seule équipe ou plusieurs (le club peut en aligner plusieurs) ?
- Coordonnées personnelles : où sont-elles stockées, et est-ce acceptable ?

## Notes

Fiche socle de tout le module `capitanat` : [[006__performance-individuelle]],
[[008__disponibilites-interclubs]] et [[011__composition-de-journee]] s'y
rattachent. Données personnelles → voir RGPD avant diffusion.

Bloquée par [[015__source-de-donnees]].
