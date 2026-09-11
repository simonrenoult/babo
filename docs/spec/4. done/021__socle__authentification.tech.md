# Fermer l'accès à l'application

| Champ       | Valeur |
|-------------|--------|
| id          | 021    |
| module      | socle  |
| type        | tech   |
| bloquée par | —      |

## Contexte

Trois specs s'appuient déjà sur l'idée que Babo est fermé :
[[015__socle__source-de-donnees.tech]] en fait la protection réelle du service,
dont le `noindex` n'est qu'un complément ;
[[005__capitanat__liste-des-membres-de-l-equipe.feat]] y range les coordonnées
des coéquipiers ; [[008__capitanat__disponibilites-interclubs.feat]] écarte une
solution entière au seul motif qu'elle percerait cette clôture.

Aucune ne dit comment la porte fonctionne.

## Problème à résoudre

Le serveur est joignable depuis internet — c'est la condition pour consulter
Babo en club ou en tournoi. Il sert des mails et des téléphones de coéquipiers,
des gens qui n'ont rien demandé et dont la fuite ne serait pas rattrapable. Il
expose aussi l'écran de réauthentification myffbad de 015, donc un chemin vers
un compte fédéral.

Sans porte, tout cela est public dès la mise en ligne, et 008 aurait écarté sa
solution au nom d'une protection qui n'existe pas.

Résolu quand toute page hors connexion est refusée, quand la session survit à
la fermeture du navigateur et au redémarrage du serveur, et quand une session
volée peut être invalidée sans attendre son expiration.

## Solutions envisagées

Retenue : **identifiant = numéro de licence, mot de passe, jeton JWT stateless
déposé en cookie.** Aucune session en base, aucun état côté serveur : la
vérification est une signature. C'est la forme la plus simple qui tienne pour
un seul compte, et elle évite d'ajouter une table de sessions à
[[017__socle__persistance-sqlite.tech]] pour un utilisateur unique.

Ce choix a deux conséquences qu'il faut assumer plutôt que découvrir :

- **La licence n'est pas un secret.** Elle figure sur myffbad et dans les
  résultats de tournoi. Toute la sécurité repose donc sur le seul mot de passe,
  ce qui impose une limitation des tentatives de connexion : sans elle, un
  identifiant connu et un formulaire ouvert suffisent à travailler le mot de
  passe indéfiniment.
- **Un jeton stateless ne se révoque pas.** Un cookie volé reste valable
  jusqu'à son expiration ; on ne peut pas déconnecter à distance. Le seul levier
  est la rotation du secret de signature, qui invalide tous les jetons d'un
  coup. C'est brutal, mais avec un compte unique c'est exactement la bonne
  granularité — et cela vaut d'être écrit, sinon personne ne saura quoi faire le
  jour où le doute se présente.

Contraintes :

- Cookie `HttpOnly`, `Secure`, `SameSite=Strict` : le jeton n'est jamais lisible
  en JavaScript. `Secure` rend HTTPS obligatoire, ce qui devient une exigence de
  déploiement pour [[020__socle__architecture-applicative.tech]].
- Le haché du mot de passe vit en base ([[017__socle__persistance-sqlite.tech]])
  : il n'y a pas d'inscription, le compte est créé au premier démarrage.
- Le secret de signature vit dans la configuration du serveur, à côté des
  identifiants myffbad — jamais en base, qu'il sert justement à protéger.
- Un seul compte pour l'instant. La licence comme identifiant laisse la porte
  ouverte à plusieurs joueurs, mais 008 a explicitement refusé d'ouvrir l'outil
  aux coéquipiers : tant que cette décision tient, il n'y a rien à gérer.

### La fenêtre de session : glissante, mais plafonnée

Le jeton porte **deux** dates, et c'est tout le mécanisme. `exp` vaut trente
jours et se repousse d'autant à chaque visite, si bien qu'on ne se reconnecte
jamais en usage normal. `connecteLe` ne bouge jamais et plafonne la session à
quatre-vingt-dix jours : passé ce délai, le mot de passe est redemandé, quelle
que soit l'assiduité des visites.

Ni l'une ni l'autre seule ne suffisait. Une échéance fixe et courte fait
ressaisir un mot de passe long sur un téléphone en tournoi — c'est exactement ce
qui pousse à en choisir un court. Une échéance glissante sans plafond est une
échéance infinie : un cookie volé dont le voleur se sert tous les jours ne
mourrait jamais, et le seul recours resterait la rotation du secret, qui
déconnecte aussi le téléphone.

Le renouvellement n'a lieu qu'à la moitié de la validité consommée : réécrire le
cookie sur chaque page ne prolongerait rien de plus et poserait un `Set-Cookie`
sur chaque réponse, journal du proxy compris.

### Le mot de passe : la configuration fait foi

`BABO_MOT_DE_PASSE` est relu à chaque démarrage, et le haché en base réécrit
s'il a changé. Changer de mot de passe, c'est donc éditer la configuration et
redémarrer — ce que le service supervisé de
[[020__socle__architecture-applicative.tech]] rend trivial.

Pas d'écran de changement, donc pas de chemin de récupération à inventer, et pas
non plus de mot de passe oublié qui ne se répare qu'en éditant une base
chiffrée. Le clair vit dans la configuration du serveur, là où vivent déjà la
clé de la base et le mot de passe myffbad : le haché en base reste, comme la
spec l'exige, ce que la vérification consulte.

## Questions

- ~~Quelle durée de validité du jeton ?~~ Trente jours, glissants.
- ~~Le jeton est-il prolongé à chaque visite, ou expire-t-il à date fixe depuis
  la connexion ?~~ Les deux, et c'est le point : glissant à trente jours,
  plafonné à quatre-vingt-dix depuis la connexion.
- Une tentative de connexion échouée est-elle signalée par mail
  ([[016__socle__envoi-de-mail.tech]]) ? C'est le seul moyen d'apprendre qu'on
  cherche à entrer. **Reste ouverte** : 016 n'est pas faite. Le verrou du
  portier est en place et journalisé par le code de statut — 429 sur un verrou,
  401 sur un refus, ce que le journal du proxy distingue —, mais rien ne
  prévient encore.

## Notes

Ne protège pas d'un serveur compromis : qui obtient un accès au serveur obtient
le secret de signature, la clé de chiffrement de la base et les identifiants
myffbad, tous rangés au même endroit.

Extraite de [[020__socle__architecture-applicative.tech]], qui a désigné le
socle comme porteur de l'authentification sans la décrire.

~~Bloque la mise en ligne~~ : faite. `socle/core/authentification.ts` porte la
politique, `jeton-hmac.ts` et `mot-de-passe-scrypt.ts` le chiffrement,
`routeur-connexion.ts` le garde et le formulaire, `migrations/008__compte.sql`
le compte unique. Voir [ARCHITECTURE.md](../../ARCHITECTURE.md), section
« La porte ».

Deux décisions prises en écrivant, que la spec ne posait pas :

- **`/sante` reste ouverte, mais muette.** Le superviseur n'a pas de session, et
  la sonde de vie de 020 doit répondre sans. Elle est donc réduite à
  `{"statut":"ok"}` tant qu'on n'est pas entré : la taille de la base et le
  nombre de captures ne regardent personne d'autre.
- **Ni `jsonwebtoken` ni `bcrypt`.** Un HMAC sur deux segments encodés et le
  scrypt de Node suffisent, et la dépendance coûterait plus à auditer que les
  quarante lignes qu'elle remplace — la règle qui avait déjà fait refuser
  `multer` à 005. Les trois précautions qui comptent sont testées nommément :
  l'algorithme annoncé par le jeton n'est jamais cru sur parole, la comparaison
  des signatures est à temps constant, et un mot de passe est vérifié même quand
  le compte n'existe pas.
