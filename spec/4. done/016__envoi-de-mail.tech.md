# Envoyer des mails depuis l'application

| Champ  | Valeur |
|--------|--------|
| id     | 016    |
| module | socle  |
| type   | tech   |

## Contexte

Plusieurs specs ont besoin d'envoyer un mail : l'alerte de nouveau tournoi
[[013__alerte-nouveau-tournoi]], les rappels d'ouverture
[[014__rappel-ouverture-tournoi]] et le socle lui-même —
[[019__robustesse-du-scraping]] signale par mail les échecs de scraping et
émet un battement hebdomadaire.

Aujourd'hui cette brique est décrite dans 013, une spec de feature dont 014 se
déclare dépendante.

## Problème à résoudre

L'envoi de mail est une dépendance transverse logée dans une feature. Comme 013
dépend de [[012__recherche-de-tournois]], qui dépend de
[[015__source-de-donnees]], qui a lui-même besoin d'envoyer des mails, le
backlog se referme sur lui-même : la brique se retrouve en aval des specs
qu'elle alimente, et rien ne peut être traité en premier.

Résolu quand un module unique porte l'envoi de mail, que 013, 014 et 015
l'utilisent sans rien connaître du transport, et qu'un échec d'envoi est
observable autrement que par un mail.

## Solutions envisagées

- SMTP d'un fournisseur personnel. Pas de dépendance à un tiers, mais
  délivrabilité incertaine depuis un serveur perso : les mails partis d'une IP
  résidentielle finissent souvent en indésirables, ce qui est un mode de panne
  silencieux de plus.
- Service tiers avec API. Délivrabilité correcte et échecs remontés
  explicitement, au prix d'un compte externe.

~~À trancher — c'est la seule vraie question de cette spec, et le critère est
la délivrabilité, pas la simplicité de mise en œuvre.~~ **Le critère s'est
effondré, et la question avec lui.** Il était bâti quand des mails partaient
vers des tiers ; or [[008__disponibilites-interclubs]] a été amendée — Bado n'a
pas les mails des coéquipiers et ne relance plus personne — et 013 comme 014
n'écrivent qu'à moi. **Tous les destinataires sont une seule adresse : la
mienne.** Un mail qu'on s'envoie à soi-même se met en liste blanche une fois, et
le spam cesse d'être un mode de panne.

**Retenu : le SMTP d'un compte Gmail, par `nodemailer`.** Le vrai critère
n'était plus la délivrabilité mais le coût en dépendances, et `nodemailer` a la
particularité rare d'être sans aucune dépendance transitive : l'argument qui
avait fait refuser `jsonwebtoken` et `bcrypt` à [[021__authentification]] ne
tient pas contre lui, il n'y a pas d'arbre à auditer.

**Port 465, chiffrement déduit du port.** TLS dès le premier octet, sans
bascule `STARTTLS` en cours de dialogue, donc sans fenêtre où les identifiants
partiraient en clair si la négociation échouait. Le chiffrement n'est pas un
réglage : deux réglages qui doivent s'accorder sont un réglage de trop.

**Gmail exige un mot de passe d'application**, donc la validation en deux étapes
sur le compte : le mot de passe du compte est refusé. Et l'expéditeur est imposé
par le compte authentifié — sans conséquence ici.

Contraintes :

- Le module ignore le contenu métier : il envoie un message, il ne décide pas
  quand ni pourquoi.
- Un échec d'envoi ne peut pas être signalé par mail. Il est consigné dans le
  rapport d'exécution et visible dans l'interface.
- En développement et en test, les mails sont écrits en base plutôt qu'envoyés.

**Tout message est écrit en base avant d'être remis**, en développement comme en
production. Le mode « écrit plutôt qu'envoyé » n'est donc pas un adaptateur de
plus : c'est le cas où personne ne vide la file. Un seul chemin de code, ce qui
évite le classique « ça marchait en test ». Et c'est ce qui rend le réessai
possible sans rejouer la tâche appelante — un mail raté pendant une passe de
scraping ne doit pas relancer le scraping, ni le compte dont le bannissement est
un risque assumé (015).

## Questions

- ~~SMTP personnel ou service tiers ?~~ **SMTP de Gmail, par `nodemailer`** —
  voir ci-dessus.
- ~~Un envoi qui échoue est-il réessayé, et combien de fois avant abandon ?~~
  **Trois tentatives : immédiate, à cinq minutes, à trente. Puis abandon
  consigné.** Ce qu'on rattrape est une coupure réseau ou un Gmail momentanément
  indisponible ; au-delà, c'est une panne à voir, pas à retenter. Sans plafond,
  une panne de transport devient une file qui grossit sans fin, et le jour où le
  service revient, quinze alertes périmées partent d'un coup.

  Les délais de [[018__ordonnancement]] — une heure, puis quatre — ne
  conviennent pas : ils sont calibrés pour une passe dont la donnée est
  simplement périmée, et quatre heures de retard sur une alerte de tournoi,
  c'est l'alerte perdue.

  **Les reprises sont des échéances ponctuelles**, inscrites par le courrier
  lui-même. C'est ce qui donne l'espacement exact sans ajouter de cadence
  périodique à 018, ce qui les fait survivre à un redémarrage — ce sont des
  lignes en base —, et ce qui évite qu'un balayage toutes les cinq minutes
  écrive trois cents rapports par jour disant « rien à faire ». Un balayage
  **quotidien** subsiste, et ne ramasse que les orphelins : le message écrit
  juste avant un arrêt brutal, qui n'a eu ni tentative immédiate ni reprise
  inscrite.

  Grâce de 24 h. Une alerte de panne vaut encore quelque chose six heures plus
  tard, la panne durant toujours ; au-delà d'une journée, l'information est
  périmée ou déjà remplacée par le battement hebdomadaire de 019.
- ~~Une seule adresse de destination (la mienne), ou faut-il déjà prévoir
  l'envoi aux coéquipiers pour [[008__disponibilites-interclubs]] ?~~ **Une
  seule adresse, en configuration.** 008 a refermé cette porte : sans colonne
  mail dans l'import de [[005__liste-des-membres-de-l-equipe]], il n'y a
  personne d'autre à qui écrire. Prévoir une liste serait construire pour un
  besoin qu'une spec a écarté par écrit.

## Ce qui a été fait

Un **message** porte un sujet, un HTML obligatoire et un texte facultatif. Le
HTML est systématique ; exiger les deux versions de chaque message serait du
travail d'écriture perpétuel pour un risque quasi inexistant — aucun client
grand public ne refuse le HTML, et `nodemailer` ne sait pas dériver le texte
tout seul, l'option qui le faisait ayant disparu avec sa version 2. Le seul
effet mesurable d'un message HTML seul est un score de spam légèrement moins
bon, et ce score ne décide de rien quand on s'écrit à soi-même.

Le sujet est **préfixé de `[Bado] `**, pour qu'un filtre s'y pose une fois pour
toutes. Un préfixe par nature figerait une taxonomie que 013, 014 et 019 n'ont
pas encore écrite.

**Sans configuration SMTP, l'application démarre quand même** : les messages
s'empilent en base, personne ne les remet, et `/sources` le dit. C'est le motif
de `BABO_MYFFBAD_MOT_DE_PASSE` — une capacité facultative se dégrade. Refuser
de démarrer est réservé à ce sans quoi l'application serait dangereuse : une
base non chiffrée (017), une porte sans serrure (021). La configuration est
**tout ou rien** : une moitié de réglages ferait croire qu'on alerte alors qu'on
n'alerte pas, exactement le mode de panne que 019 combat.

**Rien n'est purgé** — messages envoyés comme abandonnés. Quelques messages par
semaine ne pèsent rien, et l'historique répond à la seule question qu'on se
posera vraiment : « est-ce que l'alerte est partie, et que disait-elle ? ».

**Un bouton « mail de test » sur `/sources`**, qui passe par la boîte d'envoi
comme tout le reste. Un bouton qui emprunterait un autre chemin que celui qu'il
prétend vérifier pourrait réussir pendant que le vrai chemin est cassé. Sans
lui, on découvrirait un mot de passe d'application faux au moment de la première
panne — c'est-à-dire au pire moment.

Le vidage **ne consigne un rapport que lorsqu'il s'est passé quelque chose**, ce
qui a demandé un amendement à 018 : `TacheOrdonnancee.executer` rend désormais
`RapportArchive | null`. Une tâche qui balaie une file tournerait sinon à vide
chaque jour et noierait l'historique que 019 doit rendre lisible.

Le dialogue SMTP est testé contre un **faux serveur local**, sur les deux façons
dont une alerte se perdrait en silence : authentification refusée, et connexion
coupée en plein dialogue. Les transports de test de `nodemailer` ne peuvent
simuler ni l'un ni l'autre — ils ne se connectent à rien. Ce serveur écoute en
clair : **TLS n'est pas couvert**, et c'est le trou assumé de ce choix.

## Notes

Utilisé par [[013__alerte-nouveau-tournoi]],
[[014__rappel-ouverture-tournoi]] et [[019__robustesse-du-scraping]].
**Plus par [[008__disponibilites-interclubs]]** : ce lien datait de la version
où l'outil relançait lui-même les silencieux, que 008 a écartée faute d'adresses
en base.

Le battement hebdomadaire de [[019__robustesse-du-scraping]] est le seul moyen
de s'apercevoir que cette brique est morte : sans mail, le silence est
indiscernable du fonctionnement normal.

À traiter avec ou avant [[019__robustesse-du-scraping]], qui en est le premier
appelant.
