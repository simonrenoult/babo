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
| `profil`    | specs 001 à 004                                |
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
`socle/core` — un numéro de licence, un tableau. Jamais `Joueur` : `profil` et
`capitanat` gardent chacun le leur.

## L'acquisition

Deux sources, deux modules qui s'ignorent — `src/socle/infrastructure/acquisition/`,
spec 015. Chacun sait reconnaître son propre mur de connexion : myffbad
redirige vers `/connexion`, badnet sert sa page de connexion sous l'URL
demandée. C'est cette différence qui interdit de les mutualiser.

Elles ne se ressemblent pas non plus dans leur mécanique. myffbad se lit par
fonctions serveur Next.js, sous session, avec un `personId` qui ne vit que dans
le jeton. La recherche de tournois badnet, elle, est **publique et anonyme** :
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

Le schéma est volontairement partiel : il porte le jeton de session, les
captures brutes, les rapports d'exécution et les déploiements observés. Celui
des matchs et des tournois reste à dessiner — la sonde de 015 a livré les pages
réelles sur lesquelles le faire. Les migrations sont des fichiers `.sql` numérotés dans
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

## Ce qui n'est pas encore là

Le schéma des matchs et des tournois, que 015 laisse volontairement à dessiner
sur les pages désormais observées. L'envoi de mail (016),
l'ordonnancement (018), les rapports et le battement hebdomadaire (019),
l'authentification (021) et la sauvegarde (023). **L'application ne doit pas
être joignable depuis internet tant que 021 n'est pas faite.**
