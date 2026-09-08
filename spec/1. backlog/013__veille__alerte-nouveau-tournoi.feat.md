# Alerter par mail quand un nouveau tournoi correspond

| Champ       | Valeur                                                                                                                       |
|-------------|------------------------------------------------------------------------------------------------------------------------------|
| id          | 013                                                                                                                          |
| module      | veille                                                                                                                       |
| type        | feat                                                                                                                         |
| bloquée par | [[012__veille__recherche-de-tournois.feat]], ~~[[016__socle__envoi-de-mail.tech]], [[017__socle__persistance-sqlite.tech]]~~ |

## Contexte

Les tournois intéressants se remplissent vite, parfois en quelques jours après
publication. Il faut donc être prévenu tôt, pas au moment où on pense à aller
regarder.

## Problème à résoudre

Rien ne me prévient qu'un tournoi correspondant à mes critères vient d'être
publié. Je dois penser à relancer la recherche, et je découvre souvent le
tournoi une fois complet.

Résolu quand l'outil envoie un mail dès qu'un tournoi non encore vu correspond
à mes critères, avec les informations utiles (dates, lieu, tableaux, date
limite, lien) et sans jamais alerter deux fois pour le même tournoi.

## Solutions envisagées

- Un mail par tournoi trouvé. Réactif, risque de spam en période de
  publication.
- Un digest quotidien ou hebdomadaire. Moins intrusif, mais fait perdre les
  heures qui comptent sur un tournoi qui se remplit.

À trancher : probablement mail immédiat, avec un regroupement si plusieurs
tournois sortent dans la même passe.

Plafond et rattrapage. À la première indexation, aucun tournoi n'a encore été
vu : sans règle, le catalogue entier partirait en une fois. Deux régimes
distincts, donc :

- **Un tournoi nouvellement publié alerte immédiatement, hors plafond.** C'est
  la raison d'être de cette spec : ces tournois-là se remplissent en quelques
  jours.
- **Le reste forme une file de rattrapage**, vidée à raison de dix par passe,
  pris par date de tournoi la plus proche, en signalant qu'il en existe
  davantage et en invitant à affiner les critères. Les tournois écartés ne sont
  pas marqués comme vus : ils repassent le lendemain sous la même règle.

Sans cette séparation, un catalogue initial de deux cents tournois mettrait
vingt jours à se vider, et une publication du jour attendrait derrière deux
cents tournois plus proches en date — dont beaucoup déjà complets.

Même mécanique de rattrapage à chaque élargissement des critères, qui rouvre le
même trou.

L'envoi lui-même relève de [[016__socle__envoi-de-mail.tech]].

**Une alerte par veille — amendé le 8 septembre 2026.** 012 ne porte plus un jeu
de critères mais des **veilles nommées**, cinq au plus. « Déjà alerté » est donc
un fait du couple (veille, tournoi), et non du tournoi seul : deux veilles qui se
recouvrent alertent chacune la première fois qu'elles voient un tournoi, sans
quoi la seconde créée serait muette sur tout ce que la première a déjà vu. Un
mail par veille, dont le nom — « DH avec Louis » — est ce qui dit *pourquoi* ce
tournoi m'est signalé. C'est la colonne `alerte_le` de la table d'appartenance
que 012 met en place, et elle appartient à cette spec.

Le rattrapage se déclenche donc à chaque **veille nouvelle**, et non plus
seulement au premier démarrage : 012 a retenu une collecte badnet par veille,
donc une veille créée découvre d'un coup tout un catalogue publié depuis des
mois. C'est exactement le trou que la règle ci-dessus rebouche.

## Questions

- Que se passe-t-il si un tournoi déjà notifié change de date ou de tableaux ?
- ~~Comment reconnaît-on un tournoi « nouvellement publié » ?~~ **Tranché** :
  badnet n'expose aucune date de publication — la sonde du 8 septembre 2026 a
  relevé les quatorze clés de son JSON, aucune n'en porte. C'est donc la
  **première apparition dans l'index** qui fait foi, `vu_le` sur la ligne
  d'appartenance de 012. Corollaire à assumer : un tournoi absent d'une réponse
  badnet un matin puis présent le lendemain ne doit pas repasser pour nouveau —
  d'où l'appartenance datée plutôt qu'une ligne effacée et réécrite.
- Un tournoi qui ne déclare **aucun** tableau — deux sur quarante-six, selon la
  sonde — alerte-t-il ? Ce sont précisément les fraîchement publiés, donc ceux
  que cette spec vise ; mais on ne peut pas dire qu'ils correspondent aux
  critères, seulement qu'ils ne les contredisent pas encore.

## Notes

Dépend de [[012__veille__recherche-de-tournois.feat]] pour la donnée et de
[[016__socle__envoi-de-mail.tech]] pour l'envoi. Les tournois déjà notifiés sont
conservés en base ([[017__socle__persistance-sqlite.tech]]) : c'est ce qui
garantit qu'on n'alerte jamais deux fois pour le même.
