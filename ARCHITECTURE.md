# Architecture

Ce document décrit ce qui est en place. Il ne remplace pas les specs
[020](<spec/4. done/tech/020__architecture-applicative.md>),
[017](<spec/4. done/tech/017__persistance-sqlite.md>),
[022](<spec/4. done/tech/022__decoupage-du-code.md>) et
[015](<spec/4. done/tech/015__source-de-donnees.md>), qui portent les décisions
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

Toute requête sortante passe par deux décorateurs du `core`, qu'aucun appelant
ne peut oublier : `enArchivant` écrit la réponse en base avant que quiconque
l'analyse, `sousPlafond` arrête une passe qui boucle. La session vit dans
`jeton_source` ; elle se recopie à la main depuis le navigateur vers `/sources`,
car badnet impose une 2FA. myffbad, lui, n'en a pas : Bado s'y connecte seul
quand `BABO_MYFFBAD_MOT_DE_PASSE` est renseigné, en rejouant la Server Action
de connexion, et ne garde en base que le jeton rendu — jamais le mot de passe.
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
boîte d'envoi du courrier, et les paires du capitaine.
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

Le planificateur la déclenche chaque vendredi à 1 h du matin (018). `/sources`
la lance aussi à la main, en dépannage — sur l'écran d'exploitation, jamais sur
`/mon-profil`, où un bouton mettrait le plafond d'un passage par jour entre les
mains de l'utilisateur —, et l'import de l'équipe l'enchaîne.

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
au serveur. Deux aujourd'hui — la passe de classement, et le vidage quotidien de
la boîte d'envoi (016) —, et les acquisitions quotidiennes de 015, le battement
de 019 et les rappels de 014 s'ajouteront à une ligne chacune.

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
obligatoire, texte facultatif, sujet préfixé de `[Bado] ` pour qu'un filtre s'y
pose une fois pour toutes. Rien n'est purgé.

Le dialogue SMTP est testé contre un faux serveur local, sur les deux façons
dont une alerte se perdrait en silence : authentification refusée, connexion
coupée en plein dialogue. Ce serveur écoute en clair — **TLS n'est pas
couvert**, et c'est le trou assumé de ce choix.

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

## Ce qui n'est pas encore là

Le schéma des matchs et des tournois, que 015 laisse volontairement à dessiner
sur les pages désormais observées. Les rapports par mail et le battement
hebdomadaire (019) — le courrier est là, le planificateur n'attend qu'une ligne
dans `main.ts` —, et la sauvegarde (023).
