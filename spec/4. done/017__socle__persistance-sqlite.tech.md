# Stocker l'état de l'application dans une base SQLite unique

| Champ   | Valeur |
|---------|--------|
| id      | 017    |
| module  | socle  |
| type    | tech   |
| bloquée | —      |

## Contexte

Bado manipule des données de natures très différentes : captures HTML brutes,
classements, matchs, tournois indexés, critères de veille, identifiants et
jeton de session myffbad, rapports d'exécution. Chaque spec suppose un
stockage sans jamais dire lequel.

## Problème à résoudre

Sans choix de stockage, chaque feature invente le sien : un fichier ici, une
variable d'environnement là. Deux conséquences immédiates. Le jeton de session
myffbad, valable un mois, n'a nulle part où vivre : gardé en mémoire, il est
perdu à chaque redémarrage du serveur et coûte une réauthentification 2FA
manuelle à chaque déploiement. Et rien ne garantit qu'une donnée écrite par une
feature soit lisible par une autre.

Résolu quand une base SQLite unique porte l'ensemble de l'état de
l'application, qu'un redémarrage ne coûte aucune réauthentification, et
qu'aucune feature ne persiste quoi que ce soit en dehors.

## Solutions envisagées

- **SQLite, base unique.** Retenue : un fichier, aucun service à administrer
  sur le serveur, transactionnel, et largement dimensionné pour le volume
  attendu — un joueur, une équipe, quelques centaines de matchs, quelques
  milliers de tournois.
- **Fichiers sur disque et variables d'environnement.** Écarté : c'est l'état
  de fait qu'on cherche à corriger, et le jeton de session y reste sans domicile.
- **Base serveur (PostgreSQL).** Écarté : administration disproportionnée pour
  un outil à un seul utilisateur.

La base porte :

- les captures HTML brutes et les rapports d'exécution
  ([[019__socle__robustesse-du-scraping.tech]]) ;
- le jeton de session myffbad — c'est ce qui lui permet de survivre aux
  redémarrages. Les identifiants, eux, restent en variable d'environnement et
  n'entrent jamais en base ;
- les classements, les matchs, les tournois indexés ;
- les critères de veille et les tournois déjà notifiés
  ([[013__veille__alerte-nouveau-tournoi.feat]]) ;
- les rappels déjà envoyés par tournoi suivi
  ([[014__veille__rappel-ouverture-tournoi.feat]]) : sans eux, un redémarrage
  les renvoie ou les perd ;
- les disponibilités saisies par le capitaine
  ([[008__capitanat__disponibilites-interclubs.feat]]) ;
- les fréquences et les échéances du planificateur
  ([[018__socle__ordonnancement.tech]]) ;
- les critères de recherche de tournois
  ([[012__veille__recherche-de-tournois.feat]]).

La liste des membres de l'équipe reste saisie dans un fichier de configuration
([[005__capitanat__liste-des-membres-de-l-equipe.feat]]) : ce fichier est une
entrée, pas un stockage — son contenu est importé en base.

La base est chiffrée au repos : elle porte les coordonnées des coéquipiers, et
c'est le fichier qu'on recopie pour sauvegarder — la sauvegarde elle-même fait
l'objet de [[023__socle__sauvegarde.tech]].

Une base unique pour tout, captures brutes comprises, malgré leur croissance non
bornée et leur valeur moindre. La taille de la base figure dans le battement
hebdomadaire de [[019__socle__robustesse-du-scraping.tech]] : c'est ce qui
permettra de décider, sur des chiffres, s'il faut un jour séparer l'archive ou
purger.

## Questions

- Où vit la clé de chiffrement de la base ? Placée dans la configuration du
  serveur, à côté des identifiants myffbad, elle protège une sauvegarde volée,
  pas un serveur compromis. Tranché : `BABO_BASE_CLE`, sans valeur par défaut —
  sans elle l'application refuse de démarrer.
- Faut-il un mécanisme de migration de schéma dès le départ ? Tranché : oui.
  Cette spec annonce elle-même que le schéma des matchs et des tournois se
  dessinera après la sonde de 015 : il bougera donc avant la mise en
  production.

## Notes

Croissance non bornée assumée : aucune politique de rétention des captures
n'est définie, le sujet est repoussé jusqu'à ce que les mesures de taille le
justifient.

Bloque [[015__socle__source-de-donnees.tech]], qui doit y écrire ses captures et
son jeton de session. À traiter avec ou avant — mais seulement pour ce qui doit
exister tout de suite : le jeton et les captures. Le schéma des matchs et des
tournois se dessine après la sonde de 015, sur des pages réellement observées,
pas avant.

**Le schéma des tournois, dessiné en deux temps.**
[[002__mon-profil__prochains-tournois.feat]] a posé `tournoi` et
`tournoi_journee` le 5 septembre 2026, pour ses seuls engagements ;
[[012__veille__recherche-de-tournois.feat]] les élargit le 8 septembre — colonnes
de la recherche ajoutées, `gymnase` et `adresse` rendues nullables, et une table
d'appartenance `(veille, tournoi)` à côté des veilles elles-mêmes. L'ordre voulu
par 015 — la sonde d'abord, le schéma ensuite — a tenu jusqu'au bout : chaque
colonne vient d'une page observée.

Celui des matchs reste seul à dessiner.
