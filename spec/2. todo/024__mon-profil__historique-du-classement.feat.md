# Afficher l'évolution de mon classement

| Champ       | Valeur                                   |
|-------------|------------------------------------------|
| id          | 024                                      |
| module      | mon-profil                               |
| type        | feat                                     |
| bloquée par | ~~[[001__mon-profil__classement.feat]]~~ |

## Contexte

[[001__mon-profil__classement.feat]] affiche le dernier classement connu et
écrit une ligne par changement de valeur, datée d'`apparu_le`. L'évolution
s'accumule donc en base dès sa mise en service, sans que rien ne l'expose.

## Problème à résoudre

Je vois où j'en suis, pas comment j'y suis arrivé : ni de combien mon CPPH a
bougé à la dernière publication, ni depuis combien de temps je tiens ma lettre,
ni si la tendance monte ou descend.

Résolu quand la page affiche, par tableau : la variation en lettre et en CPPH
depuis le palier précédent, la date d'entrée dans le palier courant, et la
liste des paliers enregistrés.

## Solutions envisagées

- **Lecture de la table des relevés de 001, calcul à la volée.** Retenue : une
  douzaine de lignes par an et par tableau, aucun agrégat à entretenir.
- **Import de l'antériorité myffbad.** Écarté à l'ouverture de 001, faute de
  savoir ce que la fiche expose réellement. **Constaté depuis** : la fiche
  porte `BestSimpleSubLevel` / `BestSimpleRankingDate` et leurs équivalents en
  double et en mixte — soit un seul point d'antériorité par discipline, le
  meilleur palier atteint et sa date, pas une série. Ça comble mal le trou de
  mise en service, mais ça ne coûte rien : la capture est déjà archivée, aucune
  requête supplémentaire. À trancher ici.
- **Courbe ou liste de paliers.** À trancher : une courbe de CPPH sur quelques
  points annuels n'apporte peut-être rien qu'une liste ne dise mieux.

## Questions

- Que montre-t-on tant qu'un seul palier est enregistré : un « — », ou pas de
  ligne de variation du tout ?
- Jusqu'où remonte l'affichage : tous les paliers, ou la saison en cours ?
- Une variation de CPPH sans changement de lettre mérite-t-elle le même
  traitement visuel qu'un changement de lettre ?

## Notes

Dépend de [[001__mon-profil__classement.feat]], qui porte l'acquisition et la
table.

Aucune variation n'est affichable avant la première publication CPPH suivant
la mise en service de 001 : conséquence directe de l'absence d'import
d'antériorité, à lever ici si la fiche s'y prête — elle ne s'y prête qu'à
moitié, voir ci-dessus.

La table lue ici est `classement`, une ligne par palier, `apparu_le` en date
d'entrée. 001 l'écrit depuis sa mise en service. L'axe est la **discipline** —
simple, double, mixte — et non le tableau : 001 a corrigé ce point sur la fiche
réelle.
