# Écarter les tournois déjà complets

| Champ  | Valeur  |
|--------|---------|
| id     | 035     |
| module | veille  |
| type   | feat    |

## Contexte

[[012__veille__recherche-de-tournois.feat]] retient les tournois dont les
inscriptions sont ouvertes. Ouvertes ne veut pas dire disponibles : un tournoi
demandé se remplit en quelques jours et reste affiché « ouvert » avec sa liste
d'attente.

badnet propose une case `hasplaces` dans son formulaire de recherche, et publie
des jauges — par tournoi sur la fiche (« Nombre de joueurs : 110/400 »), et par
tableau (« SH, 71 joueurs »).

## Problème à résoudre

Une veille qui rend trente tournois dont la moitié sont pleins me fait ouvrir
trente fiches pour en trouver quinze. C'est le travail que 012 devait supprimer.

Résolu quand une veille peut n'afficher que les tournois où il reste de la
place, et quand la page dit, pour les autres, à quel point ils sont remplis.

## Solutions envisagées

- **Pousser `hasplaces` dans la requête badnet.** Une case à cocher, rien à
  calculer. Mais on ne sait pas ce qu'elle recouvre, et un tournoi écarté par
  elle l'est en silence.
- **Lire les jauges et filtrer en local.** Visible, explicable, et permet de
  nuancer — « complet », « presque plein », « de la place ».

Écartée de la v1 de 012 pour une raison relevée par la sonde du 8 septembre
2026 : le champ `participants` du JSON de recherche est **souvent vide**, et
quand il ne l'est pas il prend deux formes incompatibles — une jauge par jour
(`Jour 1 : 12/80`) ou un compteur brut sans plafond (`280`). Filtrer sur une
donnée absente écarterait des tournois qui ont de la place.

La fiche, elle, porte une jauge globale fiable (`110/400`) et une jauge par
tableau. Mais la lire suppose que la fiche soit déjà relevée — ce que 012 fait
désormais pour tous les tournois d'une veille.

## Questions

- Le filtre porte-t-il sur la jauge globale ou sur celle du tableau que je
  vise ? Un tournoi plein en SH peut avoir de la place en mixte.
- Une jauge relevée le matin vaut-elle encore le soir, sur un tournoi qui se
  remplit en trois jours ? Faut-il rafraîchir les fiches des tournois qui
  approchent de leur plafond, alors que 012 les traite comme des données figées ?
- Que fait-on d'une liste d'attente : un tournoi complet mais dont la liste
  d'attente avance est-il « sans place » ?
- La case `hasplaces` de badnet recouvre-t-elle la même chose que nos jauges ?

## Notes

Reportée de 012, qui l'a écartée de sa v1.

Dépend du relevé de fiches que 012 met en place : sans lui, il n'y a pas de
jauge fiable à lire. Rejoint [[013__veille__alerte-nouveau-tournoi.feat]] par
son motif — « les tournois intéressants se remplissent vite » — mais s'y prend
par l'autre bout : 013 alerte tôt, celle-ci cesse de montrer ce qui est trop
tard.
