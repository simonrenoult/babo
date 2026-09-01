# Lister les membres de mon équipe

| Champ  | Valeur     |
|--------|------------|
| id     | 005        |
| module | capitanat  |
| type   | feat       |

## Contexte

En tant que capitaine, je dois joindre mes joueurs et connaître leur classement
pour composer les équipes. Ces informations sont dispersées entre myffbad, un
fichier du club et mes contacts.

## Problème à résoudre

Je n'ai pas de fiche d'équipe unique et à jour. Reconstituer les coordonnées et
les classements avant chaque journée d'interclub prend du temps et laisse
passer des erreurs, notamment des classements périmés.

Résolu quand l'outil affiche la liste des membres de l'équipe avec, pour
chacun : sexe, numéro de licence, classement par tableau, mail, téléphone et
lien vers la fiche myffbad.

## Solutions envisagées

- Fichier de configuration portant les données stables — licence, mail,
  téléphone, sexe — complété automatiquement par le classement scrapé depuis
  myffbad. Retenue : la saisie ne se fait qu'une fois par saison, et le seul
  champ qui se périme est celui qui est enrichi.
- Saisie complète manuelle. Écartée : les classements évoluent tous les mois.

## Questions

- Une seule équipe ou plusieurs (le club peut en aligner plusieurs) ?
- Que faire d'un coéquipier dont la fiche myffbad est introuvable : ligne
  affichée sans classement, ou signalée en erreur ?

## Notes

Fiche socle de tout le module `capitanat` : [[006__performance-individuelle]],
[[008__disponibilites-interclubs]] et [[011__composition-de-journee]] s'y
rattachent.

La vérification de validité des licences est hors périmètre.

Les coordonnées des coéquipiers vivent dans le fichier de configuration, sur un
serveur privé, derrière l'authentification de l'application — cf.
[[015__source-de-donnees]]. Pas de diffusion hors de l'outil.

Bloquée par [[015__source-de-donnees]].
