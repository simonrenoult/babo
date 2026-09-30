# Architecture

Ce document décrit ce qui est en place. Il ne remplace pas les specs
[020](<spec/4. done/020__socle__architecture-applicative.tech.md>),
[017](<spec/4. done/017__socle__persistance-sqlite.tech.md>),
[022](<spec/4. done/022__socle__decoupage-du-code.tech.md>) et
[015](<spec/4. done/015__socle__source-de-donnees.tech.md>), qui portent les décisions
et leurs raisons.

## La forme de l'application

Un processus Node, une seule instance, rendu côté serveur avec Express et EJS.
Pas de client riche, pas d'API publique, pas de travailleur séparé.

Une seule instance, ce n'est pas un oubli : le planificateur vit dans le
processus (018), la base est un fichier unique (017), et le jeton de session
myffbad doit survivre aux redémarrages (015). La montée en charge horizontale
est exclue par construction.

Le TypeScript est exécuté directement par Node, sans étape de compilation :
`node src/main.ts`. `tsc` ne sert qu'à vérifier les types.

## Les modules

| Module      | Porte                                          |
|-------------|------------------------------------------------|
| `socle`     | base, mail, planificateur, authentification, acquisition, interface |
| `mon-profil`| specs 001 à 004                                |
| `capitanat` | specs 005 à 011                                |
| `veille`    | specs 012 à 014                                |

Chaque module est un hexagone :

| Dossier          | Porte                                                       |
|------------------|-------------------------------------------------------------|
| `core`           | les notions métier, et les ports qu'elles déclarent          |
| `presentation`   | routes HTTP et vues                                          |
| `infrastructure` | accès à la base, scrapers, envoi de mail                     |

`src/main.ts` est le point de composition : le seul fichier qui connaisse à la
fois le socle et les features, et le seul autorisé à les brancher entre eux.

## Où atterrit le code d'une nouvelle spec

1. **À quel module appartient la spec ?** Le tableau ci-dessus le dit. Si la
   réponse est « à plusieurs », c'est du socle — ou la spec est à découper.
2. **Est-ce une notion, une page, ou un accès à l'extérieur ?** Notion →
   `core`. Page ou route → `presentation`. Base, réseau, mail, fichier →
   `infrastructure`.
3. **Le `core` a besoin de sortir ?** Il déclare un port (un type) et
   `infrastructure` en fournit l'adaptateur. Voir
   `src/socle/core/capture.ts` et son adaptateur
   `src/socle/infrastructure/base/depot-captures-sqlite.ts`.

Trois interdits, vérifiés par `npm run lint` et non par la discipline :

- un `core` n'importe ni `presentation` ni `infrastructure` ;
- un module de feature n'importe pas un autre module de feature ;
- le `socle` n'importe aucune feature.

Ils sont produits par `eslint.config.js` et testés par
`test/architecture.test.ts`. Ce qui n'appartient à aucun module descend dans
`socle/core` — un numéro de licence, un tableau. Jamais `Joueur` : `mon-profil` et
`capitanat` gardent chacun le leur.

## Les pages

Une règle d'agencement, pour toutes les vues (039) : **les gestes se lisent
immédiatement sous le titre de ce qu'ils concernent**, sur une ligne, la
`div.barre-actions`. Un geste sur la page va sous son `<h2>` — ou sous les
onglets, sur les pages qui en ont : l'onglet actif tient lieu de titre ; un
geste sur une section va sous son `<h3>` ou `<h4>`. Le résultat d'un geste
(sonde, rapport de passe, mail de test) s'affiche juste sous la barre.

Est un geste ce qui agit sur la page ou la section : créer, modifier,
suspendre, supprimer, lancer, sonder, exporter, imprimer, copier. Ne le sont
pas le bouton qui termine un formulaire — il reste sous les champs qu'il envoie
— ni celui d'une ligne de tableau, qui reste dans sa ligne. Un geste
impossible n'est jamais grisé : la raison prend sa place dans la barre.

Une **sous-page** — atteinte depuis une autre et absente des onglets : une
tâche, une source, un tableau du capitanat, une veille, le formulaire de
veille — ouvre sa barre par le partial `retour` du socle, `← <parent>`. Un
lien fixe vers le parent hiérarchique, jamais l'historique, pour qu'il reste
juste après un envoi de formulaire ; le seul retour de la page, et présent même
sans aucun geste. La modification d'une veille ramène à cette veille, sa
création à la liste.

## L'acquisition

Deux sources, deux modules qui s'ignorent — `src/socle/infrastructure/acquisition/`,
spec 015. Chacun sait reconnaître son propre mur de connexion : myffbad
redirige vers `/connexion`, badnet sert sa page de connexion sous l'URL
demandée. C'est cette différence qui interdit de les mutualiser.

Elles ne se ressemblent pas non plus dans leur mécanique. myffbad se lit par
fonctions serveur Next.js, avec un `personId` qu'on a d'abord cru réservé au
jeton — la fiche publique le porte aussi, et c'est ce que 028 a établi. myffbad
a donc lui aussi deux moitiés : la fiche `/joueur/<licence>` et l'action
`classement` répondent **à froid**, sans cookie ; l'espace du licencié — accueil,
mes inscriptions, résultats — reste derrière la session. La recherche de
tournois badnet, elle, est **publique et anonyme** :
un POST sur `/index.php`, sans cookie, dont la réponse embarque la liste en
JSON dans `div.b-markers`. C'est la seule requête du projet qui ne dépende de
rien — et elle ne doit jamais passer sous session, sous peine de mettre la
veille quotidienne sous le même risque de bannissement que le reste (spec 027).

**badnet a deux visages, une seule `Source`.** `/competitions` porte mes
engagements derrière la session ; la recherche n'en a pas. Les séparer en deux
sources créerait une ligne « session » permanente et vide pour la face publique,
sur un écran dont tout le propos est de dire quelle session est morte. Le
découplage passe donc par la **tâche** — `acquisition:badnet:engagements` à côté
de `acquisition:badnet` —, pour qu'une session morte ne fasse pas passer la
recherche publique pour en panne, ni partir l'alerte de 019 pour la mauvaise
raison. `badnet.org` et `badnet.fr` sont le même site : vérifié, deux alias.

Toute requête sortante passe par deux décorateurs du `core`, qu'aucun appelant
ne peut oublier : `enArchivant` écrit la réponse en base avant que quiconque
l'analyse, `sousPlafond` arrête une passe qui boucle. La session vit dans
`jeton_source`, une clé par source.

**Les deux sources se connectent, mais pas de la même façon** — 015 et 027.
myffbad n'a pas de 2FA : Babo s'y connecte seul en rejouant la Server Action de
connexion, dès que `BABO_MYFFBAD_MOT_DE_PASSE` est renseigné. badnet en a une,
et 027 la **traverse** plutôt que de la contourner : Babo poste les
identifiants, badnet envoie un code par mail, on le recopie sur `/sources`. C'est
un second temps facultatif du port `connexion`, que myffbad n'implémente pas.

L'identifiant est ma licence pour les deux, à huit chiffres. Les mots de passe
viennent de l'environnement, ne touchent jamais la base, et seul le jeton rendu
y entre. Le collage manuel du cookie reste offert pour les deux : c'est l'issue
de secours le jour où un formulaire change.

**L'identifiant d'action de la connexion badnet est relevé à chaque tentative**,
sur le mur que `/competitions` sert publiquement — là où celui de la recherche
est écrit en dur. L'asymétrie est voulue : une recherche qui casse se voit le
lendemain dans un rapport, une connexion qui casse laisse la session mourir sans
que rien ne la renouvelle.

**Le mur du code est testé avant le cookie.** badnet est en PHP, et PHP pose un
`PHPSESSID` dès le premier contact, authentifié ou non : un cookie présent ne
prouve rien, alors que le mur du code est un signal positif. L'ordre inverse
ferait prendre une demande de code pour une session ouverte.
Son échéance
est lue dans le jeton quand il la porte — le JWT myffbad porte son `exp` — et
devinée à un mois seulement sinon.

Un troisième décorateur consigne le `buildId` que myffbad annonce dans chaque
réponse (`build_source`, une ligne par build et non par passe). C'est la mesure
de la seule fragilité qui reste : les identifiants de Server Action sont
calculés à la construction du site, et on ignore encore à quelle fréquence il
faut les relever. L'écran prévient quand le build a changé depuis le relevé.

`/sources` affiche l'état de chaque session, l'ancienneté de la dernière passe,
les déploiements observés, et lance la sonde d'accès.

## La base

Un fichier SQLite unique, chiffré au repos (SQLCipher), ouvert et migré au
démarrage par `src/socle/infrastructure/base/persistance.ts`. Aucune feature ne
persiste quoi que ce soit en dehors.

Le schéma porte le jeton de session, les captures brutes, les rapports
d'exécution, les déploiements observés, le classement, l'équipe, l'identité
de chaque licence suivie, les fréquences et échéances du planificateur, la
boîte d'envoi du courrier, les paires du capitaine, mes engagements de tournoi
et le lieu de ces tournois.
Celui des
matchs et des tournois reste à dessiner — la sonde de 015 a livré les pages réelles sur
lesquelles le faire. Les migrations sont des fichiers `.sql` numérotés dans
`src/socle/infrastructure/base/migrations/`, appliqués une fois, dans l'ordre
des noms, chacun dans une transaction.

La clé de chiffrement vit dans la configuration du serveur (`BABO_BASE_CLE`),
jamais en base. Sans elle, l'application refuse de démarrer. En développement
elle vient de `.env`, chargé par `npm start` et `npm run dev` ; en production,
du gestionnaire de service.

## Exécution

```sh
npm install
cp .env.example .env         # deux clés à tirer (base, jetons) et un mot de passe
npm start                    # ou npm run dev
npm run verifier   # types, lint d'architecture, tests
npm run capture    # les captures archivées ; `-- <id>` en écrit une (019)
```

L'application tourne en service supervisé, relancé automatiquement en cas
d'arrêt : voir `deploiement/babo.service`. C'est la seule pièce qui ne peut pas
vivre dans l'application, et la condition du risque accepté par 018 — tant que
le processus est mort, plus rien ne s'exécute et rien ne prévient.

TLS est terminé par un proxy en amont, pas par Express : c'est lui qui rend
tenable le cookie `Secure` de 021. `BABO_DERRIERE_UN_PROXY=false` si
l'application est un jour exposée sans intermédiaire.

## Le classement

Première donnée métier écrite en base — spec 001. La chaîne tient en quatre
pièces, une par couche :

| Pièce | Où |
|-------|-----|
| la notion — lettre, CPPH, discipline | `socle/core/classement.ts` |
| l'identité — nom et `personId` | `socle/core/identite.ts` |
| les parseurs de la fiche myffbad | `socle/infrastructure/acquisition/myffbad.ts` |
| la passe qui relève, écrit et rapporte | `socle/core/passe-classement.ts` |
| la lecture et les pages | `mon-profil/` et `capitanat/` |

`Classement` est dans le `socle` et non dans `mon-profil` : une lettre et un
CPPH sont un fait fédéral, il n'en existe pas une version vue par `mon-profil`
et une autre vue par `capitanat` (022, amendée par 001). `Joueur`, lui, reste
dupliqué.

Trois disciplines — simple, double, mixte — et non les cinq tableaux de
`Tableau`. C'est ce que la fiche expose, et en déduire `SH` ou `SD`
demanderait un sexe que myffbad ne publie nulle part. 001 disait « rattachés à
un `Tableau` » avant qu'on ait vu la fiche ; elle est amendée. Le sexe qu'un
CSV importe depuis 005 ne change rien à cela : c'est une saisie manuelle, et
en tirer une série serait fabriquer un fait fédéral (028).

029 s'en sert pourtant pour ranger l'équipe tableau par tableau, et l'interdit
tient quand même : la frontière n'est pas d'où vient la donnée, mais ce que la
page prétend afficher. Réétiqueter un classement en `SH` reste interdit ; s'en
servir pour trier des joueurs devant le capitaine qui a saisi ce sexe lui-même
ne l'est pas — et ces pages-là le disent en toutes lettres.

Une ligne par changement de valeur, jamais une par passe : le classement ne
bouge qu'à la publication hebdomadaire du CPPH. Chaque ligne porte `apparu_le` —
l'entrée dans le palier, que 024 lira — et `vu_le`, la dernière passe qui a
relevé ces valeurs, seule date que la page affiche.

Une lettre hors barème fait échouer la passe au lieu d'entrer en base : c'est
le seul moyen que le succès vide de 019 se voie. La capture étant archivée, la
correction se fait dessus, sans requête réseau.

**Une seule passe, entièrement anonyme, pour tout le monde** — 028. Elle boucle
sur les licences suivies, la mienne et celles de l'équipe dédoublonnées, et pour
chacune enchaîne deux requêtes sans cookie : la fiche `/joueur/<licence>`, qui
rend le nom et le `personId`, puis l'action `classement`, qui n'accepte que ce
`personId`. Le `personId` est gardé en base — un cache par licence, côté socle,
parce que c'est un détail d'acquisition et pas une donnée d'équipe —, ce qui
ramène le régime de croisière à une requête par joueur et par semaine. Sur
réponse vide, la fiche est relue et l'appel retenté une fois : un cache qui ne
se répare pas laisse un joueur muet jusqu'à ce que quelqu'un lise un rapport.

001 exigeait une session valide et refusait de partir sans. La sonde du
2 septembre 2026 a montré que le classement sort en anonyme à l'octet près, et
028 a retiré la condition — ce qui supprime un mode de panne entier : le
vendredi où le jeton est mort, le classement de toute l'équipe est relevé quand
même.

**L'échec est ligne à ligne.** La passe consigne « 7 relevés sur 8, licence X
muette », et son issue n'est `echec` que si aucune ligne n'aboutit : sans cela,
un seul coéquipier qui change de club ferait tomber le classement de toute
l'équipe. Le succès vide de 019 descend du même coup au niveau du joueur — celui
dont l'action ne rend rien est muet, même si les autres parlent.

Le planificateur la déclenche chaque vendredi à 1 h du matin (018), et l'import
de l'équipe l'enchaîne dans la foulée (028). La lancer à la main se fait sur
`/sources`, par la colonne **Lancer** du tableau d'ordonnancement — sur
l'écran d'exploitation, jamais sur `/mon-profil`, où un bouton mettrait le
plafond d'un passage par jour entre les mains de l'utilisateur (037, 001).

## La porte

Fermée — spec 021. `socle/core/authentification.ts` porte la politique, ses deux
adaptateurs le chiffrement, `routeur-connexion.ts` le garde et le formulaire.

| Pièce | Où |
|-------|-----|
| fenêtre de session, plafond, portier | `socle/core/authentification.ts` |
| le jeton signé (JWT HS256) | `infrastructure/authentification/jeton-hmac.ts` |
| le haché du mot de passe (scrypt) | `infrastructure/authentification/mot-de-passe-scrypt.ts` |
| le compte unique | `base/depot-compte-sqlite.ts`, `migrations/008__compte.sql` |
| le garde et le formulaire | `presentation/routeur-connexion.ts` |

Le garde est monté avant toutes les routes, dans `serveur.ts` : aucune route
ajoutée ensuite ne peut l'oublier. Deux chemins seulement répondent sans jeton —
`/connexion`, et `/sante`, que le superviseur interroge sans session. `/sante`
est d'ailleurs réduite à `{"statut":"ok"}` tant qu'on n'est pas entré : la
taille de la base ne regarde personne d'autre.

**Aucune session en base.** La vérification est une signature, pas une lecture.
Le jeton porte deux dates et c'est tout le mécanisme : `exp` glisse de 30 jours
à chaque visite, `cnx` ne bouge jamais et plafonne la session à 90 jours. Sans
ce plafond, une échéance glissante serait une échéance infinie, et un cookie
volé dont le voleur se sert tous les jours ne mourrait jamais. Le cookie est
`HttpOnly`, `Secure`, `SameSite=Strict` — ce dernier faisant aussi office de
protection CSRF pour tous les formulaires de `/sources`.

**La licence n'est pas un secret** : elle est sur myffbad et dans les résultats
de tournoi. Tout tient donc au mot de passe, d'où la limitation des tentatives —
cinq échecs, puis un verrou d'une minute qui double jusqu'à un quart d'heure. Le
compteur est global et en mémoire : il n'y a qu'un compte, compter par adresse
se contourne en changeant d'adresse, et le prix assumé est qu'un tiers peut
m'enfermer dehors quelques minutes.

Le mot de passe vient de la configuration et y reste la référence :
`BABO_MOT_DE_PASSE` est relu à chaque démarrage et le haché en base réécrit s'il
a changé. Pas d'écran de changement, donc pas de chemin de récupération à
inventer. Le secret de signature (`BABO_SECRET_JETON`) vit à côté ; le faire
tourner invalide toutes les sessions d'un coup, et c'est le seul levier de
révocation qu'un jeton sans état autorise.

Ni `jsonwebtoken` ni `bcrypt` : un HMAC sur deux segments encodés et le scrypt
de Node suffisent, et la dépendance coûterait plus à auditer que les quarante
lignes qu'elle remplace. Trois précautions valent d'être connues, elles sont
dans le code et dans ses tests : l'algorithme annoncé par le jeton n'est jamais
cru sur parole — `alg: none` est refusé —, la comparaison des signatures est à
temps constant, et un mot de passe est vérifié même quand le compte n'existe
pas, pour que le temps de réponse ne renseigne personne.

## Le planificateur

Un seul, dans le processus, pour les deux natures de tâches — spec 018 :
`socle/core/ordonnancement.ts`, ses deux dépôts dans
`socle/infrastructure/base/`, sa table de bord sur `/sources`.

| Pièce | Où |
|-------|-----|
| cadences, fenêtre de grâce, réessais, boucle de réveil | `socle/core/ordonnancement.ts` |
| le réglage d'une tâche, en base | `depot-reglages-sqlite.ts` |
| ce qui reste à exécuter | `depot-echeances-sqlite.ts` |
| les deux tables | `migrations/007__ordonnancement.sql` |
| la déclaration des tâches | `src/main.ts` |

Il ne connaît aucune tâche : `main.ts` les lui donne, comme il donne ses modules
au serveur. Cinq aujourd'hui — la passe de classement, le vidage de la boîte d'envoi (016),
le battement hebdomadaire (019), les engagements badnet (027) et le lieu de ces
tournois (002) —, et les rappels de 014 s'ajouteront à une ligne.

**Tout passe par une échéance**, périodique ou ponctuelle : une ligne en base,
unique sur (tâche, heure prévue). C'est cet index, et rien d'autre, qui tient
la promesse de 018 — un redémarrage ne perd pas un rappel et ne le renvoie pas.
Une occurrence close ne redevient jamais due, même réinscrite.

**La fenêtre de grâce décide du rattrapage.** Au réveil, une échéance dépassée
de plus que sa grâce est abandonnée sans être exécutée, et consignée en échec :
un rappel J-1 envoyé à J+2 est pire qu'un rappel manquant. Large pour une passe
dont la donnée est simplement périmée (48 h pour le classement), nulle pour le
battement de 019, qui mentirait s'il était rattrapé. Nulle veut dire « à l'heure
dite », pas « impossible » : la tolérance ne descend jamais sous un battement,
parce que le planificateur ne se réveille qu'à la minute.

**Un échec est rejoué deux fois, à une heure puis à quatre**, chaque tentative
laissant son rapport. Borné : un scraper qui boucle vaut un compte banni (015).
Un *succès vide* au sens de 019, lui, n'est pas rejoué — une classe CSS qui a
changé ne se répare pas en réessayant, et le rapport suffit à le dire.

Les cadences et les grâces sont des données, modifiables depuis `/sources` :
c'est ce qui a fait écarter le cron système, dont la configuration s'édite hors
de l'application. Les valeurs de départ sont posées au premier démarrage et ne
recouvrent jamais un réglage modifié depuis.

**Chaque tâche se déclenche aussi à la main — spec 037.** Une colonne
**Lancer** sur le tableau d'ordonnancement appelle `executerMaintenant`, qui
joue la passe aussitôt, grâce ignorée, et consigne son rapport sous
l'identifiant de la tâche par le même chemin qu'un réveil. Elle ne touche à
aucune échéance : la passe prévue reste planifiée, telle quelle. Coup unique,
sans réessai : un échec se lit dans le rapport
aussitôt, et on relance à la main. Le verrou `enCours` du réveil est partagé :
un déclenchement pendant une passe attend qu'elle finisse puis joue la sienne,
sans jamais se superposer à elle ni aux requêtes du compte (015). L'import de
l'équipe (028, 005) enchaîne sa passe par ce même geste, et les anciens boutons
`/classement`, `/engagements`, `/tournois` ont disparu : toute passe passe par
le planificateur. Règle uniforme, une exception — le battement n'a pas de
bouton, son silence étant l'information que 019 préserve ; une tâche inconnue
répond 404, une suspendue, une ponctuelle (014) ou le battement 400.

## Le courrier

L'envoi de mail — spec 016. `socle/core/courrier.ts` porte la boîte d'envoi,
`infrastructure/courrier/` le transport, `/sources` la section « Courrier ».

| Pièce | Où |
|-------|-----|
| la boîte d'envoi : dépôt, reprises, abandon | `socle/core/courrier.ts` |
| le transport SMTP | `infrastructure/courrier/transport-nodemailer.ts` |
| la file, en base | `base/depot-courrier-sqlite.ts`, `migrations/009__courrier.sql` |
| le compte SMTP | `core/configuration.ts`, `BABO_SMTP_*` et `BABO_MAIL_*` |

**Tout message est écrit en base avant d'être remis**, en développement comme
en production. Le mode « écrit plutôt qu'envoyé » que 016 exige en test n'est
donc pas un adaptateur de plus : c'est le cas où personne ne vide la file. Un
seul chemin de code, et un réessai qui ne rejoue pas la tâche appelante — un
mail raté pendant une passe de scraping ne doit pas relancer le scraping, ni le
compte qui va avec (015).

Un message est remis **dès son dépôt**. Une alerte de tournoi (013) vaut par les
heures qu'elle fait gagner, et la faire patienter jusqu'au prochain réveil du
planificateur serait une symétrie payée cher.

**Les reprises sont des échéances ponctuelles**, à cinq puis à trente minutes,
inscrites par le courrier lui-même. Cela donne l'espacement exact sans ajouter
de cadence périodique à 018, cela survit à un redémarrage — ce sont des lignes
en base —, et cela évite qu'un balayage toutes les cinq minutes écrive trois
cents rapports par jour disant « rien à faire ». Toutes les reprises d'un même
vidage tombent à la même seconde : l'index (tâche, date prévue) de 018 les fond
en une seule échéance. Un balayage **quotidien** subsiste et ne ramasse que les
orphelins — le message écrit juste avant un arrêt brutal, qui n'a eu ni
tentative immédiate ni reprise inscrite. Trois tentatives, puis abandon
consigné : sans plafond, une panne de transport devient une file qui grossit
sans fin, et quinze alertes périmées partent d'un coup au retour du service.

C'est ce vidage qui a demandé un amendement à 018 : `executer` rend désormais
`RapportArchive | null`, et une tâche qui n'a rien eu à faire ne consigne rien.

**Sans configuration SMTP, l'application démarre quand même** : les messages
s'empilent, personne ne les remet, et `/sources` le dit. Motif de
`BABO_MYFFBAD_MOT_DE_PASSE` — une capacité facultative se dégrade. La
configuration est tout ou rien : une moitié de réglages ferait croire qu'on
alerte alors qu'on n'alerte pas, le mode de panne même que 019 combat.

Gmail exige un **mot de passe d'application**, donc la validation en deux étapes
sur le compte. Le port 465 n'est pas un détail : le chiffrement s'en déduit, TLS
dès le premier octet, sans bascule `STARTTLS` où les identifiants pourraient
partir en clair. `nodemailer` a été pris parce qu'il n'a **aucune dépendance
transitive** — l'argument qui avait condamné `jsonwebtoken` et `bcrypt` (021) ne
tient pas contre lui.

**Un seul destinataire, moi.** 008 a retiré les mails des coéquipiers de
l'import de 005 ; il n'y a personne d'autre à qui écrire, et le critère de
délivrabilité sur lequel 016 devait trancher s'est effondré avec. HTML
obligatoire, texte facultatif, sujet préfixé de `[Babo] ` pour qu'un filtre s'y
pose une fois pour toutes. Rien n'est purgé.

Le dialogue SMTP est testé contre un faux serveur local, sur les deux façons
dont une alerte se perdrait en silence : authentification refusée, connexion
coupée en plein dialogue. Ce serveur écoute en clair — **TLS n'est pas
couvert**, et c'est le trou assumé de ce choix.

## Les engagements

Spec 027. Mes inscriptions de tournoi, relevées sur badnet sous session.

| Pièce | Où |
|-------|-----|
| la notion et son port | `socle/core/engagement.ts` |
| la passe | `socle/core/passe-engagements.ts` |
| les parseurs badnet | `infrastructure/acquisition/badnet.ts` |
| la chaîne de sauts | `infrastructure/acquisition/engagements-badnet.ts` |
| les deux tables | `migrations/011__engagement.sql` |

**badnet sert toutes ses pages en coquille.** `GET <url>` rend la navigation et
une ancre `id="default_page"` portant l'identifiant de l'action qui charge le
contenu ; un POST sur `/index.php` rend le fragment. La fiche d'un tournoi
ajoute un saut : son fragment porte un `autoload` qui réclame l'inscription avec
l'identifiant du tournoi. Deux requêtes pour la liste, trois par fiche.

**Aucun identifiant d'action n'est écrit en dur.** Ils changent avec le
déploiement, et se relèvent sur la page qui les porte. C'est ce qui coûte ces
sauts, et ce qui évite qu'un redéploiement fasse tomber la passe en silence — la
seule exception restant `ACTION_RECHERCHE`, dont la panne se verrait dès le
lendemain dans un rapport.

**La chaîne vit dans l'infrastructure, pas dans le `core`.** La passe dit
« liste les tournois, puis donne-moi chaque fiche » ; c'est l'adaptateur qui
sait par combien de sauts il l'obtient. Un couple `requete`/`lire` statique,
comme ceux de `ModuleDAcquisition`, ne sait pas exprimer une chaîne dont chaque
appel dépend d'un identifiant relevé sur le précédent.

**Les tableaux se lisent sur le formulaire de modification, pas sur le résumé** :
celui-ci dit « Oui (tableaux cachés par l'organisateur) » dès que l'organisateur
les masque, ce qui est courant. Le formulaire porte toujours ma propre
inscription — tableau en option sélectionnée, partenaire dans `partnaird`. Une
ligne par tableau en base : un même tournoi se joue en double *et* en mixte,
avec deux partenaires différents.

**Remplacement intégral, mais jamais sur une passe muette.** Une inscription
annulée doit disparaître ; vider l'agenda parce que la session est morte serait
pire que ne rien faire. Et **aucun engagement est un succès**, pas une
extraction vide : on ne s'engage pas toute l'année, et 019 alerterait à chaque
intersaison.

**Le lieu n'est pas dans cette source.** `/competitions` donne le nom, la date
et le type ; jamais la ville. 002 a tranché le 5 septembre : elle vient de la
**fiche publique du tournoi**, et non de l'index de 012. Celui-ci la porte bien
— le parseur de la recherche rend déjà `place` —, mais il est géographique : il
rend les tournois d'un rayon, pas les miens.

## Les prochains tournois

Spec 002. La page qui affiche les engagements de 027, et la passe anonyme qui
va chercher ce qui leur manque.

| Pièce | Où |
|-------|-----|
| le tri, le filtre « à venir », l'intitulé d'un engagement | `mon-profil/core/prochains-tournois.ts` |
| la notion de tournoi et le libellé des dates | `socle/core/tournoi.ts` |
| la passe des lieux | `socle/core/passe-tournois.ts` |
| la chaîne publique et ses parseurs | `infrastructure/acquisition/tournois-badnet.ts`, `badnet.ts` |
| les deux tables | `migrations/012__tournoi.sql` |

**badnet a une troisième face, et elle ne ressemble à aucune des deux autres.**
027 avait établi que « toute page de badnet est une coquille avec une ancre
`default_page` » : c'est vrai de l'application authentifiée, faux du site
public. Trois pièges, payés un par un le 5 septembre 2026 :

- **l'adresse**. `/tournoi/public?eventid=…`, celle que la recherche publie dans
  son JSON, ne rend qu'une coquille vide — c'est une URL d'affichage. La fiche
  est sur `/tournoi/public/informations` ;
- **l'action**. La coquille publique n'a pas de `default_page` ; elle porte
  `data-inside_page` sur un `div` de `#main` ;
- **le jeton anti-CSRF**. badnet pose `ic_csrf` en cookie au premier contact et
  le réclame **aussi** dans le corps du POST.

Le premier relevé, écrit sur le motif de 027, a rapporté 8 Ko de page d'accueil
commerciale — ni erreur, ni redirection, ni `default_page`. C'est la capture
archivée qui l'a dit, et la requête réelle d'un navigateur qui a donné les trois
correctifs.

**Trois requêtes, anonymes de bout en bout.** Les cookies sont obtenus à
l'instant et jetés avec la fiche : aucun compte n'est engagé, donc aucun risque
de bannissement (015), et la passe aboutit le jour où la session badnet est
morte — comme celle du classement depuis 028. D'où sa tâche à elle,
`acquisition:badnet:tournois`, troisième nom sous badnet.

**Le même `div` porte deux actions, et 002 n'en lisait qu'une** — spec 036.
`data-inside_page` charge l'onglet « Présentation », `data-ic_a` charge
l'**enveloppe** : le bandeau du tournoi, avec sa ville nommée, ses dates en ISO
dans `data-datedata`, et l'ouverture comme la fermeture des inscriptions à
l'heure près. C'est elle qui fait foi désormais ; la carte « Gymnases » ne sert
plus qu'au nom de la salle, à son adresse, et au détail des journées — qui
priment quand elle existe, l'enveloppe ne donnant que deux bornes.

**Un tournoi sans salle est un tournoi normal.** Sept fiches sur neuf, relevées
le 9 septembre 2026, n'ont aucun gymnase : l'organisateur réserve après avoir
publié. `gymnase`, `adresse` et `ville` sont donc nullables, et la phrase
« Aucun gymnase renseigné » est lue comme le signal explicite qu'elle est. Avant
036, la passe échouait sur trois tournois sur quatre et 019 alertait pour une
panne qui n'en était pas une.

**Incrémentale.** Une ville ne change pas : un tournoi déjà connu n'est jamais
redemandé. La plupart des jours la passe ne coûte aucune requête et consigne
« 4 connus, aucun à relever » — un rapport de quelques octets, mais qui empêche
le battement du lundi de la croire muette. Elle tourne à 5 h 30, juste après les
engagements, **sans enchaînement** : personne ne regarde l'écran à cette heure,
et coupler les deux remettrait une requête anonyme dans le sillage d'une passe
sous session.

**Elle rend l'intervalle que 027 croyait inexistant.** `/competitions` ne donne
qu'une date, et 027 en avait conclu qu'aucune source n'en donnait davantage ; la
fiche publique liste une ligne par jour joué. La page écrit donc « du 24 au
25 octobre » là où elle aurait perdu la moitié du week-end. Le **tri**, lui,
reste sur la date de `/competitions` — la seule dont on dispose toujours.

**La table `tournoi` est le début de l'index de 012.** Cette spec-là disait « la
première des deux traitée la paiera pour l'autre » : 002 est passée devant. Elle
n'écrit que le lieu et les journées ; 012 y ajoutera la date limite, les
tableaux proposés et les classements admis. Séparée d'`engagement` à dessein —
un tournoi existe indépendamment de mon inscription, et recopier la ville sur
l'engagement en ferait deux versions du même fait.

**La ville se lit derrière le code postal.** Seule découpe fiable d'une adresse
saisie à la main, où le nom de rue peut contenir des chiffres — « 188 Rue Armand
Silvestre » en est l'exemple. Sans code postal, aucune ville n'est rendue : la
page sait dire « lieu non relevé », elle ne doit pas afficher le dernier mot
d'une rue.

**Aucun chevauchement n'est signalé.** 002 le promettait ; c'est retiré, et le
« Résolu quand » de la spec est amendé. Sur douze lignes triées par date, l'œil
le fait mieux qu'une règle — et une règle appuyée sur une date sans durée se
tairait sur un tournoi de trois jours qui en recouvre un autre, tout en criant
au conflit sur deux tableaux du même tournoi.

**La fraîcheur se lit sur le dernier succès de la passe des engagements**, d'où
le `dernierSucces` ajouté à `DepotRapports`. La date écrite à côté des lignes ne
pouvait pas servir : le remplacement intégral vide la table en intersaison, et
la trace de la réussite partirait avec les lignes — la page dirait « jamais
relevé » le lendemain d'une passe parfaite. Une seule mention, celle des
engagements : un lieu ne périme pas.

**Le statut s'affiche tel quel.** 002 et 027 se sont renvoyé la question d'une
échelle des inscriptions en attente ; la réponse est qu'il n'y en a pas. Trois
phrases observées sur un tournoi ne font pas une taxonomie.

**`/sources` a rendu la liste à la feature** et n'en garde que le décompte et le
rapport : l'écran d'exploitation porte les gestes, la feature porte la donnée
(030).

## La veille

Spec 012. Des recherches nommées qu'on garde, et qui interrogent badnet chaque
matin.

| Pièce | Où |
|-------|-----|
| la veille, sa fenêtre, sa validation | `veille/core/veille.ts` |
| le filtrage local et la distance | `veille/core/resultats.ts` |
| le dépôt des veilles | `veille/infrastructure/depot-veilles-sqlite.ts` |
| l'index, la passe, l'appartenance | `socle/core/passe-veilles.ts` |
| la recherche publique branchée | `infrastructure/acquisition/veilles-badnet.ts` |
| les quatre tables | `migrations/014__veille.sql` |

**Une veille n'est pas une configuration du formulaire badnet.** « DH » et
« D7 D8 D9 » s'y traduisent ; « moins d'une heure en transports depuis Paris »
et « proche de la mer » n'existent nulle part chez lui — ils attendent 034. La
veille porte donc un modèle à elle, et c'est `main.ts` qui le traduit en
critères de requête, comme il traduit déjà les licences suivies de 028.

**Une collecte par veille, cinq au plus.** Écartée, l'idée d'indexer largement
une fois pour filtrer ensuite : elle évitait le rattrapage de 013 à chaque
veille nouvelle, mais supposait de couvrir le périmètre de toutes les veilles
présentes *et futures*, donc la France entière. Cinq veilles, c'est cinq
requêtes ; le volume ne justifie pas de collecter ce que personne ne regarde.

**On ne pousse à badnet que ce qui a été vérifié** : la zone, `coming`, le type,
les catégories d'âge et les disciplines — dont le OU est exact. Pas les cases de
classement : `nc=1` seul ne filtre rien, et `n=1` retient des tournois dont le
`clt` dit `NC` tout en écartant un national dont le `clt` dit `N`. Un filtre
dont on ignore la portée écarte des tournois sans qu'on sache lesquels.

**Les tableaux et les séries se lisent sur la fiche, jamais sur la recherche.**
Le champ `clt` ne rend que des familles, et se trompe — un tournoi annoncé `N`
dont la fiche exclut N1. La fiche donne les rangs un par un, et nomme les
tableaux : huit codes observés, dont `ST` et `SI` rangés tels quels faute
d'équivalent, et `DX` traduit en `MX` parce que `tableau.ts` documente déjà
cette orthographe.

**Une table `tournoi` partagée, une appartenance par veille.** Le même tournoi
apparaît dans trois veilles sur cinq ; en garder trois exemplaires ferait trois
villes du même fait. Ce qui est propre à la veille — depuis quand elle le voit,
et si elle a alerté — vit dans `veille_tournoi`. **Une sortie s'y date, elle ne
s'efface pas** : avec une requête par veille, l'absence a deux sens — annulé, ou
hors critères —, et seule une appartenance datée les distingue. C'est ce qui
garde les rappels de 014 quand on resserre un rayon, et ce qui empêche un
tournoi qui sort puis rentre de réalerter (013).

**Deux sources, deux moitiés de la même ligne.** La recherche écrit le nom, les
coordonnées et la date limite ; la fiche écrit le lieu, les journées, les
tableaux et les séries. Chaque écriture ne nomme que ses colonnes : sans cela,
le premier relevé de fiche effacerait la date limite sur laquelle la veille
filtre, et le tournoi disparaîtrait d'elle sans que rien ne le dise. C'est
`fiche_relevee_le`, et non l'existence de la ligne, qui dit à la passe des
fiches ce qui lui reste à faire.

**La distance se calcule ici.** Le champ `distance` de badnet est vide deux fois
sur trois et faux quand il ne l'est pas — 9 km annoncés pour 1,6 km réels. Son
`rayon`, lui, coupe juste : vérifié, 47 marqueurs tous dans les 50 km demandés.
Le filtre local n'est donc pas une correction mais une ceinture, utile le jour
où l'on resserre une veille — l'index garde l'ancien périmètre jusqu'au
lendemain.

**Une tâche, `acquisition:badnet:veilles`, à 5 h 15** — entre les engagements de
5 h et les fiches de 5 h 30, sans enchaînement. Échec ligne à ligne : « 4
veilles sur 5, "Tournois en région" muette ». Et l'écart entre ce que badnet
annonce et ce qu'il géolocalise est consigné à chaque passe, le jour où il
cesserait de placer ses tournois sur sa carte.

**La passe des fiches est plafonnée** à cent par passage. Douze tournois par
saison ne demandaient pas de borne ; une veille en apporte vingt-trois le
premier jour, et une veille large en apporterait cent — trois cents requêtes
d'affilée sont la seule façon de se faire remarquer d'un site qui ne demandait
rien.

**Un tournoi qui ne déclare rien est montré à part, jamais écarté.** Ce sont les
tournois fraîchement publiés, donc ceux que 013 existe pour attraper et ceux qui
se remplissent le plus vite. « Indéterminé » n'est pas « pas pour moi ».

## L'observabilité

Spec 019. Le mode de panne d'un scraper n'est pas l'exception, c'est le **succès
vide** : la page répond, le parseur s'exécute sans rien lever, mais une classe
CSS a changé et il n'extrait plus rien. Une exception se voit ; un parseur
devenu aveugle ne se voit pas.

| Pièce | Où |
|-------|-----|
| l'alerte, décorateur du dépôt de rapports | `socle/core/alerte.ts` |
| le battement hebdomadaire | `socle/core/battement.ts` |
| la péremption vue des pages métier | `socle/core/fraicheur.ts` |
| la mention à l'écran | `socle/presentation/vues/peremption.ejs` |
| l'historique et la section « Exécutions » | `presentation/vues/parametres/logs.ejs` |
| le rejeu d'une capture | `src/capture.ts`, `npm run capture` |

**L'alerte est un décorateur, pas un appel.** `enAlertant` enveloppe
`DepotRapports` et compare l'issue à la précédente : c'est le choix déjà fait
pour les requêtes sortantes de 015, et pour la même raison — une passe qui
pourrait oublier d'alerter alerterait moins bien qu'une passe qui ne le peut
pas. Les passes quotidiennes de 015 s'y brancheront sans une ligne de plus.

**Un mail à l'entrée en panne, pas à chaque panne.** 019 disait « toute panne
déclenche un mail » ; un parseur aveugle le reste jusqu'à correction, et un mail
quotidien identique se filtre en trois jours — une alerte qu'on filtre est pire
qu'une alerte absente. La sortie de panne est annoncée aussi : sans elle, on ne
saurait jamais si le silence veut dire réparé ou toujours cassé.

**Le courrier ne s'alerte jamais lui-même.** 016 l'écrit : un échec d'envoi ne
peut pas être signalé par mail. Sans cette exclusion, un vidage en échec
déposerait un message, dont le dépôt consignerait un rapport, qui déposerait un
message. L'ordre de construction dans `main.ts` rend d'ailleurs la boucle
impossible à écrire par accident : le décorateur a besoin du courrier, qui
existe donc avant lui et reçoit le dépôt nu.

`consigner` **reste synchrone**, et l'alerte part sans être attendue : c'est ce
qui permet aux passes de consigner sans devenir asynchrones. Rien n'est perdu —
l'écriture en base est la première instruction de `deposer`, donc le message
existe avant que la promesse ne suspende.

**Le battement est le seul mécanisme dont le silence soit une information.** Le
lundi à 8 h, quand on lit ses mails, grâce nulle (018) : rattrapé le mardi, il
mentirait sur la date à laquelle il a constaté ce qu'il annonce. Il nomme les
tâches qui n'ont jamais tourné — une tâche absente du rapport est une tâche dont
on ne saura jamais qu'elle s'est tue — et distingue la **dernière donnée** du
dernier réveil, une passe qui échoue depuis trois semaines ayant tourné hier
sans rien rapporter de neuf. Son issue reste `succes` même quand il n'annonce
que des pannes : un `echec` enverrait une alerte pour dire qu'on a bien alerté.
C'est lui, enfin, qui ferme le trou laissé par l'alerte à l'entrée seule.

**La péremption se juge sur la cadence de la tâche qui alimente la page**, lue
dans les réglages de 018 : aucun seuil nouveau, et une cadence modifiée depuis
`/sources` déplace le seuil sans redémarrage. Jamais une ancienneté globale —
les scrapings tombent indépendamment. La mention ne s'affiche qu'en retard réel :
un « donnée fraîche » permanent deviendrait un élément de décor. Et « jamais
relevée » n'est pas « périmée », les pages disant déjà la première en toutes
lettres (001, 028).

**Le rejeu est un script, pas un écran.** `npm run capture` liste les dernières
captures par source, `npm run capture -- <id>` en écrit une dans
`acquisition/exemples/`, sans jamais écraser un fichier existant — les fixtures
de ce dossier sont choisies à la main. Corriger un parseur est un geste de
développement, et la base étant chiffrée, « ouvrir le fichier » supposerait
sinon un client SQLCipher et la clé sous la main.

**Rien n'est purgé** — captures, rapports, messages. Une ligne de rapport pèse
quelques dizaines d'octets et le battement annonce la taille de la base : si la
croissance devient un problème, la mesure le dira avant que l'estimation ne le
devine.

## L'équipe

Deuxième donnée métier, et la première d'une feature — spec 005. Elle vit dans
`capitanat`, qui garde son `Coequipier` sans le faire monter dans le socle
(022) :

| Pièce | Où |
|-------|-----|
| la notion — licence, sexe, téléphone — et son port | `capitanat/core/coequipier.ts` |
| le parseur du CSV | `capitanat/infrastructure/csv-equipe.ts` |
| le dépôt | `capitanat/infrastructure/depot-coequipiers-sqlite.ts` |
| les tables | `migrations/004__coequipier.sql` et `005__identite.sql` |
| la page | `capitanat/presentation/` |

Le dépôt n'est pas monté par la persistance du socle, qui ne connaît aucune
feature : c'est `main.ts` qui lui passe la base — la même base, la seule.
La migration, elle, est dans le socle, parce qu'aucune feature ne persiste
hors de là.

Trois colonnes, et exactement celles que myffbad ne publie pas : la sonde de
015 a montré que la fiche ne porte aucun genre et aucune coordonnée. Le nom et
le classement, eux, se relèvent — 028, et ils vivent dans le socle, pas ici :
un nom fédéral n'a pas une version vue par `capitanat` et une autre vue par
`mon-profil`. Le mail n'existe nulle part, et 015 est amendée sur ces deux
points. Le sexe reste au CSV : il n'est ni sur la fiche, ni dans les 85 clés de
l'action `classement`, ni dans les résultats — qui rendent une discipline et une
série, jamais `SH` ni `SD`.

L'import se fait depuis `/sources`, l'écran d'exploitation, comme la passe de
001 : le contenu du fichier est posté en `text/csv` par dix lignes de JS et lu
par `express.text()` — pas de multipart, donc pas de `multer`, et le fichier de
coordonnées n'atterrit jamais sur le disque. **Tout ou rien** : une licence mal
formée, un sexe hors `F`/`M`, un téléphone vide, un doublon ou un octet qui
n'est pas de l'UTF-8 refusent l'import entier, l'écran nommant chaque ligne et
sa raison. Et **remplacement intégral** : un coéquipier absent du fichier est
supprimé, avec ses relevés de classement — garder « au cas où » les
coordonnées de quelqu'un qui ne joue plus ici est précisément ce qui rendrait
une fuite impardonnable.

L'import enchaîne une passe : on dépose huit lignes, on lit huit noms. C'est ce
qui rend visible une licence bien formée mais erronée — elle rapporte le nom et
le classement de quelqu'un d'autre, et seul le nom affiché le dit. Le parseur
refuse d'ailleurs la fiche qui répond pour une autre licence que celle
demandée : c'est le seul contrôle qui sépare « je me suis trompé de numéro » de
« j'ai attribué un classement à la mauvaise personne ».

## Les forces par tableau

Première lecture qui ne se contente pas d'afficher ce qui est en base : elle en
dérive — spec 029. `/capitanat` est devenu un index, et cinq pages s'ouvrent
sous `/capitanat/tableau/<code>`, une par tableau de la feuille de match.

| Pièce | Où |
|-------|-----|
| l'intitulé d'un tableau | `socle/core/tableau.ts` |
| le format, l'éligibilité, l'ordre, le manque | `capitanat/core/forces-par-tableau.ts` |
| l'accord grammatical des places | `capitanat/presentation/mots.ts` |
| l'index et la page d'un tableau | `capitanat/presentation/vues/` |

Aucune table, aucune saisie, aucune source nouvelle : le sexe vient du CSV de
005, la cote et la lettre de la passe de 028. C'est ce qui sépare cette spec de
010, qui attend une déclaration des joueurs, et de 011, qui attend le règlement
modélisé.

**L'unité de compte est la place, pas le match.** Deux SH sont deux matchs à un
joueur chacun, un DH un seul match à deux joueurs, et les deux réclament
pourtant deux hommes. Le manque se compte donc par sexe — seule façon de dire
qu'un mixte de trois hommes reste infaisable. Six matchs, cinq tableaux, neuf
places : le format de la division est écrit en dur dans `FORMAT`, et 029 laisse
ouverte la question de savoir si 011 le portera le jour où la division change.

**Le sexe décide qui est concerné, le classement décide seulement du rang.**
Une femme n'est pas « écartée du DH faute de classement » : elle n'y joue pas.
Un homme sans classement en simple, lui, est nommé à part et jamais rangé
dernier — en début de saison, c'est presque toujours une licence fausse, pas un
joueur faible, et les deux motifs sont distingués à l'écran.

**Les cinq listes ne se cumulent pas**, et les pages le disent : un joueur
figure dans tous les tableaux où il est éligible sans faire pour autant les six
matchs. Les additionner surestimerait la profondeur de l'effectif, ce qui serait
le pire défaut d'un écran censé montrer des manques.

## Les paires du capitaine

Spec 030. Les cinq pages de 029 rangeaient des joueurs ; le DH, le DD et le MX
se jouent en paires, et **une paire n'a pas de classement fédéral**.

| Pièce | Où |
|-------|-----|
| la paire, la marque, l'ordre en deux blocs | `capitanat/core/paires.ts` |
| le dépôt | `capitanat/infrastructure/depot-preferences-sqlite.ts` |
| les deux tables | `migrations/010__paire.sql` |
| les routes d'écriture et les formulaires | `capitanat/presentation/` |

**029 n'a pas bougé.** `paires.ts` prend son résultat et pose une couche
par-dessus. C'est ce qui garde l'ordre de force lisible comme un fait : la marque
s'ajoute à côté, elle ne le corrige pas.

**Une paire est deux licences, rien de plus.** Son tableau se déduit des sexes —
deux hommes DH, deux femmes DD, un de chaque MX —, et comme 005 n'accepte que
`F` ou `M`, il n'existe pas de couple sans tableau. Le stocker permettrait de
l'écrire faux ; le déduire rend la ligne fausse impossible. Les deux licences
sont rangées en base, `licence_a < licence_b` : c'est cette contrainte, avec
l'index d'unicité, qui fait voir le doublon — « Dupont avec Martin » et « Martin
avec Dupont » sont la même décision.

**L'ordre d'une paire est la moyenne des deux cotes**, dans la discipline du
tableau. La moyenne parce qu'elle se compare à une cote individuelle ; sur les
cotes et non sur les séries parce que deux paires « D8 + D9 » peuvent valoir
deux cent cinquante points d'écart, et que c'est l'écart qu'on cherche. Cet
ordre bouge à chaque publication du CPPH, et c'est assumé. Une paire dont un
membre n'est pas classé dans la discipline sort de l'ordre et est nommée à part
— même raison que les écartés de 029 : la ranger dernière ferait disparaître
l'anomalie.

**La marque range en deux blocs, les marqués d'abord**, chaque bloc gardant son
ordre de cote. Ni une étoile — privilégier n'est pas décorer —, ni un bonus de
points, qui produirait un ordre qui ne serait ni celui du classement ni celui du
capitaine. Le mécanisme est un tri qui ne compare que la marque, appuyé sur la
stabilité garantie de `Array.prototype.sort`. C'est un booléen : une échelle
demande d'être calibrée et personne ne la recalibre. Il se pose sur une paire,
ou sur un couple (joueur, tableau) — le même joueur se marque indépendamment en
SH, en DH et en MX, parce que ce qu'on privilégie n'est pas un joueur mais un
joueur à cette place.

**Les premières écritures d'une feature.** Jusqu'ici `capitanat` lisait et
affichait, tout geste d'écriture vivant sur `/sources`. La frontière n'a pas
bougé : `/sources` porte l'exploitation — charger un fichier, relancer une
passe —, alors que saisir une paire *est* la feature, et la mettre là-bas aurait
séparé la décision de ce qu'elle éclaire. Aucun jeton anti-CSRF : le
`SameSite=Strict` de 021 couvre ces formulaires comme les autres. Chacun poste
la valeur voulue et non « l'inverse de ce qui est écrit », donc un double envoi
ne fait pas clignoter la marque.

**Ce qui disparaît avec le joueur.** L'import de 005 emporte ses paires et ses
marques, comme il emportait déjà ses relevés et son nom. Une paire désigne deux
personnes ; en garder une moitié orpheline n'aurait même pas de sens à l'écran.

**Ce que le capitaine marque n'est pas ce que le joueur déclarera.** 010 portera
les tableaux souhaités, refusés, et les partenaires privilégiés du joueur
lui-même. Les deux peuvent se contredire, et ce désaccord est une information :
il se lit en mettant les deux côte à côte, jamais en les fusionnant.

## Le calendrier d'interclub

Le calendrier de la saison de mon équipe, lu sur icbad — la page publique d'un
groupe (`/competition/<id>/tableau/<id>`), qui liste toutes les rencontres :
journée, date et heure, gymnase, équipe qui reçoit, équipe qui se déplace.

| Pièce | Où |
|-------|-----|
| la notion — rencontre, équipe, calendrier — et son port | `capitanat/core/calendrier.ts` |
| le parseur de la page de groupe | `capitanat/infrastructure/calendrier-icbad.ts` |
| la page réelle, en fixture | `capitanat/infrastructure/exemples/icbad-groupe.html` |
| le dépôt | `capitanat/infrastructure/depot-calendrier-sqlite.ts` |
| les tables | `migrations/016__calendrier_interclub.sql` |
| le geste | `/parametres/calendrier`, branché dans `main.ts` |
| la liste | `/capitanat` |

**Un geste, pas une tâche.** Le calendrier se fixe en début de saison : une
passe ordonnancée relirait chaque nuit une page figée. On l'importe à la main,
et de nouveau si le comité déplace une rencontre. L'import remplace tout, et
c'est tout ou rien : un code d'équipe absent du groupe refuse l'import en
nommant les équipes présentes, plutôt que d'écrire un calendrier vide.

icbad n'est pas une source au sens de 015 — ni session, ni module
d'acquisition, ni ordonnancement : c'est un `SITES_PUBLICS` de
`socle/core/source.ts`. Sa réponse s'archive pourtant comme les autres (019),
et l'import laisse un rapport sous `acquisition:icbad:calendrier`, consigné
sans passer par l'alerte : l'échec d'un geste se lit sur l'écran qui l'a
lancé. L'URL est vérifiée avant toute requête — le serveur ne lit que la page
d'un groupe icbad, jamais une adresse qu'on lui tendrait.

La page ne donne que le jour et le mois : l'année se déduit de la saison
sélectionnée (`switchSaison`), l'automne étant l'année de la saison, l'hiver
la suivante.

## Les disponibilités

Spec 008, par la voie qu'elle retient : un sondage hors de l'outil, dont
l'export CSV s'importe depuis `/parametres/disponibilites` et se lit en grille
sur `/capitanat/disponibilites`, une colonne par rencontre du calendrier.

| Pièce | Où |
|-------|-----|
| la notion — réponse, répondant, grille — et son port | `capitanat/core/disponibilite.ts` |
| le parseur de l'export | `capitanat/infrastructure/csv-disponibilites.ts` |
| la forme de l'export, en fixture (noms inventés) | `capitanat/infrastructure/exemples/sondage-disponibilites.csv` |
| le dépôt | `capitanat/infrastructure/depot-disponibilites-sqlite.ts` |
| les tables | `migrations/017__disponibilite.sql` |

**La journée rattache, la date contrôle.** Chaque colonne du sondage porte un
numéro de journée et une date ; la date doit être celle du calendrier, sans
quoi l'import est refusé — un sondage d'une autre équipe ou d'une autre saison
mettrait des réponses en face des mauvaises rencontres. L'adversaire écrit
dans l'intitulé est ignoré : le sondage l'abrège à sa façon. Un import
remplace les journées qu'il couvre, et elles seules.

**Le sondage parle en prénoms et en surnoms.** Chaque nom est un *répondant*,
que le capitaine rattache une fois à un membre ; le rattachement tient au nom
et vaut pour les sondages suivants. Le prénom relevé sert à *proposer* un
membre, jamais à rattacher en silence — pour la raison que `parNom` donne
déjà. Le décompte par sexe, qui dit si l'on compose, ne compte que les
répondants rattachés.

## La planification

Spec 011, en assistant : le capitaine compose, l'outil vérifie. Une page par
journée, `/capitanat/planification/<journée>` ; sans journée, la prochaine
rencontre. Notion et règles dans `capitanat/core/composition.ts`, dépôt
`depot-compositions-sqlite.ts`, table `migrations/018__composition.sql`.

Neuf places pour six matchs — SH1, SH2, SD, DH, DD, MX —, chacune réservée à
un sexe. Trois règles : seul se sélectionne un joueur qui a répondu oui ou si
besoin au sondage de la journée (les listes ne proposent que ceux-là) ; deux
matchs au plus par joueur ; le SH1 n'a pas une moyenne de simple inférieure au
SH2, un non-classé comptant pour zéro. Une composition incomplète
s'enregistre ; une composition fautive revient avec ses fautes, sans être
écrite. Une composition enregistrée que les réponses ne justifient plus — un
nouveau sondage — reste affichée, avec la faute qui le dit.

**La feuille de rencontre.** `/capitanat/planification/<journée>/feuille` rend
la feuille officielle d'icbad (`/rencontre/<id>/exportPDF`, un PDF public
regénéré par le comité, donc téléchargé à chaque demande) avec la composition
*enregistrée* écrite dans la colonne de l'équipe — à gauche quand elle reçoit.
La feuille n'est pas redessinée : `capitanat/infrastructure/feuille-de-rencontre.ts`
y ajoute une mise à jour incrémentale — une police standard, un flux de texte,
une table de renvois —, l'original restant intact octet pour octet. Sans
bibliothèque : `pdf-lib` en tire quatre autres. Les coordonnées ont été
relevées sur la feuille du 30 septembre 2026 ; si le comité change sa mise en
page, c'est là qu'elles se corrigent. Le téléchargement binaire vit à part du
port `ClientHttp`, qui rend du texte : `telecharger` dans `client-fetch.ts`.

## Ce qui n'est pas encore là

Le schéma des matchs, que 015 laisse volontairement à dessiner sur les pages
désormais observées, et la sauvegarde (023).

Les alertes et les rappels de la veille (013 et 014), que 012 vient de
débloquer : la colonne `alerte_le` est posée et personne ne l'écrit.
