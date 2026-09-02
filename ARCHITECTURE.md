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

Une seule instance, ce n'est pas un oubli : le planificateur vivra dans le
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
d'exécution, les déploiements observés, le classement, l'équipe et l'identité
de chaque licence suivie. Celui des
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
cp .env.example .env         # puis y coller une clé : openssl rand -base64 32
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

La passe n'a pas encore de déclencheur : 018 la portera. En attendant,
`/sources` la lance à la main — sur l'écran d'exploitation, jamais sur
`/mon-profil`, où un bouton mettrait le plafond d'un passage par jour entre les
mains de l'utilisateur —, et l'import de l'équipe l'enchaîne.

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

## Ce qui n'est pas encore là

Le schéma des matchs et des tournois, que 015 laisse volontairement à dessiner
sur les pages désormais observées. L'envoi de mail (016),
l'ordonnancement (018) — sans lequel la passe de classement n'a d'autre
déclencheur qu'un bouton —, les rapports et le battement hebdomadaire (019),
l'authentification (021) et la sauvegarde (023). **L'application ne doit pas
être joignable depuis internet tant que 021 n'est pas faite.**
