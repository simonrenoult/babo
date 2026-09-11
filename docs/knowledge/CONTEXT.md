# Babo — Connaissances métier

Le socle est en place — un processus Node, une base SQLite unique et chiffrée,
quatre modules hexagonaux — et les deux sources sont acquises (spec 015) :
Babo se connecte seul à myffbad pour le classement et les matchs, et interroge
la recherche publique de badnet, anonyme, pour les tournois. `/sources` porte
les sessions, les déploiements observés et la sonde d'accès.

Deux features en place. `/mon-profil` affiche mon classement, une ligne par
discipline, avec la date de la passe qui l'a relevé (spec 001). `/capitanat`
affiche l'équipe — nom, classement par discipline, licence, sexe, téléphone
cliquable et lien vers la fiche fédérale (specs 005 et 028). L'équipe s'importe
depuis `/sources` par un CSV `licence;sexe;telephone` en UTF-8, qui remplace la
liste entière ou est refusé en entier ; l'import enchaîne aussitôt une passe, si
bien qu'on dépose huit lignes et qu'on lit huit noms.

`/capitanat` est aussi devenu un **index sur cinq pages**, une par tableau de la
feuille de match — deux SH, un SD, un DH, un DD, un MX (spec 029). Chacune range
les joueurs éligibles du plus fort au plus faible, cote et lettre affichées
telles qu'elles ont été relevées, et nomme à part ceux qui n'ont pas de
classement dans la discipline. L'index dit lesquels des cinq tableaux l'effectif
ne permet pas de remplir. Rien de tout cela n'est saisi : le sexe vient du CSV,
la cote et la lettre de la passe hebdomadaire.

Cette passe relève noms et classements pour tout le monde d'un coup, et
**sans aucune session** : la fiche myffbad et l'action qui porte le classement
répondent à froid. Le planificateur la déclenche seul, chaque vendredi à 1 h du
matin (spec 018) ; sur `/sources`, le tableau d'ordonnancement la lance à la
main d'un clic dans sa colonne **Lancer** (spec 037).

Ce planificateur vit dans le processus et porte les deux natures de tâches :
les passes périodiques et les échéances calculées au fil de l'eau. Ses cadences
et ses fenêtres de grâce se règlent depuis `/sources`, sans redéploiement. Une
échéance manquée pendant un arrêt est rejouée si elle tient encore dans sa
grâce, abandonnée sinon — un rappel J-1 envoyé à J+2 est pire qu'un rappel
manquant. Un échec est rejoué deux fois, à une heure puis à quatre. Chaque
tâche active à cadence se déclenche aussi à la main, depuis le tableau (spec
037) : la passe tourne exactement comme au réveil — grâce court-circuitée,
échéance clôturée, suivante inscrite, rapport affiché aussitôt — mais en coup
unique, sans réessai silencieux.

Voir
[ARCHITECTURE.md](ARCHITECTURE.md) pour le découpage du code et
[`spec/`](../spec/) pour les décisions.

L'accès est fermé (spec 021). L'identifiant est le numéro de licence — qui n'est
pas un secret, il est sur myffbad —, le mot de passe vient de la configuration,
et la session est un jeton signé déposé en cookie, sans rien en base. Elle dure
30 jours et se prolonge à chaque visite, sans jamais dépasser 90 jours depuis la
connexion : passé ce plafond, le mot de passe est redemandé. Cinq échecs
ferment la porte quelques minutes.

Changer de mot de passe, c'est éditer `BABO_MOT_DE_PASSE` et redémarrer. Annuler
une session, c'est faire tourner `BABO_SECRET_JETON` — ce qui les annule toutes,
la seule granularité qu'un jeton sans état sache offrir.
