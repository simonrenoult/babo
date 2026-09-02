# Afficher le nom et le classement des membres de l'équipe

| Champ  | Valeur     |
|--------|------------|
| id     | 028        |
| module | capitanat  |
| type   | feat       |

## Contexte

[[005__liste-des-membres-de-l-equipe]] importe l'équipe et l'affiche : licence,
sexe, téléphone, lien vers la fiche. Elle n'appelle personne, donc la page
montre des numéros de licence là où il faudrait des noms, et rien là où il
faudrait des classements.

Or le classement est justement ce qui se périme — c'est la raison pour laquelle
005 n'a pas retenu la saisie manuelle. Reconstituer les classements avant
chaque journée d'interclub prend du temps et laisse passer des erreurs.

## Problème à résoudre

La fiche d'équipe ne dit pas qui est qui, ni à quel niveau chacun joue. Elle
n'est pas exploitable pour composer une journée.

Résolu quand `/capitanat` affiche, pour chaque membre importé, son nom et son
classement — une colonne par discipline, simple, double, mixte, avec lettre et
CPPH — ainsi que la date du relevé, et quand ces valeurs se rafraîchissent
seules chaque semaine.

Vérifié de deux façons, comme [[001__classement]] : les parseurs rejoués sur
des captures réelles archivées, sans réseau ; et une passe réelle constatée une
fois sur l'équipe entière. La première seule ne prouverait que les parseurs.

## Solutions envisagées

**La chaîne, telle que la sonde l'a établie** — deux requêtes, toutes deux
publiques et anonymes :

| Étape | Requête | Rend |
|-------|---------|------|
| 1 | `GET /joueur/<licence>` | `personId`, `fullName` |
| 2 | action `classement`, argument `[personId]` | lettres et CPPH par discipline |

L'étape 1 est indispensable : l'action n'accepte **que** le `personId`, clé
interne des personnes chez myffbad. Passée la licence — chaîne ou nombre —
elle rend 200 et une réponse vide, soit le succès vide de
[[019__robustesse-du-scraping]] ; passée un objet, elle rend 500.

Le `personId` est gardé en base, dans un cache par licence côté **socle** :
c'est un détail d'acquisition, pas une donnée d'équipe. Rempli à la première
passe, il ramène le régime de croisière à une requête par joueur et par
semaine. Sur réponse vide, la fiche est relue et l'appel retenté — une seule
fois par passe et par joueur : un cache qui ne se répare pas tout seul laisse
un joueur muet jusqu'à ce que quelqu'un lise un rapport.

**Une seule passe, entièrement anonyme**, bouclant sur toutes les licences
suivies — les coéquipiers et la mienne, dédoublonnées. Un seul relevé, un seul
rapport, une seule date affichée. Plafond `2 × (nombre de licences + 1)`.

**Échec ligne à ligne** : la passe consigne « 7 relevés sur 8, licence X
muette », et son issue n'est `echec` que si aucune ligne n'aboutit. Sinon un
seul joueur qui change de club fait tomber le relevé de toute l'équipe.

La passe reçoit les licences **en argument**, `main.ts` les lisant dans le
dépôt `capitanat` avant chaque passage. Un port de plus n'aurait qu'un seul
implémenteur, et le point de composition est déjà l'endroit désigné pour
brancher un module sur le socle ([[022__decoupage-du-code]]).

L'import de 005 enchaîne une passe complète : on clique, on voit huit noms.
C'est aussi ce qui rend une licence fausse visible tout de suite — bien formée
mais erronée, elle rapporte le nom et le classement de quelqu'un d'autre, et
seul le nom affiché le dit. Écarté : une confirmation en deux temps
(« 8 licences → 8 noms »), qui ajoute un état intermédiaire pour la même
garantie que la relecture à l'œil.

Écarté aussi : déduire `SH` ou `SD` du sexe que 005 configure. Ce serait
fabriquer un fait fédéral à partir d'une saisie manuelle, là où
[[001__classement]] a posé qu'on affiche les trois disciplines que la fiche
donne. Le sexe sert à [[011__composition-de-journee]], pas à réétiqueter un
classement.

## Questions

Aucune. Les deux qui restaient — le `personId` et le régime anonyme — ont été
tranchées par sonde, voir Notes.

## Notes

**Amende [[001__classement]].** Sa passe exige aujourd'hui une session myffbad
valide et refuse de partir sans. Cette exigence est démontrée inutile : le
classement sort en anonyme, à l'octet près. La condition est retirée, ce qui
supprime un mode de panne entier — le vendredi où le jeton est mort, le
classement de toute l'équipe, le mien compris, est relevé quand même.

**Ce que la sonde du 2 septembre 2026 a montré.** `GET /joueur/<licence>`
répond 200 sans cookie, avec `isAuthenticated:false`, et porte un bloc
d'identité : `personId`, `fullName`, `licence`, `isLicenced`, `laterality`,
`gameplay*`, `category`, `instance` (le club). Aucun **genre** — ni là, ni dans
les 78 clés de l'action `classement`, ni dans les résultats, qui rendent
`DisciplineId` et une série (`D8`), jamais `SH` ni `SD`. C'est pourquoi le sexe
reste au CSV de 005. La fiche ne porte **aucun** `SubLevel` : le bloc classement
est bien peuplé par l'action.

L'action `classement` rend 2229 octets en anonyme — exactement la taille de la
capture archivée sous session.

**Les fixtures.** La fiche entière est figée en exemple, 91 Ko, non tronquée :
une capture réduite à la ligne utile ne casserait plus le jour où myffbad
déplace le bloc, et c'est justement ce déplacement qu'on veut voir.

**Le club et la catégorie d'âge** arrivent gratuitement avec le `personId`. Ils
ne sont pas gardés : la spec qui en aura besoin les prendra.

**Les états vides**, dans l'esprit de [[001__classement]] qui refuse le tableau
de tirets : équipe importée sans passe aboutie → la liste s'affiche avec
« noms et classements non encore relevés » en tête ; coéquipier isolé en échec
→ sa ligne reste, ses colonnes classement portent la mention de l'échec, le
rapport en porte la raison. Une case vide ne doit jamais pouvoir se lire comme
« non classé ».

Le tri passe sur `fullName` tel que myffbad le rend — « Simon RENOULT », prénom
puis nom. Pas d'extraction du nom de famille : une heuristique sur des noms
propres échoue en silence au premier nom composé, sur la donnée qu'on lit en
premier.

Réutilise la table `classement` de [[001__classement]], déjà clé par licence.

Bloquée par [[005__liste-des-membres-de-l-equipe]] et
[[015__source-de-donnees]]. Bloque [[006__performance-individuelle]] et
[[011__composition-de-journee]]. Attend [[018__ordonnancement]] pour le
déclenchement hebdomadaire — vendredi 1 h, l'horaire de 001.
