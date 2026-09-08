# Rechercher des tournois selon des critères

| Champ   | Valeur                                                                                      |
|---------|---------------------------------------------------------------------------------------------|
| id      | 012                                                                                         |
| module  | veille                                                                                      |
| type    | feat                                                                                        |
| bloquée | [[036__socle__fiche-publique-sans-gymnase.fix]], ~~[[015__socle__source-de-donnees.tech]]~~ |

## Contexte

Les tournois sont publiés au fil de l'eau sur badnet. Trouver ceux qui me
concernent suppose de parcourir des listes non filtrées sur ce qui compte
vraiment pour moi.

Et je ne cherche pas une fois : je surveille, en continu, selon **plusieurs**
jeux de critères qui n'ont rien à voir entre eux — le DH que je joue avec Louis
n'a ni la même zone, ni les mêmes séries, ni la même fenêtre que le week-end en
région où j'emmène l'équipe.

## Problème à résoudre

Chercher un tournoi est fastidieux : je ne peux pas filtrer d'un coup sur la
distance, la date, les tableaux proposés et mon classement d'admission. Je
passe à côté de tournois qui m'auraient convenu.

~~Résolu quand l'outil retourne les tournois à venir filtrés sur : périmètre
géographique, fenêtre de dates, tableaux proposés, série ouverte à mon
classement, et date limite d'inscription.~~ **Amendé le 8 septembre 2026** : une
recherche à un seul jeu de critères ne répond qu'à la moitié du besoin, et ne
donne à [[013__veille__alerte-nouveau-tournoi.feat]] rien à quoi s'accrocher
quand personne ne regarde l'écran.

Résolu quand je peux **créer, nommer, modifier, suspendre et supprimer des
veilles** — cinq au plus —, chacune retenant les tournois à venir sur son
périmètre géographique, sa fenêtre de dates, ses tableaux, ses séries admises,
ses catégories d'âge et l'état de ses inscriptions.

## Solutions envisagées

- ~~Interroger badnet à chaque recherche.~~ Toujours à jour, mais lent, fragile,
  et sans mémoire : impossible de dire ce qui est nouveau.
- **Une collecte quotidienne par veille**, puis lecture en local. Cinq requêtes
  par jour, et surtout un index daté — indispensable à 013.

Écartée : une collecte unique et large, filtrée ensuite par chaque veille. Elle
évitait le rattrapage de 013 à chaque veille nouvelle, mais supposait de couvrir
le périmètre de toutes les veilles présentes **et futures** — donc la France
entière. Cinq veilles, c'est cinq requêtes : le volume ne justifie pas de
collecter ce que personne ne regarde.

**Une veille n'est pas une configuration du formulaire badnet.** « DH » et
« D7 D8 D9 » s'y traduisent ; « moins d'une heure en transports depuis Paris » et
« proche de la mer » n'existent nulle part chez lui. La veille porte donc un
modèle à elle, qu'un adaptateur traduit en formulaire — ce qui la met aussi à
l'abri du jour où badnet renomme un champ, ou change le sens des identifiants de
comité qu'il utilise pour ses départements.

**Ce qui part dans la requête, et ce qui reste en local.** Part ce que la sonde
du 8 septembre 2026 a vérifié : la zone (`city`, `rayon`), `coming`,
`type_event`, les catégories d'âge, et les disciplines — dont le OU est exact.
Reste en local ce dont on ne sait pas ce qu'il filtre : les cases de classement,
où `nc=1` seul ne filtre rien et où la sélection ne recoupe pas le champ `clt`
rendu. Un filtre dont on ignore la portée écarte des tournois sans qu'on sache
lesquels — précisément ce que cette spec veut cesser de subir.

Reste en local aussi la **distance à vol d'oiseau**, recalculée sur les `lat`
et `lng` du JSON : le `rayon` de badnet n'est pas une coupe stricte — Chambly,
à 65 km, ressort d'un rayon 50 — et son champ `distance` est faux quand il n'est
pas vide (9 km annoncés pour 1,6 km réels).

**Les tableaux et les séries se lisent sur la fiche, jamais sur la recherche.**
Le JSON ne rend que des familles (`"N, R, D, P, NC"`), et il ment : un tournoi
dont la fiche exclut N1 s'y annonce `N`. La fiche publique, elle, nomme les
tableaux — SH, SD, DH, DD, MX, avec effectif et jour — et les séries rang par
rang. C'est donc la passe de fiches de
[[002__mon-profil__prochains-tournois.feat]] qui les relève, **élargie** : elle
sert désormais les engagements et les veilles, plafonnée à une centaine de
fiches par passage, le reste repris le lendemain. Deux passes se disputeraient
les mêmes lignes et relèveraient deux fois la même fiche le même matin.

**Un tournoi qui ne déclare rien est gardé à part.** Deux sur quarante-six n'ont
ni date, ni classement, ni discipline : l'organisateur n'a pas fini sa saisie.
Ce sont exactement les tournois fraîchement publiés — ceux que 013 existe pour
attraper. « Indéterminé » n'est pas « aucun tableau » : ils s'affichent dans un
bloc distinct plutôt que de disparaître en silence.

## Questions

- ~~La distance se calcule-t-elle à vol d'oiseau ou en temps de trajet ?~~
  **Tranché** : à vol d'oiseau en v1, faute de mieux. Le temps de trajet est le
  vrai critère et il fait l'objet de [[034__veille__zones-de-recherche.feat]].
- ~~Un tournoi disparu de badnet reste-t-il dans l'index ?~~ **Tranché** :
  l'appartenance à une veille se termine (`sorti_le`), le tournoi reste. Avec une
  requête par veille, l'absence a deux sens — annulé, ou hors critères — et seule
  une appartenance datée les distingue. C'est ce qui garde les rappels de
  [[014__veille__rappel-ouverture-tournoi.feat]] quand je resserre un rayon, et
  ce qui évite qu'un tournoi qui sort puis rentre réalerte.
- Faut-il une cadence par veille ? Non en v1 : elles cherchent toutes dans le
  même badnet, qui publie au même rythme.

## Notes

Socle du module `veille`. Alimente [[002__mon-profil__prochains-tournois.feat]]
une fois l'inscription faite.

**La table `tournoi` est partagée, pas dupliquée.** 002 l'a créée pour mes
engagements ; 012 y ajoute le nom, les coordonnées, la date limite, les familles
et les catégories, et rend `gymnase` et `adresse` nullables — la recherche ne les
donne pas. Une table par veille en garderait cinq exemplaires : cinq villes,
cinq dates limites, cinq relevés de fiche. C'est l'argument que 002 a déjà écrit
en séparant `tournoi` d'`engagement`.

Ce qui est propre à la veille vit donc dans une table d'appartenance —
`(veille, tournoi, vu_le, sorti_le)`. `alerte_le` appartient à 013 : « déjà
alerté » est un fait du couple, pas du tournoi, et deux veilles qui se recouvrent
alertent chacune la première fois qu'elles voient un tournoi. Le nom de la veille
dans le mail est ce qui dit pourquoi il m'est signalé.

**Une tâche unique**, `acquisition:badnet:veilles`, quotidienne à 5 h 15 — entre
les engagements de 5 h et les fiches de 5 h 30, pour que ce qu'une veille
découvre soit détaillé un quart d'heure plus tard. Sans enchaînement : coupler
une passe anonyme au sillage d'une passe sous session est ce que 015 interdit.
Échec ligne à ligne, comme la passe de classement : « 4 veilles sur 5, "Tournois
en région" muette ». Grâce de 12 h.

**L'écart est consigné à chaque passe.** `data-markers` ne porte que les
tournois géolocalisés — 46 sur les 54 annoncés par le `p.cpt` du fragment, les
absents étant ceux dont le lieu n'est pas géocodable (« Comité Départemental
93 », « Fédération Française de Badminton »). On les ignore : un tournoi sans
coordonnées n'est de toute façon pas filtrable à la distance. Mais la
comparaison est gratuite, et c'est le signal que 019 réclame — le jour où
badnet cesse de géolocaliser, le rapport le dit au lieu que l'index maigrisse
en silence.

**La date limite vient de la recherche**, dans l'attribut `title` de `deadline`
(« Inscr. av. le 03/09/2026 ») : présente partout, gratuite, au jour près — ce
qui suffit à filtrer. L'ouverture et la fermeture à l'heure près sont sur
l'enveloppe de la fiche, et c'est 014 qui en a besoin.

**Les séries sont saisies, pas déduites de mon classement.** Une paire entre par
la série la plus haute des deux, mon classement bouge à chaque CPPH, et une
veille qui change de sens toute seule un vendredi matin est une veille à qui je
ne fais plus confiance. Le formulaire propose mes séries du moment comme valeur
de départ.

`/veille` en index — nom, état, décompte, dernier relevé —, `/veille/<id>` par
veille, triée par date. Les formulaires vivent là et non sur `/sources` :
saisir une veille *est* la feature, l'arbitrage rendu par
[[030__capitanat__paires-et-preferences-du-capitaine.feat]].

Écarté de la v1 : le filtre « places disponibles », qui porte sur une jauge
souvent vide — [[035__veille__places-disponibles.feat]] ; et le tri par
« promu », que badnet vend et qui n'est donc pas une information.

**Bloquée par [[036__socle__fiche-publique-sans-gymnase.fix]]** : la chaîne de
fiche que cette spec va solliciter cent fois par jour échoue aujourd'hui sur un
tournoi dont l'organisateur n'a pas saisi de gymnase.

~~Bloquée par [[015__socle__source-de-donnees.tech]].~~ **Faite** : la recherche
badnet est **publique et anonyme** — un POST sur `/index.php`, sans cookie, dont
la réponse embarque la liste en JSON dans `div.b-markers`. Elle ne doit jamais
passer sous session, sous peine de mettre la veille quotidienne sous le même
risque de bannissement que le reste.
