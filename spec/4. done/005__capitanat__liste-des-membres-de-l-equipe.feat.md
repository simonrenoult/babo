# Lister les membres de mon équipe

| Champ       | Valeur    |
|-------------|-----------|
| id          | 005       |
| module      | capitanat |
| type        | feat      |
| bloquée par | —         |

## Contexte

En tant que capitaine, je dois joindre mes joueurs et connaître leur classement
pour composer les équipes. Ces informations sont dispersées entre myffbad, un
fichier du club et mes contacts.

La sonde de [[015__socle__source-de-donnees.tech]] a montré où passe la coupure
: myffbad donne le nom et le classement, publiquement, mais **ni le sexe ni le
téléphone** — sa fiche ne porte aucun genre, et il ne se déduit pas des
résultats, qui rendent la discipline et la série, jamais `SH` ni `SD`. Cette
spec porte donc la moitié qui ne peut venir que de moi ;
[[028__capitanat__nom-et-classement-de-l-equipe.feat]] porte l'autre.

## Problème à résoudre

Je n'ai pas de fiche d'équipe unique. Les coordonnées de mes joueurs vivent
dans un tableur du club, dans mes contacts et nulle part ensemble, et rien ne
relie un joueur à sa fiche fédérale.

Résolu quand la page `/capitanat` affiche la liste des membres de l'équipe
avec, pour chacun : numéro de licence, sexe, téléphone cliquable et lien vers
sa fiche myffbad ; et quand un CSV déposé depuis `/sources` remplace
intégralement cette liste, ou est refusé en entier.

Le nom et le classement n'y sont pas : ils viennent de myffbad, et c'est
[[028__capitanat__nom-et-classement-de-l-equipe.feat]] qui les ajoute. Le mail
non plus — voir Notes.

## Solutions envisagées

- **CSV importé en base, une fois par saison, remplacement intégral.** Retenue.
  La saisie ne se fait qu'une fois, et la donnée vient déjà d'un tableur.
- Fichier de configuration lu au démarrage, ce que
  [[015__socle__source-de-donnees.tech]] prévoyait. Écarté : ce serait la seule
  donnée personnelle de tiers en clair sur le disque, alors que la base est
  chiffrée au repos ([[017__socle__persistance-sqlite.tech]]). Le téléversement,
  lui, ne laisse jamais le fichier atterrir sur le serveur.
- Écran de saisie complet. Écarté : un CRUD entier pour trois modifications par
  an.

Le fichier : `licence;sexe;telephone`, **en-tête obligatoire**, `;` seul,
**UTF-8 exigé**. L'en-tête parce que trois colonnes anonymes finissent par
s'inverser ; l'encodage strict parce que deviner transforme « Noël » en
« NoÃ«l » sans rien signaler. **Tout ou rien** : une licence hors
`^\d{6,8}$`, un sexe hors `F`/`M`, un téléphone vide, une licence en double ou
une colonne manquante refusent l'import entier, l'écran nommant la ligne et la
raison. Le téléphone est stocké tel quel — on vérifie qu'il existe, jamais sa
forme, sinon un numéro belge se fait rejeter.

Le téléversement : `<input type="file">` et dix lignes de JS qui postent le
contenu en `text/csv`, lu par `express.text()`. Express ne sait pas lire le
multipart, et ajouter `multer` pour un import annuel de huit lignes irait
contre la même exigence qui a fait refuser 300 Mo de navigateur sans écran à
[[015__socle__source-de-donnees.tech]].

Le bouton vit sur `/sources`, l'écran d'exploitation, comme la passe de
[[001__mon-profil__classement.feat]]. Le socle ne connaît aucune feature
([[022__socle__decoupage-du-code.tech]]) : `AccesAuxSources` gagne un geste de
plus, que `main.ts` branche sur l'import.

**Remplacement intégral** : un coéquipier absent du CSV est supprimé, avec ses
relevés de classement et son cache d'acquisition. Ce sont le téléphone et le
sexe de quelqu'un qui n'a rien demandé et qui ne joue plus ici ; les garder « au
cas où » est précisément ce qui rendrait une fuite impardonnable
([[021__socle__authentification.tech]]). Ma propre licence figure dans le CSV
comme les autres : je joue les journées que je compose, et une ligne à trous
serait un cas particulier à traiter dans cinq specs.

Où le code atterrit : `Coequipier` dans `capitanat/core` — c'est le `Joueur` que
[[022__socle__decoupage-du-code.tech]] refuse de faire monter dans le socle ; le
parseur CSV et le dépôt dans `capitanat/infrastructure` ; la migration dans
`socle/infrastructure/base/migrations/`, aucune feature ne persistant hors de
là.

## Questions

- ~~Une seule équipe ou plusieurs ?~~ **Une seule, liste plate, pas de notion
  d'équipe dans le modèle.** Porter une clé d'équipe dans 006 à 011 pour un
  besoin qui n'existe pas coûterait plus que d'ajouter un niveau au fichier le
  jour où il existera.
- ~~Que faire d'un coéquipier dont la fiche myffbad est introuvable ?~~ Sans
  objet ici : cette spec n'appelle pas myffbad. La question revient à
  [[028__capitanat__nom-et-classement-de-l-equipe.feat]], qui y répond par
  l'échec ligne à ligne.

## Notes

**L'import n'appelle personne.** Il écrit et affiche, sans une requête. C'est
[[028__capitanat__nom-et-classement-de-l-equipe.feat]] qui lui accrochera la
passe, et c'est voulu, pas oublié : cette spec doit pouvoir se livrer et se
vérifier sans source externe.

**Le tri par licence croissante est provisoire.** Il est arbitraire mais stable
et sans code ; 028 le remplace par le nom dès qu'il y en a un.

**Pas de mail.** myffbad ne publie pas les coordonnées de ses licenciés, et une
colonne remplie « au cas où » serait de la donnée personnelle de tiers stockée
sans usage. Conséquence pour [[008__capitanat__disponibilites-interclubs.feat]]
: la relance des silencieux ne peut pas partir de l'outil, elle reste un geste
manuel.

**[[015__socle__source-de-donnees.tech]] est amendée** : son tableau donnait
l'équipe à un fichier de configuration portant un mail, et la lisait comme une
donnée de saison. C'est une table importée, sans mail, et le classement des
coéquipiers s'y ajoute en acquisition anonyme.

Les coordonnées vivent en base chiffrée, sur un serveur privé, derrière
l'authentification de [[021__socle__authentification.tech]]. **L'application ne
doit pas être joignable depuis internet tant que 021 n'est pas faite** — c'est
vrai de tout Bado, et ça l'est doublement le jour où on importe l'équipe pour de
bon.

La vérification de validité des licences est hors périmètre.

Ne dépend de rien : livrable immédiatement. Bloque
[[008__capitanat__disponibilites-interclubs.feat]],
[[010__capitanat__tableaux-preferes.feat]] et
[[028__capitanat__nom-et-classement-de-l-equipe.feat]].
