# Saisir des paires et marquer celles que je privilégie

| Champ  | Valeur    |
|--------|-----------|
| id     | 030       |
| module | capitanat |
| type   | feat      |

## Contexte

[[029__forces-par-tableau]] donne, pour chacun des cinq tableaux, les joueurs
éligibles ordonnés par leur cote. Pour les deux simples, c'est toute la
réponse.

Pour le DH, le DD et le MX, non : le tableau se joue en paires, et une paire
n'a pas de classement fédéral. En début de saison, elles sont de surcroît à
construire — les joueurs ne se connaissent pas tous.

## Problème à résoudre

Je ne peux ni consigner les assemblages que j'envisage, ni les comparer. Je les
tiens de mémoire, et je recommence chaque semaine.

Deuxième manque, plus gênant : **la cote ne dit pas tout.** Une paire moins bien
classée qui se connaît mieux vaut mieux qu'une paire mieux classée qui n'a
jamais joué ensemble. L'ordre par classement est un fait, ce n'est pas ma
décision, et rien ne permet aujourd'hui d'écrire la seconde à côté du premier.

Résolu quand je saisis des paires, qu'elles survivent au redémarrage, que je
vois leur ordre, et que ce que je privilégie — une paire, ou un joueur sur un
tableau donné — remonte en tête.

## Solutions envisagées

- **Saisie manuelle, sans énumération.** Retenue. Énumérer toutes les paires
  possibles serait immédiat — une équipe de seize en produit soixante-quatre en
  mixte — mais soixante-quatre lignes pour en retenir trois sont du bruit, et
  une paire saisie enregistre une intention là où une paire calculée n'enregistre
  rien. Ce qu'on perd est réel : l'énumération pouvait révéler une paire forte à
  laquelle on n'aurait pas pensé.
- **Persistée en base** ([[017__persistance-sqlite]]), pas en brouillon de page.
  Une paire est une décision de capitaine, pas un calcul : c'est exactement ce
  que [[023__sauvegarde]] range parmi les choses qui ne se re-scrapent pas.

**Une paire est deux licences, rien de plus.** Son tableau se déduit des sexes —
deux hommes DH, deux femmes DD, un de chaque MX —, et comme 005 n'accepte que
`F` ou `M`, il n'y a aucun autre choix possible. Le stocker permettrait de
l'écrire faux ; le déduire rend la ligne fausse impossible.

**Son ordre est la moyenne des deux cotes** dans la discipline du tableau. La
moyenne plutôt que la somme parce qu'elle se compare à une cote individuelle ;
sur les cotes plutôt que sur les séries parce que deux paires « D8 + D9 » peuvent
valoir deux cent cinquante points d'écart, et que c'est justement l'écart qu'on
cherche. Conséquence assumée : **cet ordre bougera à chaque publication
hebdomadaire du CPPH.**

**Un joueur peut appartenir à plusieurs paires du même tableau.** C'est le geste
de début de saison — essayer Dupont avec Martin, puis avec Durand, et comparer.
La page prévient que ces paires ne se cumulent pas plus que les cinq tableaux de
029 : les deux premières du DH peuvent partager un joueur.

**Le marqueur du capitaine est un booléen**, posé sur une paire ou sur un couple
(joueur, tableau) — le même joueur se marque indépendamment en SH, en DH et en
MX. Pas de degré : une échelle demande d'être calibrée et personne ne la
recalibre. Pas de note : la raison est évidente au moment où on marque.

**Il range en deux blocs**, les marqués d'abord, chaque bloc ordonné par cote.
Ni une simple étoile — privilégier n'est pas décorer —, ni un bonus de points,
qui produirait un ordre qui ne serait ni celui du classement ni le mien. La
comparaison ne se perd pas : le meilleur non marqué reste en tête de son bloc.

**Ce que je marque et ce que le joueur déclarera sont deux choses.**
[[010__tableaux-preferes]] porte ce que le joueur dit de lui — ses tableaux
souhaités, refusés, ses partenaires privilégiés à lui. Cette spec porte ce que
le capitaine décide. Les deux peuvent se contredire, et **ce désaccord est
lui-même une information** : un joueur qui se croit à l'aise dans une paire que
le capitaine n'aligne jamais se voit en mettant les deux côte à côte, jamais en
les fusionnant. 010 est amendée pour écrire cette frontière ; elle ne perd rien.

**Ce qui disparaît avec le joueur.** L'import de 005 remplace la liste entière
et supprime le membre absent, avec ses relevés. Ses paires et ses marques
partent de même : c'est la règle déjà retenue par 005, pour la raison déjà
écrite — ne rien garder « au cas où » de quelqu'un qui ne joue plus ici.

## Questions

- La marque est la seule partie stable de la page, l'ordre bougeant chaque
  semaine. Faut-il, à terme, dater une marque pour savoir depuis quand elle
  tient ?

## Notes

Dépend de [[029__forces-par-tableau]], dont elle enrichit les cinq pages, et
donc de 005 et 028.

Amende [[010__tableaux-preferes]] : la frontière ci-dessus est à y recopier.

Prépare [[011__composition-de-journee]] : une paire saisie et marquée est
exactement ce qu'une composition de journée consommera.
