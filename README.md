# Babo

> Assistant de badminton : profil, veille, capitanat

## Features 

- Informations sur mon profil : 
  - Classement
  - Prochains tournois
  - Historique de matchs
  - Ratio victoire/défaite par tableau
- Aide au capitanat : 
  - Lister les membres de mon équipe (sexe, licence, classement, mail, téléphone, lien myffbad)
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
les sessions, les déploiements observés et la sonde d'accès. Voir
[ARCHITECTURE.md](ARCHITECTURE.md) pour le découpage du code et
[`spec/`](spec/) pour les décisions.

> **Pas encore joignable depuis internet** : l'authentification (spec 021)
> n'est pas faite.
