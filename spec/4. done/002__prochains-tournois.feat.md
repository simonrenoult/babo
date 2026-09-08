# Lister mes prochains tournois

| Champ  | Valeur   |
|--------|----------|
| id     | 002      |
| module | mon-profil |
| type   | feat     |

## Contexte

Je m'inscris à des tournois plusieurs semaines à l'avance, via des canaux
variés (mail de l'organisateur, badnet, club). Le suivi se fait de mémoire ou
dans un agenda séparé.

## Problème à résoudre

Je n'ai pas de vue unique de mes engagements à venir : je peux oublier un
tournoi, ou m'inscrire deux fois sur le même week-end.

~~Résolu quand l'outil liste mes tournois à venir avec date, lieu, tableaux
engagés et partenaire, triés par date, et signale les chevauchements de
dates.~~ **Amendé le 5 septembre 2026** : « et signale les chevauchements de
dates » est retiré. Résolu quand l'outil liste mes tournois à venir avec date,
lieu, tableaux engagés et partenaire, **triés par date**.

Le signalement tombe pour une raison qui vaut d'être gardée : sur une liste
courte et triée par date, un chevauchement se voit à l'œil, et mieux qu'une
règle ne le dirait. badnet ne rend qu'une date sans durée sous session — un
signalement automatique se tairait donc sur un tournoi de trois jours qui en
recouvre un autre, et crierait au conflit sur deux tableaux du même tournoi si
on groupait naïvement par date. Un signalement qui se trompe dans les deux sens
est pire que pas de signalement du tout. Ce n'est pas un renoncement : c'est le
constat qu'une liste de douze lignes n'a pas besoin qu'on la lise à sa place.

- ~~Saisie manuelle des engagements.~~ Écartée : elle oublie exactement comme
  une mémoire oublie, et la double inscription — le problème que cette spec
  vise — reste invisible tant que la seconde n'a pas été recopiée.
- ~~Récupération automatique depuis myffbad.~~ Écartée par
  [[027__engagements-badnet]] : `/mes-inscriptions` reflète ce que la fédération
  enregistre, pas ce que j'ai engagé.
- **Récupération automatique depuis badnet, sous session.** Retenue, et portée
  par [[027__engagements-badnet]] : badnet est l'endroit où l'inscription se
  fait, donc celui où elle est complète.

~~À trancher une fois la faisabilité du scraping myffbad établie.~~ **Tranché** :
la sonde du 1er septembre 2026 a atteint `/mes-inscriptions`, 015 a cherché la
donnée à trois endroits, et 027 a retenu `badnet.fr/competitions`.

## Questions

- ~~Les inscriptions sont-elles visibles sur myffbad de façon exploitable, ou
  faut-il passer par une saisie manuelle ?~~ **Ni l'un ni l'autre : elles
  viennent de badnet**, sous session — voir 027.
- Faut-il gérer les inscriptions en attente / non confirmées ? **Reportée à
  027**, qui pose la même question sur `/competitions` : personne ne sait encore
  quels statuts badnet distingue, et inventer ici une échelle qui ne
  correspondrait à rien serait pire qu'une colonne absente.

## Notes

**Dépend de [[027__engagements-badnet]]**, qui acquiert les engagements et
dessine leur table. Cette spec les affiche, rien de plus.

Recoupe [[012__recherche-de-tournois]] : un tournoi trouvé par la veille doit
pouvoir devenir un engagement.

~~Bloquée par [[015__source-de-donnees]].~~ **Faite** : l'accès aux deux
sources est en place, sessions, plafond de requêtes et archivage des captures
compris.

~~Préalable : la table des engagements n'existe pas [...] c'est donc cette spec
qui la dessine.~~ **Inversé le 5 septembre 2026 :
[[027__engagements-badnet]] passe devant.**

Le raisonnement écrit ici la veille supposait que 002 démarrerait sur une saisie
manuelle, que 027 remplacerait ensuite. Construire une saisie pour la jeter est
du travail pour rien : 027 dessine la table des engagements et la remplit depuis
badnet, et **002 se contente d'afficher ce qui s'y trouve**.

Ce qui reste à cette spec est donc entièrement de la présentation : le tri par
date, le signalement des chevauchements, et la page. C'est peu, et c'est ce qui
la rend faisable d'un trait une fois 027 finie.

Elle partage toujours avec [[012__recherche-de-tournois]] la description d'un
tournoi — mais c'est 027 qui la paiera désormais.

**027 est faite (4 septembre 2026), et elle laisse deux manques à cette spec.**

- **Le lieu n'est pas dans la source.** `/competitions` donne le nom, la date et
  le type ; pas la ville. Le « résolu quand » ci-dessus promet pourtant « date,
  lieu, tableaux engagés et partenaire ». Le lieu viendra de
  [[012__recherche-de-tournois]], dont l'index public le porte avec les
  coordonnées du gymnase — ou d'une fiche publique de tournoi, si cette spec ne
  veut pas attendre 012. À trancher ici.
- **badnet ne rend qu'une date, pas un intervalle.** Le chevauchement se lira
  donc sur « le même jour » — `memeJour` est déjà écrite et testée dans le
  socle. Si « le même week-end » est ce qu'on veut, il faudra une source de
  durée qu'aucune page ne donne aujourd'hui.

## Tranché le 5 septembre 2026

**Le lieu vient de la fiche publique du tournoi, pas de l'index de 012.**
`badnet.fr/tournoi/public?eventid=<id>` est ciblée : elle répond pour *mes*
tournois, où qu'ils aient lieu. L'index public de 012 porte bien la ville — le
parseur de la recherche la rend déjà, sous la clé `place` —, mais il est
**géographique** : il rend les tournois d'un rayon, jamais les miens. Un
engagement hors du rayon n'y figure pas, et comme la donnée qui manque est
précisément le lieu, on ne peut pas savoir d'avance s'il faut élargir. Le lieu
retournera à 012 si, et seulement si, la fiche publique se révèle fermée.

**Le premier temps sonde avant d'écrire.** Personne n'a jamais vu cette page :
015 interdit d'écrire un parseur sur une page imaginée, et 027 vient de suivre
cet ordre à la lettre. 002 se fait donc en deux temps, le premier livrant la
page entière *sans* le lieu, plus la passe qui va chercher les fiches et les
archive sans rien en lire.

**Une passe anonyme et distincte** — `acquisition:badnet:tournois`. La fiche
publique ne demande pas de session : la mêler à la passe des engagements
mettrait une requête sans risque sous le même risque de bannissement que le
reste (015), et ferait passer pour morte une chaîne qui va très bien le jour où
la session tombe. C'est exactement le découplage que 027 a fait en séparant
`acquisition:badnet:engagements` de `acquisition:badnet`. Elle n'est pas
ordonnancée tant qu'elle n'extrait rien : une tâche périodique dont le succès et
l'échec sont indiscernables n'apprend rien au battement du lundi (019).

**Le lieu atterrira dans une table `tournoi`, pas dans une colonne
d'`engagement`.** 012 dit « la première des deux traitée la paiera pour
l'autre » : 002 passe devant, donc 002 paie. Une ville recopiée sur l'engagement
existerait à deux endroits le jour où 012 construit son index, et un fait
fédéral n'a pas deux versions selon qui le regarde — le raisonnement qui a fait
descendre `Classement` dans le socle. Les colonnes se décident sur la capture,
au second temps.

**Une section de `/mon-profil`, pas une page.** Le précédent de 029 — l'index et
ses cinq pages — s'est déclenché sur cinq pages d'un coup, pas sur une deuxième
section. La bascule se fera quand 003 ou 004 arrivera.

**« À venir » se compte depuis le début du jour**, pas depuis l'instant : un
tournoi se joue toute la journée, et le faire disparaître à midi une — le matin
même où on consulte la page pour savoir où l'on va — serait le contraire du but.

**La fraîcheur se lit sur le dernier succès de la passe**, et non sur la date
écrite à côté des lignes. Le remplacement intégral de 027 vide la table en
intersaison : la seule trace de la réussite partirait avec les lignes, et la
page dirait « jamais relevé » le lendemain d'une passe parfaite. `DepotRapports`
gagne pour cela un `dernierSucces`.

**Le statut s'affiche tel quel, et la boucle se ferme.** 002 renvoyait à 027 la
question des inscriptions en attente ; 027 la renvoyait à 002. La réponse est :
on affiche ce que badnet dit, on n'en tire aucune règle. Trois phrases observées
sur un seul tournoi ne font pas une taxonomie, et en inventer une à trois
valeurs serait fabriquer une échelle qui ne correspond à rien. C'est un choix,
plus un report ; une spec ultérieure pourra le rouvrir sur des données réelles.

**`/sources` rend la liste à la feature** et ne garde qu'un décompte et le
rapport de passe. C'est la frontière posée par 030 : l'écran d'exploitation
porte les gestes — relancer, diagnostiquer —, la feature porte la donnée.

## Fait — 5 septembre 2026

Les deux temps ont été menés le même jour, le premier ayant appris ce qu'il
fallait pour écrire le second.

**Le premier relevé a échoué, et c'est lui qui a tout donné.** Lancé sur
`/tournoi/public?eventid=…` — l'adresse que la recherche publie dans son JSON —
il a rapporté 8 Ko de page d'accueil commerciale : ni erreur, ni redirection, ni
ancre `default_page`. La capture archivée l'a dit sans qu'aucun parseur soit
écrit, exactement ce que 015 attend d'une sonde.

**Trois pièges, et le motif de 027 n'en couvrait aucun.** 027 avait établi que
« toute page de badnet est une coquille avec une ancre `default_page` » : c'est
vrai de l'application authentifiée, faux du site public.

- L'adresse est `/tournoi/public/informations` ; l'autre est une URL
  d'affichage, qui ne rend rien.
- L'action se relève dans `data-inside_page`, sur un `div` de `#main`, et non
  dans `default_page` — absent de cette coquille.
- badnet pose un jeton `ic_csrf` en cookie au premier contact et le réclame
  **aussi** dans le corps du POST.

Aucun de ces trois n'était devinable : c'est la requête réelle d'un navigateur
qui les a donnés. Rien n'est écrit en dur pour autant — l'action et le jeton se
relèvent tous deux sur la page, comme 027 l'exige.

**La fiche publique donne plus que le lieu.** Elle porte les **journées réelles**
du tournoi, une ligne par jour. 027 écrivait que « badnet ne rend qu'une date,
pas un intervalle » et que le chevauchement devrait se lire sur « le même
jour » : c'était vrai de `/competitions`, faux du site public. La page écrit donc
« du 24 au 25 octobre » au lieu de perdre la moitié d'un week-end. Le tri, lui,
reste sur la date de `/competitions`, la seule toujours disponible.

**La passe est incrémentale et anonyme.** Une ville ne change pas : un tournoi
déjà connu n'est jamais redemandé, et la plupart des jours la passe ne coûte
aucune requête. Elle consigne quand même — « 4 connus, aucun à relever » —,
faute de quoi le battement du lundi la croirait muette. Anonyme de bout en bout,
elle aboutit le jour où la session badnet est morte.

**La table `tournoi` est le début de l'index de
[[012__recherche-de-tournois]]**, qui disait « la première des deux traitée la
paiera pour l'autre ». 002 est passée devant et n'a écrit que le lieu et les
journées ; 012 y ajoutera la date limite, les tableaux proposés et les
classements admis.

Vérifié contre le vrai badnet le 5 septembre : `1 lieu(x) relevé(s) sur 1`,
`50750 → Courbevoie | Armand Silvestre | 2026-10-24, 2026-10-25`.

## Ce que cette spec laisse ouvert

- **Un seul gymnase est retenu** quand un tournoi en occupe plusieurs. La page
  répond à « où vais-je ce week-end », pas à « dans quelle salle joue mon
  tableau » — cette dernière n'est connue qu'au tirage.
- **Une adresse sans code postal ne rend aucune ville.** Mieux vaut « lieu non
  relevé » que le dernier mot d'une rue. Aucun cas observé à ce jour.
- **`ACTION_RECHERCHE` reste la seule action écrite en dur** du projet, et elle
  appartient à 012.
