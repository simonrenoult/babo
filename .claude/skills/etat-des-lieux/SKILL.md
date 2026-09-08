---
name: etat-des-lieux
description: État des lieux du dossier `spec/` de babo — fait sortir du backlog les specs débloquées, liste draft/backlog/todo/doing, classe les chantiers par complexité et recommande par quoi commencer. À invoquer quand on demande « où en sont les specs », « état des lieux », « qu'est-ce que je fais ensuite », « quoi de prêt à faire », ou avant d'ouvrir un chantier.
---

# État des lieux des specs

`spec/` est une file à cinq étages — `0. draft`, `1. backlog`, `2. todo`,
`3. doing`, `4. done`. Une spec se déplace de dossier en dossier **en gardant son
nom** : seul l'état est une arborescence. Ce skill lit cette file, la remet à
jour, et dit par quoi commencer.

## 1. Relever

```sh
python3 .claude/skills/etat-des-lieux/etat.py spec > /tmp/etat.json
```

**La dépendance est déclarée, pas devinée.** TEMPLATE.md impose à toute spec une
ligne `| bloquée par |` dans son tableau d'en-tête : c'est elle qui fait foi, et
une entrée barrée y est une dépendance levée. Le script la lit ; il ne
reconstruit rien.

Il rend un objet par spec : `id`, `module`, `type`, `etat`, `titre`, `lignes`,
`depend_de` (la ligne d'en-tête), `bloquants` (celles qui ne sont pas
`4. done`), `debloque`, `soupcons`, `questions` (les puces de `## Questions` non
tranchées), `ligne_absente`, `renvois_inconnus`.

Il ne rend que des faits. **Le jugement des sections 3 et 4 t'appartient** :
ne le délègue pas à un tri par nombre de lignes.

Signale tout `renvois_inconnus` non vide — c'est un renvoi cassé — et tout
`ligne_absente` — c'est une spec hors convention, dont on ne peut rien dire.
Les deux se corrigent avant le reste.

## 2. Faire sortir du backlog ce qui est débloqué

Candidates : les specs de `1. backlog` dont `bloquants` est vide.

**Lis intégralement chaque candidate avant de la déplacer.** La ligne d'en-tête
dit ce que l'auteur a déclaré, pas ce que la spec suppose. Le dépôt garde le cas
d'école : 006 a longtemps dépendu de 003 par un simple « **Et de [[003]]** » que
rien ne déclarait, et sa propre note dit que « sans ce renvoi, 006 paraissait
n'attendre que des specs faites, et serait sortie du backlog sur un tri qu'elle
aurait fait mentir ».

Le champ `soupcons` est cette contre-épreuve : les specs non faites que la prose
traite en dépendance sans que la ligne d'en-tête les porte. Ouvre chacune. Deux
issues :

- **c'est une vraie dépendance** → ajoute-la à la ligne `| bloquée par |`, dis
  dans les `## Notes` pourquoi elle manquait, et laisse la spec au backlog ;
- **c'est un simple voisinage** (« frontière avec », « même calcul que ») → la
  spec sort.

Déplace avec `git mv "spec/1. backlog/<nom>.md" "spec/2. todo/<nom>.md"` — le nom
ne change jamais. Annonce chaque mouvement avec son motif en une ligne.

Si rien ne bouge, dis-le : un backlog qui ne se vide pas est une information,
pas un échec du relevé.

## 3. Lister

Un tableau par étage — `0. draft`, `1. backlog`, `2. todo` —, colonnes : id,
titre, module, type, bloquants. Les drafts d'abord, ce sont les idées non
instruites ; les todo en dernier, ce sont les chantiers ouvrables.

## 4. Classer par complexité

La complexité n'est pas la longueur. Croise :

- **les questions ouvertes** (`questions`) — une spec qui en porte cinq n'est pas
  prête, elle est à instruire ;
- **le type** — un `tech` touche le socle, donc tout le monde ; un `fix` est
  borné par définition ;
- **la surface** — lis la spec : demande-t-elle une table nouvelle, une migration,
  une source externe, une passe d'acquisition ? Le scraping est la partie
  fragile du projet (015, 019) et coûte toujours plus que prévu ;
- **le nombre de renvois** — une spec qui amende trois specs faites en emporte
  la relecture.

Dis pour chacune ce qui la rend chère, en une phrase. Une spec longue mais sans
question ouverte est souvent plus simple qu'une spec courte qui en porte six.

## 5. Recommander

Classe par ce qui **débloque le plus** (`debloque`), en tenant compte de :

- un `fix` sur du code livré passe avant une feature — il tourne déjà tous les
  jours et il est déjà faux ;
- une spec qui bloque une spec de `2. todo` passe avant les autres todo ;
- une spec à questions ouvertes se **grille** (`/grill-me`) avant de s'écrire, on
  ne l'ouvre pas.

Trois recommandations au plus, chacune avec son motif en une phrase, et dis
franchement ce que tu écartes et pourquoi.

## 6. Ce qui est en cours

Si `3. doing` n'est pas vide, montre-le **en premier** dans la réponse finale, et
demande s'il faut le clore avant d'en ouvrir un autre. Deux chantiers ouverts en
même temps sur un projet à un seul développeur sont un chantier abandonné qui
s'ignore. Si `3. doing` est vide, dis-le en une ligne.
