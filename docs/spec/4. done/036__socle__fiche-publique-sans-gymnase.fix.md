# Lire la fiche publique d'un tournoi sans gymnase

| Champ       | Valeur |
|-------------|--------|
| id          | 036    |
| module      | socle  |
| type        | fix    |
| bloquée par | —      |

## Contexte

[[002__mon-profil__prochains-tournois.feat]] relève chaque matin la fiche
publique des tournois où je suis engagé, pour en tirer la ville et les journées
jouées. Elle les lit sur la carte « Gymnases » de l'onglet « Présentation ».

Un organisateur n'est pas tenu de saisir son gymnase à la publication : il le
fait souvent des semaines plus tard, une fois la salle réservée.

## Problème à résoudre

`lieuDuTournoi` s'appuie sur `/<div class="places">(.*?)<\/table>/su`. Quand
l'organisateur n'a rien saisi, le bloc ne contient aucune `<table>` mais la
phrase « Aucun gymnase renseigné par l'organisateur pour le moment. » : la
capture court alors jusqu'à la `</table>` **suivante**, hors du bloc — ou ne
trouve rien du tout quand il n'y en a plus, ce qui est le cas observé. Dans les
deux cas `PREMIER_GYMNASE` échoue et `accesAuxFichesPubliquesBadnet` lève
`FichePubliqueIllisible("de carte « Gymnases » lisible")`.

~~Ce n'est pas un cas marginal.~~ **C'est le cas majoritaire.** Le relevé du
9 septembre 2026 sur neuf fiches réelles en donne **sept sans gymnase** : une
salle se réserve après la publication, et badnet écrit la phrase en attendant.
La passe échouait donc sur trois tournois sur quatre — et
[[019__socle__robustesse-du-scraping.tech]] envoyait une alerte pour une panne
qui n'en était pas une.

Résolu quand la passe aboutit sur un tournoi sans gymnase, en rendant sa ville
et ses journées, et ne consigne un échec que si la fiche est réellement
illisible.

## Solutions envisagées

- **Borner la regex au bloc.** Corrige le débordement, mais laisse la passe sans
  ville ni journées sur ces tournois-là — donc « lieu non relevé » pendant des
  semaines, alors que badnet publie l'information ailleurs.
- **Lire l'enveloppe.** La sonde du 8 septembre 2026 a montré que la coquille
  publique porte **deux** actions, et que le code n'en exploite qu'une. La
  seconde — l'enveloppe de la page tournoi — rend un en-tête bien plus riche que
  l'onglet « Présentation ».

Retenue : **l'enveloppe devient la source du lieu et des dates**, la carte
« Gymnases » ne servant plus qu'à l'adresse précise et au nom de la salle,
quand ils existent.

Elle est meilleure sur les trois points qui comptent :

```html
<a class="ic-click" id="date-cal"
   data-datedata='{"name":"…","startDate":"2026-11-14","endDate":"2026-11-15",
                   "location":"Chambly","startTime":"08:00","endTime":"17:00"}'>
```

- les **dates sont en ISO**, là où « Présentation » ne les donne qu'en libellé
  français à découper (« samedi 14 novembre ») ;
- la **ville est nommée** (`location`), sans avoir à la lire derrière un code
  postal dans une adresse saisie à la main — la découpe que 002 a dû inventer
  reste utile pour l'adresse complète, elle n'est plus le seul chemin ;
- l'enveloppe porte en outre l'**ouverture et la fermeture des inscriptions à
  l'heure près** (`div.limit > p > span`), que
  [[014__veille__rappel-ouverture-tournoi.feat]] attend et dont sa question
  ouverte doutait qu'elles fussent publiées.

## Questions

- ~~L'enveloppe porte-t-elle toujours `data-datedata` ?~~ **Oui — neuf fiches
  sur neuf**, relevées le 9 septembre 2026, chacune avec `startDate`, `endDate`
  et `location`. La carte « Gymnases » n'est plus un recours mais un
  complément : quand elle existe, ses journées priment, parce qu'elle donne le
  détail jour par jour là où l'enveloppe ne donne que deux bornes — un tournoi
  peut sauter un jour au milieu de son intervalle.
- ~~Que fait-on d'un tournoi dont l'enveloppe *et* la carte se taisent ?~~
  **Tranché** : `gymnase`, `adresse` et `ville` deviennent nullables, en base
  comme en mémoire. Une ville absente n'est pas une fiche illisible — la page
  sait dire « lieu non relevé ». La frontière est ailleurs : **l'attribut absent
  est une panne, le champ vide est une donnée manquante.** Un `data-datedata`
  disparu fait échouer la fiche, un `location` vide non.

## Ce que cette spec laisse ouvert

- **Les dates d'inscription sont lues, pas rangées.** L'enveloppe porte
  « Ouverture 01/09/2026 08:00 » et « Fermeture 01/11/2026 23:59 » dans
  `div.limit > p > span` ; 036 les observe sans les stocker, faute d'usage.
  C'est [[014__veille__rappel-ouverture-tournoi.feat]] qui les écrira — et une
  mise en garde pour elle : le tournoi 51483 en portait **trois**, une date
  supplémentaire précédant les deux autres. Se repérer sur le libellé, jamais
  sur le rang.
- **Le bloc des gymnases se ferme sur la section « Avis ».** Vérifié sur les
  neuf fiches, mais c'est une borne de mise en page : le jour où badnet
  intercale une section, la borne se déplace. Le contrôle qui compte est
  ailleurs — la phrase « Aucun gymnase renseigné » est un signal explicite, pas
  une absence déduite d'une capture ratée.
- **Le plafond de requêtes passe de deux à trois par tournoi.** La chaîne a un
  saut de plus. Sans conséquence pour 002 — douze tournois par saison —, à
  surveiller pour [[012__veille__recherche-de-tournois.feat]], qui en relèvera
  une centaine par jour.

## Notes

Défaut de 002, découvert par la sonde de
[[012__veille__recherche-de-tournois.feat]] — qui **bloque** sur lui : elle
sollicitera cette chaîne une centaine de fois par jour là où 002 l'appelait
douze fois par saison.

À traiter avant 012, et séparément d'elle : le défaut existe sans elle, et casse
une passe qui tourne tous les matins. Mêlé à une feature, on ne saurait plus, en
relisant l'historique, si la panne était réparée avant ou pendant.

L'enveloppe s'obtient par le même chemin que l'onglet : `GET` de la coquille,
puis POST sur `/index.php` avec l'action relevée, `mustache=1`, `eventid`, les
cookies anonymes et le jeton `ic_csrf`. Aucun identifiant nouveau à écrire en
dur — la coquille les porte tous les deux (027).

**Les deux actions sont sur le même `div`**, et c'est ce qui a failli coûter
cher : `data-inside_page` charge l'onglet, `data-ic_a` charge l'enveloppe. Le
premier relevé les a cherchées avec un `grep` sur tout le document et a ramené
l'action de l'accueil, que la barre de navigation porte plus haut. On lit donc
la balise, pas la page.

**La migration reconstruit `tournoi_journee` avec `tournoi`**, et pas par
symétrie : `foreign_keys` est à `ON`, la clé étrangère est `on delete cascade`,
et `drop table tournoi` exécute un `delete` implicite qui cascade sur tout ce
qui référence ce nom. La première version faisait pointer la table neuve sur
`tournoi` — les deux journées de test ont disparu au `drop`. Elle vise donc
`tournoi_nouveau`, et c'est le `rename` qui recoud la référence.

**Vérifié contre le vrai badnet le 9 septembre 2026**, sur cinq fiches :

```
51245 → Chambly         | gymnase —                        | 2026-11-14, 2026-11-15
50750 → Courbevoie      | Armand Silvestre                 | 2026-10-24, 2026-10-25
50898 → PRESLES         | Centre des Sports et Loisirs     | 2026-09-13
51483 → Vitry-sur-Seine | gymnase —                        | 2026-09-26
50564 → Nogent le Roi   | gymnase —                        | 2026-10-03
```

Trois d'entre elles échouaient la veille. 50750, celle sur laquelle 002 avait
été écrite, rend exactement ce qu'elle rendait.
