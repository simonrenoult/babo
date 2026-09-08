# Identifier les sources de données

| Champ  | Valeur |
|--------|--------|
| id     | 015    |
| module | socle  |
| type   | tech   |

## Contexte

Presque toutes les specs du backlog supposent l'accès à des données
fédérales : classements, matchs, licences, tournois. Aucune n'est exposée par
une API publique documentée. Bado est un outil personnel, hébergé sur un
serveur privé, qui automatise un travail fait jusqu'ici à la main.

## Problème à résoudre

Chaque spec suppose la donnée disponible sans dire d'où elle vient. Tant que
l'accès n'est pas démontré, on ne peut ni estimer les specs qui en dépendent,
ni savoir lesquelles sont réalisables. Et si chaque feature attaque les sites
fédéraux à sa façon, un changement de page HTML casse l'application entière.

Résolu quand chaque donnée nécessaire est associée à une source identifiée,
que l'accès à myffbad et à badnet est prouvé de bout en bout — connexion,
récupération, extraction d'un match et d'un tournoi réels — et que le parsing
de chaque site vit dans un module unique.

## Solutions envisagées

Chaque donnée a une source et une seule :

| Donnée | Source | Acquisition | Fraîcheur |
|--------|--------|-------------|-----------|
| Équipe : licence, sexe, téléphone | CSV importé en base | téléversement manuel | saison |
| Classement, à moi et à mes coéquipiers | myffbad, **fiche publique** | scraping **anonyme** | hebdomadaire, vendredi 1 h |
| Matchs : score, partenaire, adversaire, tableau, compétition | myffbad, compte personnel | scraping | quotidien |
| Tournois : dates, lieu, tableaux, séries, date limite | badnet, **recherche publique** | scraping anonyme | quotidien |

**Corrigé le 2 septembre 2026, deux lignes de ce tableau**
([[005__liste-des-membres-de-l-equipe]] et
[[028__nom-et-classement-de-l-equipe]]) :

- l'équipe n'est pas un fichier de configuration mais une **table**, alimentée
  par un CSV téléversé depuis `/sources`. Un fichier lu au démarrage serait la
  seule donnée personnelle de tiers en clair sur le disque, alors que la base
  est chiffrée au repos. Et il ne porte **pas de mail** : myffbad ne publie pas
  les coordonnées de ses licenciés, et une colonne sans usage ne se stocke pas.
- le classement des coéquipiers **ne passe pas par le compte personnel**. La
  fiche `/joueur/<licence>` et l'action `classement` répondent toutes deux sans
  jeton : relever l'équipe entière ne touche donc pas au compte dont cette spec
  assume le bannissement. Deux requêtes par joueur, la première n'existant que
  pour traduire la licence en `personId` — seul argument que l'action accepte.

Il n'y a donc aucun arbitrage à faire entre sources, et pas d'interface
unifiée à écrire : deux modules d'acquisition indépendants, un par site.

Le classement est la seule donnée qui ne se relève pas tous les jours : le
CPPH est publié une fois par semaine, une passe le vendredi à 1 h du matin
suffit donc à le suivre ([[001__classement]]). Les matchs et les tournois,
eux, bougent au fil des jours.

Écartés : les fichiers CPPH hebdomadaires et Poona. myffbad couvre le
classement, y compris celui des coéquipiers, et l'équipe est saisie à la main.

Accès à myffbad :

- Identifiants en variable d'environnement, jamais en base. Le jeton de
  session, lui, est persisté ([[017__persistance-sqlite]]) : c'est ce qui lui
  fait survivre aux redémarrages.
- **Corrigé le 1er septembre 2026 : myffbad n'a pas de 2FA.** Sa page de
  connexion ne demande que licence et mot de passe ; c'est badnet qui en a une,
  et qui le dit sur la sienne. La connexion myffbad est donc probablement
  automatisable, ce que cette spec excluait à tort — et [[027__engagements-badnet]]
  tient l'asymétrie à l'envers. Reste à vérifier qu'aucune 2FA ne se déclenche
  après saisie du mot de passe, sur appareil inconnu : seule une vraie
  connexion le dira.
- Le jeton dure un mois (vérifié : `iat` et `exp` du JWT espacés de 30 jours,
  à date fixe et non glissante). Tant que la connexion n'est pas automatisée,
  sa reconduction se fait depuis un écran dédié de l'interface.

L'exploitation quotidienne de ces scrapings — archivage des captures,
détection des pannes, rapports, ancienneté affichée — relève de
[[019__robustesse-du-scraping]].

## Questions

- **Tranché le 1er septembre 2026 : les tournois viennent de badnet**, par sa
  recherche publique. Elle est anonyme et bien plus fine que celle de myffbad —
  département, ligue, catégories d'âge, disciplines, familles *et* rangs de
  classement, type, places disponibles, fenêtre d'inscription. Elle seule porte
  les coordonnées du gymnase, donc la distance.
- Les matchs d'interclub sont-ils exposés au même endroit que ceux de tournoi ?
  **Oui** : les deux arrivent dans la même liste, l'interclub se reconnaissant
  à son `SubName` de la forme « équipe contre équipe ».
- myffbad étant une application à composants serveur, lit-on la charge
  « flight » qu'elle pousse dans la page, ou faut-il un navigateur sans écran ?
  Un navigateur ferait entrer 300 Mo de dépendance dans un projet qui tient en
  un processus Node : à ne retenir que si la charge se révèle illisible.
- ~~La recherche publique badnet n'a pas été retrouvée.~~ **Erreur de ma part :
  je l'ai cherchée en GET sur des chemins devinés. C'est un POST sur
  `/index.php`, l'action étant désignée par `ic_a` — introuvable autrement.**

## Notes

**Sonde du 1er septembre 2026, session obtenue par Bado lui-même.**

| Source  | Requête                        | Verdict  | Extraits |
|---------|--------------------------------|----------|----------|
| myffbad | accueil du licencié            | atteinte | —        |
| myffbad | mes inscriptions               | atteinte | —        |
| myffbad | recherche de tournoi           | atteinte | —        |
| myffbad | classement (action)            | atteinte | 1        |
| myffbad | résultats (action)             | atteinte | **14**   |
| badnet  | recherche publique de tournois | atteinte | **22**   |

C'est la colonne « extraits » qui compte, pas la taille : myffbad rend un
statut 200 et une liste vide quand la session est morte, et seul un décompte
l'en distingue. La sonde le consigne donc comme volume, ce que
`issueDuVolume` transforme en `vide` — un échec — dès qu'une passe ne rend
plus rien là où la précédente rendait quelque chose (spec 019).

**Les trois critères de sortie sont atteints.** Chaque donnée a sa source
(tableau ci-dessus, corrigé). L'accès est prouvé de bout en bout : Bado se
connecte seul à myffbad, appelle ses fonctions serveur et en tire 14 résultats
réels — tournois et interclubs — plus le classement complet ; badnet rend 22
tournois par recherche anonyme. Le parsing de chaque site vit dans son module
unique, `myffbad.ts` et `badnet.ts`, le format Next.js étant isolé dans
`charge-flight.ts`.

Et la preuve se rejoue : la sonde exerce ces requêtes à chaque passage plutôt
que d'avoir constaté une fois. Les réponses réelles sont figées en exemples,
qui servent de fixtures aux parseurs.

**badnet l'est pour ce qui compte.** Sa recherche publique répond à froid :
un seul POST sur `/index.php`, sans cookie, sans compte, donc sans risque de
bannissement — la seule requête du projet qui ne dépende de rien. Le fragment
rendu embarque la liste complète en JSON dans `div.b-markers[data-markers]`,
destinée à la carte : c'est elle qu'on lit, et non les cartes, parce qu'elle
seule porte les coordonnées du gymnase et ne dépend pas de la mise en page.

Les deux visages de badnet restent donc séparés, comme
[[027__engagements-badnet]] l'exige : un test verrouille que la recherche
publique ne reçoit jamais de jeton, même quand une session existe. Et
`/competitions` — les engagements, derrière la 2FA — sort du périmètre de cette
spec pour rejoindre 027 : le sonder sans identifiants ne ferait qu'échouer tous
les jours, et un rapport qui échoue toujours ne signale plus rien.

Une réserve : la recherche rend des libellés français, parfois en HTML
(« 2 jours restants (le 03/09 à 23h59) »), là où myffbad rend des dates ISO.
Les dates fines se liront tournoi par tournoi, sur la fiche publique
`/tournoi/public?eventid=…`. C'est le prix de la finesse des critères.

**Deux trouvailles qui corrigent la spec.**

myffbad n'est plus un site HTML : c'est une application Next.js à composants
serveur, dont les pages arrivent en charge « flight » et dont aucune API
n'apparaît côté navigateur. Ce que cette spec appelle « scraping » ne sera donc
pas une lecture de balises. La question est ouverte ci-dessus.

Les identifiants en variable d'environnement gardent donc leur raison d'être,
contrairement à ce que j'ai d'abord conclu : sans 2FA côté myffbad, c'est la
pièce qui manquait à une acquisition autonome — et elle est en place.

**myffbad se lit par Server Actions.** Trois relevées le 1er septembre 2026 :
connexion, classement, résultats. Un POST sur la page, un en-tête
`next-action`, un corps JSON — rien d'autre n'est nécessaire, vérifié en
retirant tout le reste. La connexion prend `{licence, password, rememberMe}` et
rend le `jwt` en cookie ; Bado la rejoue seul.

Trois choses acquises en les rejouant :

- **Le classement est public** : il répond sans session. Cette moitié de
  l'acquisition ne dépend d'aucun jeton, donc d'aucune panne de session.
- **Les résultats, sans session, rendent `[]` avec un statut 200** — le succès
  vide que [[019__robustesse-du-scraping]] nomme, et que `issueDuVolume`
  attrapait déjà avant qu'on sache qu'il surviendrait ici.
- **Un identifiant d'action périmé rend `404 Server action not found`** — panne
  franche, donc réparable. Ces identifiants sont datés : ils changent quand
  myffbad redéploie l'action. C'est la seule fragilité qui reste, et elle ne se
  mesure pas encore : consigner le `buildId` que porte chaque réponse dira à
  quelle fréquence il faut les relever.

L'écran des sources reste néanmoins nécessaire, pour badnet et sa 2FA — et
comme dépannage myffbad le jour où un identifiant d'action périmera.

Usage strictement personnel, sur serveur privé. L'application est protégée par
identifiant et mot de passe ([[021__authentification]]) ; le `noindex` n'est
qu'un complément, il ne ferme rien par lui-même.

Quand la session myffbad tombe, le scraper s'arrête, le signale par mail, et
attend une réauthentification depuis l'interface.

Risque de bannissement du compte myffbad : accepté. Un passage par jour.

Dépend de [[017__persistance-sqlite]] pour le jeton de session et de
[[018__ordonnancement]] pour le déclenchement des passes. Prolongé par
[[019__robustesse-du-scraping]].

Ordre de traitement : une base minimale, puis la sonde d'accès jusqu'à extraire
un match et un tournoi réels, puis seulement le schéma définitif — le dessiner
avant d'avoir vu les pages serait la même erreur que de concevoir une interface
avant ses adaptateurs.

Bloque [[001__classement]], [[002__prochains-tournois]],
[[003__historique-de-matchs]], [[028__nom-et-classement-de-l-equipe]] et
[[012__recherche-de-tournois]]. À traiter en premier.
