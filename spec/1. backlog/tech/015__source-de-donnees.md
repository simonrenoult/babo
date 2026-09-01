# Identifier les sources de données

| Champ  | Valeur |
|--------|--------|
| id     | 015    |
| module | socle  |
| type   | tech   |

## Contexte

Presque toutes les specs du backlog supposent l'accès à des données
fédérales : classements, matchs, licences, tournois. Aucune n'est exposée par
une API publique documentée. Bado est un outil personnel, hébergé sur un
serveur privé, qui automatise un travail fait jusqu'ici à la main.

## Problème à résoudre

Chaque spec suppose la donnée disponible sans dire d'où elle vient. Tant que
l'accès n'est pas démontré, on ne peut ni estimer les specs qui en dépendent,
ni savoir lesquelles sont réalisables. Et si chaque feature attaque les sites
fédéraux à sa façon, un changement de page HTML casse l'application entière.

Résolu quand chaque donnée nécessaire est associée à une source identifiée,
que l'accès à myffbad et à badnet est prouvé de bout en bout — connexion,
récupération, extraction d'un match et d'un tournoi réels — et que le parsing
de chaque site vit dans un module unique.

## Solutions envisagées

Chaque donnée a une source et une seule :

| Donnée | Source | Acquisition | Fraîcheur |
|--------|--------|-------------|-----------|
| Équipe : licence, mail, téléphone, sexe | fichier de configuration | saisie manuelle | saison |
| Classement par tableau, à moi et à mes coéquipiers | myffbad, compte personnel | scraping | quotidien |
| Matchs : score, partenaire, adversaire, tableau, compétition | myffbad, compte personnel | scraping | quotidien |
| Tournois : dates, lieu, tableaux, séries, date limite | badnet | scraping | quotidien |

Il n'y a donc aucun arbitrage à faire entre sources, et pas d'interface
unifiée à écrire : deux modules d'acquisition indépendants, un par site.

Écartés : les fichiers CPPH mensuels et Poona. myffbad couvre le classement,
y compris celui des coéquipiers, et l'équipe est saisie à la main.

Accès à myffbad :

- Identifiants en variable d'environnement, jamais en base. Le jeton de
  session, lui, est persisté ([[017__persistance-sqlite]]) : c'est ce qui lui
  fait survivre aux redémarrages.
- La 2FA envoie un code par mail, fourni à la main : la connexion n'est pas
  automatisable, seule la session l'est. Le jeton dure un mois (vérifié), et sa
  reconduction se fait depuis un écran dédié de l'interface.

L'exploitation quotidienne de ces scrapings — archivage des captures,
détection des pannes, rapports, ancienneté affichée — relève de
[[019__robustesse-du-scraping]].

## Questions

- Les matchs d'interclub sont-ils exposés au même endroit que ceux de tournoi ?

## Notes

Usage strictement personnel, sur serveur privé. L'application est protégée par
identifiant et mot de passe ; le `noindex` n'est qu'un complément, il ne ferme
rien par lui-même.

Quand la session myffbad tombe, le scraper s'arrête, le signale par mail, et
attend une réauthentification depuis l'interface.

Risque de bannissement du compte myffbad : accepté. Un passage par jour.

Dépend de [[017__persistance-sqlite]] pour le jeton de session et de
[[018__ordonnancement]] pour le déclenchement des passes. Prolongé par
[[019__robustesse-du-scraping]].

Ordre de traitement : une base minimale, puis la sonde d'accès jusqu'à extraire
un match et un tournoi réels, puis seulement le schéma définitif — le dessiner
avant d'avoir vu les pages serait la même erreur que de concevoir une interface
avant ses adaptateurs.

Bloque [[001__classement]], [[002__prochains-tournois]],
[[003__historique-de-matchs]], [[005__liste-des-membres-de-l-equipe]] et
[[012__recherche-de-tournois]]. À traiter en premier.
