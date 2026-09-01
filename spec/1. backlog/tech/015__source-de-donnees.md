# Choisir et isoler la source de données FFBaD

| Champ  | Valeur |
|--------|--------|
| id     | 015    |
| module | socle  |
| type   | tech   |

## Contexte

Presque toutes les specs du backlog supposent l'accès à des données
fédérales : classements, matchs, licences, tournois. Ces données sont
dispersées entre myffbad, badnet, Poona et les fichiers CPPH publiés
mensuellement. Aucune n'expose d'API publique documentée.

## Problème à résoudre

Chaque spec suppose la donnée disponible sans dire comment l'obtenir. Tant que
ce n'est pas tranché, on ne peut ni estimer les specs qui en dépendent, ni
savoir lesquelles sont seulement réalisables — et si chacune attaque la source
à sa façon, un changement de page HTML casse l'application entière.

Résolu quand chaque donnée nécessaire est associée à une source identifiée
(ou déclarée inaccessible), et que l'accès passe par une couche unique,
remplaçable sans toucher aux features et testable hors ligne.

## Solutions envisagées

- **Fichiers CPPH mensuels.** Publiés, stables, exploitables sans compte —
  mais ne couvrent que le classement, pas les matchs ni les tournois.
- **Scraping myffbad / badnet.** Couvre tout le reste, au prix d'une
  dépendance au HTML et sous réserve des CGU de chaque site.
- **Saisie manuelle.** Pas une source à part entière, mais le filet de
  sécurité pour ce que les deux premières ne donnent pas.

Piste : combiner les trois derrière une interface unique, chaque donnée étant
servie par la source qui la couvre le mieux.

## Questions

- Les CGU de myffbad et badnet autorisent-elles la récupération automatisée,
  et à quelle cadence ?
- Faut-il un compte licencié pour accéder aux données de match ?
- Les données des coéquipiers (mail, téléphone) tombent-elles sous le RGPD dès
  lors qu'on les stocke — et que faut-il alors prévoir ?
- Quelle fraîcheur est acceptable : temps réel, quotidien, mensuel ?

## Notes

Bloque [[001__classement]], [[002__prochains-tournois]],
[[003__historique-de-matchs]], [[005__liste-des-membres-de-l-equipe]] et
[[012__recherche-de-tournois]]. À traiter en premier : le résultat peut
invalider des specs du backlog.
