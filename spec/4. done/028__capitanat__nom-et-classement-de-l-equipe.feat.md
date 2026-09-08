# Afficher le nom et le classement des membres de l'équipe

| Champ  | Valeur     |
|--------|------------|
| id     | 028        |
| module | capitanat  |
| type   | feat       |

## Contexte

[[005__capitanat__liste-des-membres-de-l-equipe.feat]] importe l'équipe et
l'affiche : licence, sexe, téléphone, lien vers la fiche. Elle n'appelle
personne, donc la page montre des numéros de licence là où il faudrait des noms,
et rien là où il faudrait des classements.

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

Vérifié de deux façons, comme [[001__mon-profil__classement.feat]] : les
parseurs rejoués sur des captures réelles archivées, sans réseau ; et une passe
réelle constatée une fois sur l'équipe entière. La première seule ne prouverait
que les parseurs.

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
[[019__socle__robustesse-du-scraping.tech]] ; passée un objet, elle rend 500.

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
brancher un module sur le socle ([[022__socle__decoupage-du-code.tech]]).

L'import de 005 enchaîne une passe complète : on clique, on voit huit noms.
C'est aussi ce qui rend une licence fausse visible tout de suite — bien formée
mais erronée, elle rapporte le nom et le classement de quelqu'un d'autre, et
seul le nom affiché le dit. Écarté : une confirmation en deux temps
(« 8 licences → 8 noms »), qui ajoute un état intermédiaire pour la même
garantie que la relecture à l'œil.

Écarté aussi : déduire `SH` ou `SD` du sexe que 005 configure. Ce serait
fabriquer un fait fédéral à partir d'une saisie manuelle, là où
[[001__mon-profil__classement.feat]] a posé qu'on affiche les trois disciplines
que la fiche donne. Le sexe sert à
[[011__capitanat__composition-de-journee.feat]], pas à réétiqueter un
classement.

**Amendé par [[029__capitanat__forces-par-tableau.feat]].** L'interdit tient
pour ce que *cette* page affiche : `/capitanat` montre les trois disciplines de
la fiche, et rien d'autre. Il ne tient pas pour un écran qui range des joueurs
par tableau, parce que celui-là ne présente aucun fait fédéral — il classe pour
le capitaine qui a lui-même saisi le sexe, et le dit. La frontière n'est donc
pas « d'où vient la donnée » mais « qu'est-ce qu'on prétend afficher » :
réétiqueter un classement reste interdit, s'en servir pour trier ne l'est pas.

## Questions

Aucune. Les deux qui restaient — le `personId` et le régime anonyme — ont été
tranchées par sonde, voir Notes.

## Notes

**Amende [[001__mon-profil__classement.feat]].** Sa passe exige aujourd'hui une
session myffbad valide et refuse de partir sans. Cette exigence est démontrée
inutile : le classement sort en anonyme, à l'octet près. La condition est
retirée, ce qui supprime un mode de panne entier — le vendredi où le jeton est
mort, le classement de toute l'équipe, le mien compris, est relevé quand même.

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

**Les états vides**, dans l'esprit de [[001__mon-profil__classement.feat]] qui
refuse le tableau de tirets : équipe importée sans passe aboutie → la liste
s'affiche avec « noms et classements non encore relevés » en tête ; coéquipier
isolé en échec → sa ligne reste, ses colonnes classement portent la mention de
l'échec, le rapport en porte la raison. Une case vide ne doit jamais pouvoir se
lire comme « non classé ».

Le tri passe sur `fullName` tel que myffbad le rend — « Simon RENOULT », prénom
puis nom. Pas d'extraction du nom de famille : une heuristique sur des noms
propres échoue en silence au premier nom composé, sur la donnée qu'on lit en
premier.

Réutilise la table `classement` de [[001__mon-profil__classement.feat]], déjà
clé par licence.

Bloquée par [[005__capitanat__liste-des-membres-de-l-equipe.feat]] et
[[015__socle__source-de-donnees.tech]]. Bloque
[[006__capitanat__performance-individuelle.feat]] et
[[011__capitanat__composition-de-journee.feat]]. Attend
[[018__socle__ordonnancement.tech]] pour le déclenchement hebdomadaire —
vendredi 1 h, l'horaire de 001.

## Fait

**La passe réelle, constatée le 2 septembre 2026.** Import d'un CSV depuis
`/sources`, passe enchaînée, sans aucune session en base : deux requêtes, la
fiche (91 168 octets) puis l'action (2229 octets), `1 relevé(s) sur 1`, trois
disciplines écrites, et `/capitanat` affichant « Simon RENOULT » avec D9 / D8 /
D9. La seconde passe n'a coûté qu'une requête — le cache de `personId` tient — et
n'a pas ouvert de nouveau palier, seul `vu_le` ayant bougé. Une licence
inexistante ajoutée au fichier a laissé sa ligne à l'écran, colonnes marquées
« non relevé », le rapport portant `1 relevé(s) sur 2 — 99999999 : aucun bloc
d'identité`. C'est la seconde des deux vérifications exigées ci-dessus ; la
première tient dans les tests, parseurs rejoués sur les captures archivées.

**Un choix tranché en écrivant.** Le succès vide de
[[019__socle__robustesse-du-scraping.tech]] descend au niveau du joueur :
`issueDuVolume` ne peut plus rien dire d'utile au niveau de la passe, puisqu'un
volume nul y implique qu'aucune ligne n'a abouti — cas déjà traité comme un
échec. Un joueur dont l'action ne rend rien est donc muet même si les autres
parlent, et le rapport le nomme.

**Ce qui reste ouvert, et n'appartient pas à cette spec.** La sonde de 015
échoue toujours en entier quand aucune session n'existe, y compris pour ses
pages anonymes — le mur de connexion y compte comme une page manquée. C'est la
règle que `/competitions` a fait écarter de badnet (« un rapport qui échoue
toujours ne signale plus rien ») appliquée d'un seul côté. Le partage des pages
sondées entre moitié anonyme et moitié sous session est un amendement à
[[019__socle__robustesse-du-scraping.tech]], à écrire.

**Un défaut trouvé à la mise en service, et sa correction.** La première passe
réelle sur l'équipe entière n'a relevé qu'un joueur sur seize. Le tableur qui a
produit le CSV avait traité la colonne des licences comme un nombre et mangé les
zéros de tête : `7194591` en base, `07194591` chez myffbad. Le contrôle
d'identité ci-dessus a fait exactement son travail — il a refusé d'attribuer
« Simon RENOULT » à `7194591` — mais il accusait myffbad d'avoir répondu pour
quelqu'un d'autre là où le défaut était chez nous.

La correction est dans le type : `Licence` complète à huit chiffres, zéros de
tête compris, ce qui est la forme que myffbad emploie lui-même — la fiche
demandée pour `409390` répond pour `00409390`. Le padding est dans le
constructeur du type et non chez l'un de ses appelants, seule place où aucun
chemin ne peut l'oublier. La migration `006` rattrape ce qui était déjà écrit,
dans les trois tables qui portent une licence.

**Et un manque, révélé par le même passage.** 005 supprime les relevés de
classement d'un coéquipier absent du fichier ; le nom que cette spec ajoute
n'était pas dans ce ménage. Il l'est désormais — c'est de la donnée personnelle
au même titre que le téléphone, davantage même, puisqu'il désigne la personne là
où un classement ne fait que la situer ([[021__socle__authentification.tech]]).

**Passe réelle après correction :** `15 relevé(s) sur 15`, 45 disciplines,
quinze noms et trois colonnes de classement à l'écran, sans aucune session.
