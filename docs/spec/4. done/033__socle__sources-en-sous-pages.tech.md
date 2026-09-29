# Découper l'écran des sources en sous-pages

| Champ       | Valeur |
|-------------|--------|
| id          | 033    |
| module      | socle  |
| type        | tech   |
| bloquée par | —      |

## Contexte

[[015__socle__source-de-donnees.tech]] a ouvert `/sources` pour une seule
chose : rendre une session à un scraper qui l'a perdue. Chaque spec de socle y
a ensuite déposé son bloc, parce que c'était le seul écran d'exploitation —
l'ordonnancement de [[018__socle__ordonnancement.tech]], les exécutions de
[[019__socle__robustesse-du-scraping.tech]], le courrier de
[[016__socle__envoi-de-mail.tech]], l'import de
[[005__capitanat__liste-des-membres-de-l-equipe.feat]], les engagements de
[[027__socle__engagements-badnet.tech]], la passe publique de
[[002__mon-profil__prochains-tournois.feat]].

L'écran porte aujourd'hui onze sections et douze formulaires, dans une vue de
545 lignes servie par un routeur de 405, derrière un port `AccesAuxSources` de
dix-huit méthodes. Un seul `GET /` les affiche toutes ; chacun des onze `POST`
re-rend la page entière.

Deux specs encore ouvertes y ajouteraient un bloc :
[[031__socle__journalisation-des-actions.tech]] un journal,
[[023__socle__sauvegarde.tech]] l'état des sauvegardes.

## Problème à résoudre

**Ce qu'on cherche est loin de ce qu'on regarde.** Coller un cookie de session
se fait au bas de la page, sous les quatre boutons de passe et les trois
tableaux de surveillance. Le geste qui a motivé l'écran est celui qu'il faut le
plus dérouler pour atteindre.

**Toute la donnée est lue à chaque affichage.** `ecran()` appelle `etats`,
`deploiements`, `ordonnancement`, `rapports`, `courrier`, `engagements` et
`codesAttendus` quel que soit le motif de la visite — y compris après un simple
réglage de cadence.

**Le résultat d'un geste est un champ optionnel du modèle de vue.** `sonde`,
`passe`, `equipe`, `mailDeTest`, `engagements`, `tournois`, `connexion` :
sept nullables portés par toutes les réponses, dont six valent `null` à chaque
fois. Et quatre `POST` redirigent vers `/sources`, donc perdent leur résultat.

**Le nom ment déjà.** Les sections « Ordonnancement », « Exécutions » et
« Courrier » ne parlent d'aucune source, et l'entête n'offre qu'un seul lien
pour les onze.

Attendu : un geste d'exploitation tient dans une page qu'on atteint sans
dérouler, chaque page ne lit que ce qu'elle affiche, et le résultat d'un `POST`
revient sur la page qui l'a déclenché.

Résolu quand aucune vue de l'écran d'exploitation ne dépasse 200 lignes, quand
aucun rendu n'appelle une méthode du port dont il n'affiche pas le résultat, et
quand `npm run verifier` passe sans changement de comportement.

## Solutions envisagées

- **Par nature du geste** — retenue à ce stade. Quatre pages : *Sessions*
  (états, enregistrer un jeton, code de vérification, oubli, déploiements,
  sonde), *Passes* (les quatre relevés et leurs rapports, l'import d'équipe),
  *Ordonnancement* (cadences et grâces), *Surveillance* (exécutions, courrier,
  et demain le journal de 031). Chaque page est un port de quatre à six
  méthodes, et chaque bloc futur sait où atterrir. Coût : « déploiements » et
  « sonde » sont à cheval — ils mesurent la source, mais servent à diagnostiquer
  une passe qui échoue.
- **Par source** — une page myffbad, une page badnet. C'est la découpe que le
  nom `/sources` promet, et elle range naturellement session, déploiement et
  sonde. Mais l'ordonnancement, le courrier et l'import n'appartiennent à
  aucune source, et il faudrait quand même une page transverse : la découpe ne
  couvre que la moitié de l'écran.
- **Une page, des onglets côté client.** Le déroulement disparaît, tout le
  reste demeure : un seul rendu, un seul port, toute la donnée lue à chaque
  fois. Ça déguise le problème.
- **Ne rien découper, se contenter d'un sommaire en haut de page.** Le moins
  cher, et suffisant si le seul grief était le défilement — mais 031 et 023
  ajouteront leur bloc, et le port continuera de grossir.

**Le point dur est l'adresse.** `/sources` est aujourd'hui monté avec des
routes `/:source/jeton`, `/:source/connexion`, `/:source/code`,
`/:source/oubli` : un segment libre au premier niveau. Une sous-page
`/sources/passes` entrerait dans ce moule et ne serait refusée que par la
validation qui n'admet que `myffbad` et `badnet`. Il faut donc soit préfixer
les sessions (`/sources/sessions/:source/jeton`), soit renommer la section.
`/exploitation` dirait ce que la section fait — c'est le mot qu'emploient déjà
`ARCHITECTURE.md` et les commentaires de 030 — et laisserait `/sources` à la
page des sessions, qui est la seule à parler vraiment des sources.

## Questions

- L'axe : par geste ou par source ? Le second est plus honnête au nom actuel,
  le premier couvre tout l'écran.
- La section se renomme-t-elle `/exploitation` ? C'est une redirection à poser
  et une entrée de nav à changer, mais aussi dix-huit renvois à `/sources`
  dans les specs déjà closes, qui décrivent l'état du jour où elles ont été
  écrites — les réécrire serait mentir sur leur date.
- Un port par page, ou un `AccesAuxSources` unique dont chaque routeur ne
  consomme qu'une partie ? Quatre ports coupent net la dépendance, mais
  `serveur.ts` les câblerait un par un.
- Où vont « Déploiements » et « Sonder l'accès » — avec les sessions qu'ils
  mesurent, ou avec les passes qu'ils dépannent ?
- L'import d'équipe est-il une passe ? Il est le seul geste d'écriture d'une
  feature qui vive ici, et [[032__socle__code-range-par-feature.tech]] pourrait
  le déplacer d'abord.
- Que devient `routeur-sources.test.ts` — 617 lignes qui interrogent toutes
  `/sources` ? Un fichier par sous-page suit la découpe, mais c'est le même
  déplacement transverse que 032, et deux à la fois rendraient le diff
  illisible.
- Quand ? Après 031, qui saura alors où poser son journal, ou avant, pour lui
  donner une page vide plutôt qu'un douzième bloc ?

## Notes

Amende la section « La porte » d'`ARCHITECTURE.md`, et le tableau « où vit
quoi » qui désigne `presentation/vues/sources.ejs`.

L'entête de [[021__socle__authentification.tech]] n'affiche qu'un lien par
module. Une section à quatre pages demande une navigation secondaire, portée
par les pages elles-mêmes et non par `entete.ejs` — sinon chaque module devrait
connaître les sous-pages du socle.

Le `SameSite=Strict` de 021 protège les formulaires quel que soit leur chemin :
la découpe ne touche pas à la question CSRF.

**Livrée le 30 septembre 2026, par un autre axe que ceux envisagés** : ni par
geste ni par source, mais par rubrique, sous le nom **Paramètres**
(`/parametres`, `/sources` redirigeant). Onglets servis côté serveur, chacun à
son chemin : *Scrapping* (tâches, sessions de connexion, sondes, emails, logs
d'exécution, déploiement, sources), *Import équipe*, *Import calendrier*,
*Import disponibilités*, *Engagements*.

Les critères de résolution tiennent : une vue par onglet, aucune au-delà de
200 lignes ; chaque onglet ne lit du port que ce qu'il affiche ; le résultat
d'un `POST` revient sur l'onglet qui l'a déclenché. Le point dur de l'adresse
est levé par le préfixe : les sessions vivent sous
`/parametres/scrapping/sessions/:source/…`. Le port `AccesAuxSources` est resté
unique — le découper suivra si un onglet grossit.
