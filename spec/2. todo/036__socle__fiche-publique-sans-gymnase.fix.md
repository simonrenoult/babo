# Lire la fiche publique d'un tournoi sans gymnase

| Champ   | Valeur |
|---------|--------|
| id      | 036    |
| module  | socle  |
| type    | fix    |
| bloquée | —      |

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
regex non gourmande court alors jusqu'à la `</table>` **suivante**, hors du
bloc, `PREMIER_GYMNASE` échoue, et `accesAuxFichesPubliquesBadnet` lève
`FichePubliqueIllisible("de carte « Gymnases » lisible")`.

Ce n'est pas un cas marginal : relevé le 8 septembre 2026 sur le tournoi 51245
(« Tournoi des portes de l'Oise »), à venir, inscriptions ouvertes, jauge à
110/400. Un tournoi parfaitement normal fait donc échouer la passe — et
[[019__socle__robustesse-du-scraping.tech]] envoie une alerte pour une panne qui
n'en est pas une.

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

- L'enveloppe porte-t-elle toujours `data-datedata` ? Relevée une fois ; à
  vérifier sur plusieurs tournois avant de s'y appuyer seule. À défaut, la carte
  « Gymnases » reste le recours, bornée cette fois à son bloc.
- Que fait-on d'un tournoi dont l'enveloppe *et* la carte se taisent ? Une ville
  absente n'est pas une fiche illisible : la page sait déjà dire « lieu non
  relevé ».

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
