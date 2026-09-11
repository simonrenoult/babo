# Babo

> Assistant de badminton : mon profil, veille, capitanat

## Features 

- Informations sur mon profil : 
  - Classement
  - Prochains tournois
  - Historique de matchs
  - Ratio victoire/défaite par tableau
- Aide au capitanat : 
  - Lister les membres de mon équipe (nom, classement, licence, sexe, téléphone, lien myffbad)
  - Voir ses forces tableau par tableau, et les tableaux que l'effectif ne remplit pas
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
openssl rand -base64 32      # et dans BABO_SECRET_JETON : il signe les sessions
                             # puis choisir un BABO_MOT_DE_PASSE, long
npm start                    # http://localhost:3000
```

`npm run dev` pour le rechargement à chaud, `npm run verifier` pour les types,
le lint d'architecture et les tests.
