# Glossaire de Babo

Le vocabulaire structurant de l'application, tel qu'il se lit dans `src/` et
`docs/spec/`. Une définition dit ce qu'un terme **est**, jamais comment il
s'implémente ; les renvois `spec/` sont là pour la décision, pas pour le détail.

## Le projet

**Babo**:
L'application, et la personne qu'elle incarne quand elle agit ou parle. Un seul
terme recouvre désormais le dépôt et le paquet, le préfixe de configuration
(`BABO_*`), le préfixe des mails (`[Babo]`) et l'accueil de l'interface.

## Faits fédéraux

Les notions qui décrivent le badminton fédéral et qu'aucun module ne possède :
`mon-profil`, `capitanat` et `veille` les lisent tous les trois.

**Licence**:
Le numéro de licence fédérale, sur huit chiffres — zéros de tête compris, car
myffbad répond pour `409390` et `00409390` à la même personne.
_Éviter_: numéro de licence fédéral (redondant), licence FFBa.

**Classement**:
La cote fédérale d'un joueur : une **Lettre** et un **CPPH**, par **Discipline**.
Fait fédéral, donc unique pour tous les modules.

**Lettre**:
Le barème fédéral en valeur fermée : `N1, N2, N3, R4, R5, R6, D7, D8, D9, P10,
P11, P12, NC`. Une valeur hors barème fait échouer l'extraction plutôt que
d'entrer en base.
_Éviter_: série (pour ce sens — voir *Série*), rang, niveau.

**CPPH**:
Le nombre qui accompagne la lettre, seule mesure de force que la source donne.
Signe fédéral (classement par point handicap) ; non développé dans le code.

**Discipline**:
L'une des trois familles de classement que la fiche myffbad expose :
`simple`, `double`, `mixte`. **Ce n'est pas un *Tableau*** : trois disciplines,
pas cinq tableaux, et myffbad ne publie jamais le sexe qui permettrait de passer
de « simple » à `SH` ou `SD`.

**Tableau**:
L'une des cinq cases d'une feuille de match : `SH, SD, DH, DD, MX`. Noté `MX` et
non `DX` — c'est l'écriture de la fédération, qui fait foi partout où le code
parle à une source. Ce qu'une **Veille** cherche ou dont un **Engagement** est
fait.
_Éviter_: épreuve, catégorie (voir *Catégorie*).

**Intitulé (de tableau)**:
Le nom lisible d'un tableau — « Simple hommes » pour `SH`. L'écriture à
l'écran, distincte du code `Tableau` qui parle aux sources.

**Catégorie**:
La catégorie d'âge du formulaire de recherche badnet :
`jeunes, seniors, veterans, parabad`. Le nom du champ est la valeur.
_Éviter_: tableau, discipline.

**Identité**:
Qui est derrière une licence, lu sur la fiche publique myffbad : le **nom** et
le `personId` interne. Ce n'est pas un joueur : aucun rôle, aucune coordonnée,
aucune préférence.
_Éviter_: Joueur, profil, membre.

**Tournoi**:
Une compétition telle que badnet la publie. Identifiée par son **Événement** ;
assemblée de deux moitiés — la recherche (nom, coordonnées, date limite) et la
fiche publique (gymnase, journées, tableaux, séries) — qu'aucune des deux ne
réécrit sur l'autre.

**Événement**:
L'identifiant badnet d'un tournoi. C'est la seule clé stable : lui seul relie un
engagement à sa fiche et à une veille.

**Engagement**:
Une inscription de tournoi, telle que badnet la donne sous session : le tournoi,
sa date, le **statut** en texte brut et les **Tableaux** engagés avec leur
**Série** et leur **Partenaire**. Vit dans le socle car c'est une passe du socle
qui l'écrit.
_Éviter_: inscription (préférer le terme fédéral).

**Partenaire**:
Le coéquipier d'un double ou d'un mixte sur un engagement : sa licence (si
badnet la rend) et son nom. Absent sur un simple, ou tant que le double n'est pas
composé.

**Série**:
Sur un **Engagement**, la série d'inscription lue sur le libellé badnet — « S4 »
dans « DH S4 ». Texte brut, jamais interprété.
_À ne pas confondre_: les `series` d'un **Tournoi** ou d'une **Veille**, qui sont
des **Lettres** du barème (les rangs admis ou cherchés) — même mot, deux
concepts.

## Sources

**Source**:
L'un des deux sites fédéraux dont Babo tire ses données : `myffbad` ou `badnet`.
Chaque donnée a une source et une seule ; ils s'acquièrent et s'ordonnancent
séparément, pour qu'une panne de l'un n'arrête pas l'autre.

**myffbad**:
Le site des licenciés. Porte le classement et l'identité (fiche publique, à
froid) et l'espace du licencié (sous session). Sans 2FA : Babo s'y connecte seul.

**badnet**:
Le site des compétitions. Deux visages, une seule **Source** : la recherche de
tournois est publique et anonyme ; `/competitions` (mes engagements) est sous
session. Avec 2FA, que Babo traverse plutôt que de contourner.

**Session (de source)**:
Le cookie qui authentifie Babo auprès d'une **Source**. Gardé en base pour
survivre aux redémarrages ; dure un mois. Tombée, elle arrête le scraper et
demande une réauthentification.
_À ne pas confondre_: la session d'ouverture de Babo lui-même (voir *Compte*),
qui est un jeton signé sans état en base.

**Jeton (de session)**:
La valeur du cookie de **Session** d'une source, avec ses dates d'obtention et
d'expiration. `JetonMyffbad` en base ; les identifiants, eux, ne le sont jamais.

**Sonde**:
Le premier instrument d'acquisition : va chercher des pages connues, les archive
et dit jusqu'où elle est allée, sans comprendre ce qu'elle rapporte. Ses
captures deviennent les fixtures des parseurs.

**Capture**:
Une réponse HTML brute, archivée en base **avant** toute analyse. Un parseur
devenu aveugle se corrige en rejouant les captures, sans requête réseau.

**Build (observé)**:
Le déploiement qu'une source annonce dans ses réponses (le `buildId` de
myffbad). Suivi pour voir venir la péremption des identifiants d'action de
Server Action, qui changent à la construction.

## Acquisition et ordonnancement

**Passe**:
Une exécution automatique d'acquisition — relever les classements, les
engagements, les veilles, les fiches de tournoi. Ne lève jamais : toute panne
devient un **Rapport**. Distincte d'une **Échéance**, qui dit *quand* elle est
due.
_Éviter_: scraping (le mécanisme), tâche (voir *Tâche*).

**Tâche**:
L'unité nommée qu'ordonnance le planificateur et sous laquelle une **Passe**
consigne son **Rapport** (ex. `acquisition:myffbad`). Une tâche a une
**Cadence** et produit des **Échéances**.

**Échéance**:
Le moment où une **Tâche** est due. Persistée en base pour survivre au
redémarrage ; idempotente sur (tâche, date prévue). Trois tentatives, puis
abandon.

**Cadence**:
La récurrence d'une tâche : `quotidienne`, `hebdomadaire` (à jour et heure
fixes) ou `ponctuelle` (inscrite une par une par l'appelant, comme les rappels
de tournoi). Donnée en base, modifiable sans redéploiement.

**Battement**:
Le mail hebdomadaire à jour et heure fixes qui récapitule les exécutions et les
pannes ouvertes. Sa raison d'être est que **son absence se remarque** : sans lui,
un planificateur arrêté est indiscernable d'une semaine sans incident.

## Robustesse et exploitation

**Rapport (d'exécution)**:
La trace que laisse toute exécution automatique : tâche, dates, **Issue**,
volume extrait, détail. Rien n'est purgé.

**Issue**:
Le verdict d'un rapport, à trois valeurs : `succes`, `vide`, `echec`. **`vide`
est une panne** au même titre qu'`echec` — une page qui répond sans rien rendre
est le mode de panne le plus coûteux, parce qu'il ne se voit pas.
_Éviter_: statut, résultat.

**Fraîcheur**:
L'ancienneté d'une donnée, telle que la page métier la dit. Périme quand la
donnée dépasse la période de sa propre **Cadence** — jamais une ancienneté
globale, car les sources tombent indépendamment.

**Alerte**:
Le mail de panne, émis au **passage** en panne (et à la sortie), pas à chaque
exécution : un parseur aveugle le reste jusqu'à correction, et un mail quotidien
identique se filtre en trois jours. Le **Battement** ferme le trou ainsi ouvert.

## Courrier

**Message**:
Un mail à envoyer : sujet, HTML (obligatoire) et texte (facultatif). Composé
dans le `core`, sans moteur de vue.

**Courrier**:
La brique d'envoi. Tout **Message** est écrit en base **avant** d'être remis ;
un échec d'envoi ne se signale jamais par mail — il vit dans un **Rapport**.

## Authentification (l'accès à Babo)

**Compte**:
Le compte unique qui ouvre Babo. Posé au démarrage depuis la configuration
(licence + mot de passe haché) ; pas d'inscription, pas d'écran de changement.
La licence n'est pas un secret — elle est sur myffbad.

**Portier**:
La limitation de tentatives de connexion. Compteur global (un seul compte, le
par-IP se contourne), en mémoire ; cinq échecs verrouillent un quart d'heure au
plus, jamais définitivement.

## Capitanat

**Coequipier**:
Un membre de mon équipe : sa **Licence**, son **Sexe** et son téléphone. C'est
le `Joueur` que le socle refuse de posséder — vu d'ici, un joueur est quelqu'un
qu'on aligne et qu'on appelle. Le nom et le classement se relèvent, ils ne se
saisissent pas.
_Éviter_: Joueur (terme jamais partagé), membre (réservé à *Membre de l'équipe*).

**Sexe**:
`F` ou `M`. Ne vient pas de myffbad, qui ne le publie nulle part : c'est la
moitié de la fiche d'équipe que seul le capitaine peut donner. Sert à composer,
jamais à réétiqueter un classement en `SH` ou `SD`.

**Membre de l'équipe**:
Un **Coequipier** enrichi du nom et des classements relevés par la passe, tel
que la page le montre.

**Force par tableau**:
L'équipe rangée tableau par tableau, du plus fort au plus faible à la cote.
Dérivé de ce qui est déjà en base — sexe du CSV, cote et lettre de la passe —,
sans aucune saisie.

**Alignable**:
Un joueur que son sexe et son classement rendent alignable sur un **Tableau**.
Rangé à la cote décroissante.

**Écarté**:
Un joueur du bon sexe mais sans classement dans la discipline. Nommé à part,
jamais rangé dernier : en début de saison, c'est presque toujours une licence
fausse, pas un joueur faible.

**Manque**:
Les places non couvertes sur un tableau, par sexe. Un décompte, jamais une
estimation de niveau — les seuils produisent surtout de fausses alertes.

**Paire**:
Deux licences, pour un `DH`, `DD` ou `MX`. Son tableau se déduit des sexes, il
ne se stocke pas. Une décision de capitaine, qui ne se recalcule pas.
_Éviter_: duo, double (réservé à la *Discipline*).

**Marque (de joueur)**:
Ce que le capitaine privilégie, à une place donnée — un joueur *sur un tableau*,
indépendamment de ses autres marques. Ni une étoile ni un bonus de points :
deux blocs, les marqués d'abord.

## Veille

**Veille**:
Une recherche de tournois qu'on nomme et qu'on garde. **Ce n'est pas la
configuration du formulaire badnet** : elle porte un modèle à elle (lieu, rayon,
fenêtre, tableaux, séries), qu'un adaptateur traduit. Suspendue plutôt que
supprimée — supprimer efface ce qu'elle a vu et réalerterait sur tout à la
recréation.

**Fenêtre**:
La plage de dates d'une veille, sous l'une de deux formes : `glissante` (les N
prochains jours) ou `intervalle` (du … au …). Jamais de récurrence annuelle :
« tous les novembres » ne tient pas, car ce qu'on veut suit des vacances dont
les dates changent.

**Appartenance**:
Ce qu'une veille voit, et depuis quand. La seule chose qui lui appartient en
propre : le tournoi est partagé entre veilles. Une sortie est datée, pas
effacée, pour distinguer « annulé » de « ne répond plus aux critères ».

## Termes évités

**Joueur**:
Jamais un type du socle. Chaque module garde le sien — **Coequipier** pour le
capitanat, le profil pour `mon-profil` —, parce qu'un joueur n'a pas la même
définition selon qui le regarde. Le mot survit dans la prose, jamais dans un
type partagé.
