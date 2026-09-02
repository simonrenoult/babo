# Babo

> Assistant de badminton : mon profil, veille, capitanat

## Features 

- Informations sur mon profil : 
  - Classement
  - Prochains tournois
  - Historique de matchs
  - Ratio victoire/défaite par tableau
- Aide au capitanat : 
  - Lister les membres de mon équipe (licence, sexe, téléphone, lien myffbad, puis nom et classement)
  - Performance individuelle
  - Ratio victoire/défaite
  - Disponibilités aux interclubs
  - Taux de sollicitation aux interclubs
  - Tableaux préférés
  - Aide à la saisie des compositions de journée d'interclub
- Veille de tournoi :
  - Rechercher des tournois selon des critères
  - Envoyer des mails de rappel quand un nouveau tournoi est trouvé
  - Envoyer un mail de rappel quand un tournoi va ouvrir

## Mise en route

```sh
npm install
cp .env.example .env
openssl rand -base64 32      # à recopier dans BABO_BASE_CLE : la base est chiffrée au repos
npm start                    # http://localhost:3000
```

`npm run dev` pour le rechargement à chaud, `npm run verifier` pour les types,
le lint d'architecture et les tests.

Le socle est en place — un processus Node, une base SQLite unique et chiffrée,
quatre modules hexagonaux — et les deux sources sont acquises (spec 015) :
Bado se connecte seul à myffbad pour le classement et les matchs, et interroge
la recherche publique de badnet, anonyme, pour les tournois. `/sources` porte
les sessions, les déploiements observés et la sonde d'accès.

Deux features en place. `/mon-profil` affiche mon classement, une ligne par
discipline, avec la date de la passe qui l'a relevé (spec 001) ; la passe
attend son ordonnanceur (spec 018), et d'ici là elle se lance depuis
`/sources`. `/capitanat` affiche les membres de l'équipe — licence, sexe,
téléphone cliquable et lien vers la fiche fédérale (spec 005). L'équipe
s'importe depuis `/sources` par un CSV `licence;sexe;telephone` en UTF-8, qui
remplace la liste entière ou est refusé en entier. Les noms et les classements
des coéquipiers viendront de la spec 028.

Voir
[ARCHITECTURE.md](ARCHITECTURE.md) pour le découpage du code et
[`spec/`](spec/) pour les décisions.

> **Pas encore joignable depuis internet** : l'authentification (spec 021)
> n'est pas faite.
