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

~~002 démarre donc avec une saisie manuelle en base : je recopie mes
engagements.~~ **L'ordre est inversé : cette spec passe devant 002.** Il n'y
aura pas de saisie manuelle à remplacer — 002 se contentera d'afficher ce que
celle-ci met en base, et c'est celle-ci qui dessine la table des engagements.
Construire une saisie qu'on jetterait ensuite serait du travail pour rien.

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

~~L'accès est le même rituel qu'en 015~~ — **et c'est faux, 015 l'avait déjà
signalé sans que personne ne le reporte ici.** myffbad n'a pas de 2FA : sa page
de connexion ne demande que licence et mot de passe, et Bado s'y connecte seul
depuis 015. C'est badnet qui en a une. Cette spec « tenait l'asymétrie à
l'envers », dans les mots de 015.

Il n'y a donc pas un rituel à réutiliser mais **un second temps à construire** :
identifiants, puis un code reçu par mail et recopié à la main. Le reste, lui, se
réutilise vraiment :

- jeton dans `jeton_source`, clé par source : la table a été faite pour ça ;
- identifiants en variable d'environnement, jamais en base ;
- écran de réauthentification partagé avec myffbad, une source à choisir ;
- plafond de requêtes et capture archivée avant analyse, comme toute
  acquisition.

**Les deux visages de badnet restent séparés.** La recherche publique de
[[012__recherche-de-tournois]] ne
doit jamais passer sous session : elle est aujourd'hui exempte du risque de
bannissement, et l'authentifier pour mutualiser un client HTTP reviendrait à
mettre l'index quotidien de `veille` sous le même risque que le reste. Un seul
module de parsing badnet — c'est la règle de 015 — mais deux entrées, deux
tâches ordonnancées séparément, deux modes de panne.

## Ce qui a été fait — premier temps

**Découpée en deux, et c'est l'ordre de 015 appliqué à la lettre** : « une base
minimale, puis la sonde d'accès jusqu'à extraire un match et un tournoi réels,
puis seulement le schéma définitif ». Personne n'avait jamais vu
`/competitions` : la sonde ne visite que le visage public de badnet, l'autre
étant derrière la 2FA. Ce premier temps livre donc **la session et la capture**,
rien d'autre. Pas de parseur, pas de table, pas de passe quotidienne.

**Les deux domaines sont le même site.** `badnet.org` et `badnet.fr` servent la
même application — pages d'accueil de 8 209 contre 8 205 octets, même moteur
`iclick`, même mur sur `/competitions`. Ce ne sont donc pas deux sources à
distinguer, mais bien les deux visages d'un même site, comme cette spec le
décrivait. La capture du 1er septembre est sur `badnet.fr`, et le JSON qu'elle
porte renvoie lui-même vers ce domaine.

**Une seule `Source`, deux tâches.** `Source` est la clé de `jeton_source`, et
il n'y a qu'une session badnet — la face publique n'en a pas. Une seconde valeur
créerait une ligne « session » permanente et vide sur un écran dont tout le
propos est de dire quelle session est morte. Le découplage passe par
l'identifiant de tâche : `acquisition:badnet:engagements`, distinct de
`acquisition:badnet`, pour qu'une session morte ne fasse pas passer la recherche
publique pour en panne — et que l'alerte de 019 ne parte pas pour la mauvaise
raison.

**L'identifiant d'action de la connexion est relevé à chaque tentative**, sur le
mur que `/competitions` sert publiquement. `ACTION_RECHERCHE`, elle, est écrite
en dur : une recherche qui casse se voit le lendemain dans un rapport, alors
qu'une connexion qui casse laisse la session mourir sans que rien ne la
renouvelle. Personne ne verrait la panne avant que la donnée n'ait un mois.

**L'identifiant est `BABO_LICENCE`**, à huit chiffres, zéros de tête compris :
c'est ce que badnet attend et ce que la migration `006` garantit déjà. Seul
`BABO_BADNET_MOT_DE_PASSE` s'ajoute — une seconde variable qui devrait toujours
valoir la première serait une occasion de les désaccorder.

**L'attente du code vit en mémoire, dix minutes.** Un redémarrage dans cet
intervalle veut dire qu'on recommence, pas qu'on perd quelque chose ; et cela
garde un cookie à moitié authentifié hors de la base, où l'on n'écrit que celui
qui marche.

**Le mur du code est testé avant le cookie**, et l'ordre n'est pas indifférent :
badnet est en PHP, et PHP pose un `PHPSESSID` dès le premier contact,
authentifié ou non. Un cookie présent ne prouve rien ; le mur du code, lui, est
un signal positif. Tester le cookie d'abord ferait prendre une demande de code
pour une session ouverte, et Bado repartirait avec un jeton qui n'ouvre rien.
Le défaut a été trouvé par un test, pas par une relecture.

**Si aucun code n'est réclamé, la session est prise telle quelle** — une 2FA qui
ne se déclenche pas, un appareil déjà connu. Coder « il y a forcément un code »
referait, en miroir, l'erreur que cette spec porte depuis le début.

**Le collage manuel du cookie est conservé**, comme celui de myffbad : c'est
l'issue de secours le jour où l'action bouge, où le formulaire change, ou où le
code n'arrive pas.

**Mesure du 4 septembre 2026, première connexion réelle.**

| Étape | Résultat |
|-------|----------|
| `GET /competitions` sans session | mur de connexion, 5 Ko, action relevée |
| `POST /index.php` avec licence + mot de passe | **200, 69 octets, session ouverte** |
| Code de vérification | **aucun n'a été demandé** |
| `GET /competitions` sous session | 200, 16 Ko, plus de mur |

**badnet n'a pas déclenché sa 2FA.** La réponse du POST tient en une
redirection JavaScript — `location='/tableau-de-bord'` — et le `Set-Cookie`
porte la session. C'est le cas prévu par cette spec, « si aucun code n'est
réclamé, on prend la session telle quelle », et il s'est présenté au premier
essai. Le second temps existe et reste en place : rien ne dit que la 2FA ne se
déclenchera pas depuis une autre adresse, ou après expiration du `remember`.

C'est, mot pour mot, ce que 015 a vécu avec myffbad : une 2FA affirmée par la
spec et jamais rencontrée. La différence est qu'ici on l'a écrite comme une
branche possible plutôt que comme une certitude, donc rien n'est à défaire.

**L'écran ne redirige plus en silence.** Au premier essai, la connexion a réussi
et la page est simplement revenue à `/sources` : on y a cherché un champ de code
qui n'avait pas lieu d'être, sans aucune confirmation que quoi que ce soit
s'était produit. Les deux issues sont désormais annoncées.

**La page des engagements est une coquille.** Les 16 Ko ne portent aucune ligne
de tableau : barre de navigation, menus, modales. La liste arrive par un appel
`ic_a` séparé, comme la recherche publique — et le shell porte une dizaine
d'identifiants d'action, dont celui qu'il faudra reconnaître. C'est la matière
du second temps.

**L'échéance de la session est devinée à un mois.** Le `PHPSESSID` ne porte
aucune date, contrairement au JWT de myffbad. `jeton_source.obtenu_le` dira la
durée réelle, en la mesurant.

## Ce qui a été fait — second temps

**badnet sert toutes ses pages en coquille.** `GET <url>` rend la barre de
navigation et une ancre `id="default_page"` portant l'identifiant de l'action
qui charge le contenu ; un POST sur `/index.php` avec cet identifiant rend le
fragment. Découvert en comparant deux coquilles : elles ne diffèrent que par cet
identifiant. **Aucun n'est donc écrit en dur** — ils changent avec le
déploiement, et ils sont toujours à relever sur la page qu'on demande.

La fiche d'un tournoi ajoute un troisième saut : son fragment ne porte pas
l'inscription mais un `autoload` qui la réclame, avec l'identifiant du tournoi
et ma licence. Sans lui, badnet répond pour `eventid: -1`.

**Le coût est de deux requêtes pour la liste et trois par fiche.** C'est cher,
et c'est le prix d'un site qu'on lit sans navigateur ; le plafond de 015 le
borne à trente-neuf, soit douze tournois par saison.

**`/competitions` porte trois cartes**, et une seule est la bonne : « Tournois
organisés » (ceux que le club met en place), « Mes tournois », « Tournois
nationaux ». Avaler les deux autres ferait apparaître dans mon agenda des
tournois où je ne joue pas.

**Les tableaux se lisent sur le formulaire de modification, pas sur le résumé.**
Le résumé dit « Oui (tableaux cachés par l'organisateur) » dès que celui-ci les
masque, ce qui est le cas courant — c'est le défaut que cette spec reprochait
déjà à la liste publique des inscrits. Le formulaire, lui, porte toujours ma
propre inscription, puisque c'est avec lui que je la changerais : le tableau en
option sélectionnée, le partenaire dans `partnaird` / `ac_partnaird`.

**La série vient avec le tableau** — « DH S4 » —, gardée telle quelle et jamais
interprétée : c'est la règle de 001 sur les lettres du barème. « Non » et
« Clt. trop élevé » ne sont pas des engagements : le premier dit qu'on ne joue
pas, le second qu'on ne peut pas.

**Remplacement intégral**, comme l'équipe de 005 : une inscription annulée sur
badnet disparaît d'ici, faute de quoi cette spec reproduirait l'oubli qu'elle
corrige, dans l'autre sens. Mais **une passe entièrement muette n'efface
rien** : vider l'agenda parce que la session est morte serait pire que ne rien
faire.

**Aucun engagement est un succès, pas une extraction vide.** On ne s'engage pas
toute l'année ; un `vide` au sens de 019 ferait partir une alerte à chaque
intersaison.

**Un défaut trouvé au premier test.** Le découpage des cartes cherchait le titre
n'importe où dans la page — il l'a trouvé dans un commentaire, et a découpé la
mauvaise carte. Le titre est désormais cherché dans le balisage du titre.

**Vérifié contre le vrai site le 4 septembre 2026** : un engagement relevé,
DH S4, partenaire nommé, « Inscription payée ».

**Les fixtures sont fabriquées, pas capturées.** La page réelle porte les seize
membres du club et la licence de mon partenaire ; une fixture n'a pas à emporter
les coordonnées de gens qui n'ont rien demandé (005, 021). Elles reproduisent la
structure relevée, avec des noms inventés.

## Ce qui reste — et qui n'est pas de cette spec

**Le lieu n'est pas dans cette source.** La liste de `/competitions` donne le
nom, la date et le type ; pas la ville. Or [[002__prochains-tournois]] promet
« date, lieu, tableaux engagés et partenaire ». Le lieu viendra de
[[012__recherche-de-tournois]], dont l'index public le porte avec les
coordonnées du gymnase — ou d'une fiche publique de tournoi, si 002 ne veut pas
attendre. C'est une question pour 002, pas pour celle-ci.

**Une seule date, pas un intervalle.** badnet rend un jour par tournoi. Le
chevauchement que 002 doit signaler se lira donc sur « le même jour » ; en
déduire un week-end fabriquerait une durée qu'aucune source ne donne.

## Questions

- ~~La 2FA badnet passe-t-elle par un code envoyé par mail, comme myffbad~~ —
  **la comparaison est fausse, myffbad n'a pas de 2FA.** Le code par mail est
  acquis ; **la durée du jeton reste à mesurer**, et `jeton_source` porte
  `obtenu_le` pour ça. La case `remember` du formulaire est envoyée, pour
  obtenir la plus longue que badnet accorde : chaque expiration coûte un
  aller-retour dans une boîte mail.
- ~~Les inscriptions en attente ou non confirmées sont-elles distinguables ?~~
  **Partiellement.** La fiche empile des phrases — « Inscription envoyée le … »,
  « Inscription enregistrée le … », « Inscription payée » — et c'est la dernière
  qui est gardée, telle quelle. Personne ne sait encore quelles autres valeurs
  elle prend ; en tirer une échelle à trois états inventerait une taxonomie qui
  ne correspondrait à rien. Le texte suffit à 002.
- ~~Un engagement saisi à la main puis retrouvé sur badnet : fusionné sur quelle
  clé ?~~ **Sans objet** : il n'y a pas de saisie manuelle, l'ordre avec 002
  ayant été inversé.
- ~~La page porte-t-elle le partenaire, que 002 affiche ?~~ **Oui**, licence et
  nom, par tableau — `partnaird` pour le double, `partnairm` pour le mixte. Un
  même tournoi peut donc avoir deux partenaires différents, ce que la table
  porte en une ligne par tableau.

## Notes

Dépend de [[015__source-de-donnees]] pour le rituel 2FA, l'écran de
réauthentification, le plafond de requêtes et l'archivage des captures ; de
[[017__persistance-sqlite]] pour le jeton ; de [[018__ordonnancement]] pour la
passe quotidienne ; de [[019__robustesse-du-scraping]] pour la panne
« session morte », qui vaudra ici comme là.

~~À traiter après [[002__prochains-tournois]]~~ : **l'ordre est inversé.** Cette
spec passe devant, dessine la table des engagements et la remplit ; 002 se
contente d'afficher ce qu'elle y met. Il n'y a donc aucune saisie manuelle à
construire puis à remplacer.
