# Fermer l'accès à l'application

| Champ  | Valeur |
|--------|--------|
| id     | 021    |
| module | socle  |
| type   | tech   |

## Contexte

Trois specs s'appuient déjà sur l'idée que Bado est fermé :
[[015__source-de-donnees]] en fait la protection réelle du service, dont le
`noindex` n'est qu'un complément ; [[005__liste-des-membres-de-l-equipe]] y
range les coordonnées des coéquipiers ;
[[008__disponibilites-interclubs]] écarte une solution entière au seul motif
qu'elle percerait cette clôture.

Aucune ne dit comment la porte fonctionne.

## Problème à résoudre

Le serveur est joignable depuis internet — c'est la condition pour consulter
Bado en club ou en tournoi. Il sert des mails et des téléphones de coéquipiers,
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
[[017__persistance-sqlite]] pour un utilisateur unique.

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
  en JavaScript. `Secure` rend HTTPS obligatoire, ce qui devient une exigence
  de déploiement pour [[020__architecture-applicative]].
- Le haché du mot de passe vit en base ([[017__persistance-sqlite]]) : il n'y a
  pas d'inscription, le compte est créé au premier démarrage.
- Le secret de signature vit dans la configuration du serveur, à côté des
  identifiants myffbad — jamais en base, qu'il sert justement à protéger.
- Un seul compte pour l'instant. La licence comme identifiant laisse la porte
  ouverte à plusieurs joueurs, mais 008 a explicitement refusé d'ouvrir l'outil
  aux coéquipiers : tant que cette décision tient, il n'y a rien à gérer.

## Questions

- Quelle durée de validité du jeton ? Courte, elle oblige à ressaisir le mot de
  passe depuis un téléphone en tournoi ; longue, elle prolonge d'autant la
  fenêtre d'un cookie volé.
- Le jeton est-il prolongé à chaque visite, ou expire-t-il à date fixe depuis
  la connexion ?
- Une tentative de connexion échouée est-elle signalée par mail
  ([[016__envoi-de-mail]]) ? C'est le seul moyen d'apprendre qu'on cherche à
  entrer.

## Notes

Ne protège pas d'un serveur compromis : qui obtient un accès au serveur obtient
le secret de signature, la clé de chiffrement de la base et les identifiants
myffbad, tous rangés au même endroit.

Extraite de [[020__architecture-applicative]], qui a désigné le socle comme
porteur de l'authentification sans la décrire.

Bloque la mise en ligne : tant qu'elle n'est pas faite, le service ne doit pas
être joignable depuis internet.
