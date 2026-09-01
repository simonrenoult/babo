# Récupérer mes engagements depuis badnet

| Champ  | Valeur |
|--------|--------|
| id     | 027    |
| module | socle  |
| type   | tech   |

## Contexte

[[002__prochains-tournois]] liste les tournois auxquels je suis inscrit.
[[015__source-de-donnees]] a cherché cette donnée à trois endroits sans la
trouver au bon prix : la recherche publique badnet est anonyme mais ne connaît
pas mes inscriptions, et la liste publique des inscrits ne couvre que les
tournois du rayon indexé — quand l'organisateur ne masque pas ses tableaux, ce
qui est le cas la plupart du temps.

002 démarre donc avec une saisie manuelle en base : je recopie mes engagements.

## Problème à résoudre

Une liste saisie à la main oublie exactement comme une mémoire oublie. C'est le
problème que 002 était censé régler — « je peux oublier un tournoi, ou
m'inscrire deux fois sur le même week-end » — déplacé d'un cran, pas résolu :
la double inscription reste invisible tant que la seconde n'a pas été recopiée.

Résolu quand `https://badnet.fr/competitions` est lu chaque jour sous session
authentifiée, quand chaque engagement — tournoi, dates, tableaux engagés,
partenaire, statut — entre en base sans recopie, et quand la saisie manuelle
de 002 n'est plus qu'un complément pour les inscriptions faites hors badnet.

## Solutions envisagées

- **`badnet.fr/competitions`, sous session authentifiée.** Retenue : badnet est
  l'endroit où l'inscription se fait, donc celui où elle est complète, statut
  compris.
- **myffbad `/mes-inscriptions`.** Écartée : elle reflète ce que la fédération
  enregistre, pas ce que j'ai engagé — et elle ferait dépendre `veille` d'une
  session myffbad dont [[015__source-de-donnees]] l'a justement affranchie.
- **Liste publique des inscrits, filtrée sur ma licence.** Écartée : ne voit
  que les tournois du rayon indexé, et les tableaux sont masqués la majorité du
  temps.

L'accès est le même rituel qu'en 015 — 2FA, code reçu à la main, session
persistée — donc rien de neuf à concevoir, seulement à réutiliser :

- jeton dans `jeton_source`, clé par source : la table a été faite pour ça ;
- identifiants en variable d'environnement, jamais en base ;
- écran de réauthentification partagé avec myffbad, une source à choisir ;
- plafond de requêtes et capture archivée avant analyse, comme toute
  acquisition.

**Les deux visages de badnet restent séparés.** La recherche publique de 026 ne
doit jamais passer sous session : elle est aujourd'hui exempte du risque de
bannissement, et l'authentifier pour mutualiser un client HTTP reviendrait à
mettre l'index quotidien de `veille` sous le même risque que le reste. Un seul
module de parsing badnet — c'est la règle de 015 — mais deux entrées, deux
tâches ordonnancées séparément, deux modes de panne.

## Questions

- La 2FA badnet passe-t-elle par un code envoyé par mail, comme myffbad, et son
  jeton dure-t-il aussi longtemps ?
- Les inscriptions en attente ou non confirmées sont-elles distinguables sur
  `/competitions` ? C'est la deuxième question ouverte de 002.
- Un engagement saisi à la main puis retrouvé sur badnet : fusionné sur quelle
  clé, ou affiché en double le temps que je tranche ?
- La page porte-t-elle le partenaire, que 002 affiche ?

## Notes

Dépend de [[015__source-de-donnees]] pour le rituel 2FA, l'écran de
réauthentification, le plafond de requêtes et l'archivage des captures ; de
[[017__persistance-sqlite]] pour le jeton ; de [[018__ordonnancement]] pour la
passe quotidienne ; de [[019__robustesse-du-scraping]] pour la panne
« session morte », qui vaudra ici comme là.

À traiter après [[002__prochains-tournois]], qui livre la table des engagements
et la page qui les affiche. Celle-ci ne fait que remplacer la main qui les
remplit.
