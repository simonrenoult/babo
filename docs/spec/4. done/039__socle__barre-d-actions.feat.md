# Barre d'actions sous le titre

| Champ       | Valeur |
|-------------|--------|
| id          | 039    |
| module      | socle  |
| type        | feat   |
| bloquée par | —      |

## Problem Statement

Les gestes d'une page ne sont jamais au même endroit. « Créer une veille » est
en bas de `/veille`, sous le tableau — il faut dérouler la liste pour trouver
comment l'allonger. Sur la page d'une veille, Modifier, Suspendre et Supprimer
sont rangés en bas, sous un titre « Gérer cette veille ». « Exporter le
calendrier » est entre l'en-tête du calendrier et son tableau ; « Imprimer la
feuille » et « Copier pour WhatsApp » sont sous les cartes de composition ;
« Lancer maintenant », lui, est sous le titre de la tâche. Chaque page oblige à
chercher.

Les retours ne valent pas mieux. La page d'une tâche, d'une source et d'un
tableau portent un `← Tâches`, `← Sources`, `← Préférences` **au-dessus** du
titre ; la page d'une veille et son formulaire portent un « Retour aux veilles »
**en bas** de page. Deux formes, deux places, et sur une page longue le retour
est hors de vue.

## Solution

Une seule règle, partout : **les gestes se lisent immédiatement sous le titre
de ce qu'ils concernent**, sur une ligne — la **barre d'actions**. Un geste qui
concerne la page va sous le titre de la page ; un geste qui concerne une section
va sous le titre de cette section.

Sur une **sous-page**, la barre commence toujours par le lien de retour vers son
parent, `← <parent>`, même quand elle ne porte aucun geste. C'est le seul retour
de la page.

## User Stories

1. En tant qu'utilisateur, je veux trouver « Créer une veille » sous le titre de
   `/veille`, pour ne pas dérouler la liste pour l'allonger.
2. En tant qu'utilisateur, je veux qu'à cinq veilles le message « Cinq veilles,
   le maximum… » soit à la place du bouton, pour que l'endroit où je cherche le
   geste me dise pourquoi il manque.
3. En tant qu'utilisateur, je veux Modifier les critères, Suspendre/Réactiver et
   Supprimer sous le titre d'une veille, pour agir sur elle sans descendre sous
   ses résultats.
4. En tant qu'utilisateur, je veux que Supprimer soit le dernier geste de la
   barre, pour qu'il ne soit pas le premier que je rencontre.
5. En tant qu'utilisateur, je veux « Exporter le calendrier » juste sous les
   onglets du capitanat, pour l'exporter sans chercher entre l'en-tête et le
   tableau.
6. En tant que capitaine, je veux « Imprimer la feuille » et « Copier pour
   WhatsApp » sous le titre de la journée, au-dessus des cartes, pour les
   trouver sans descendre sous toute la composition.
7. En tant qu'opérateur, je veux « Lancer maintenant » sous le titre d'une
   tâche, à côté de `← Tâches`, pour que le retour et le geste se lisent d'un
   coup.
8. En tant qu'opérateur, je veux « Sonder » sous le titre d'une source, à côté
   de `← Sources`.
9. En tant qu'opérateur, je veux les gestes de session (Se connecter maintenant,
   Oublier cette session) sous le titre de leur section, parce qu'ils concernent
   la session et non la source entière.
10. En tant qu'opérateur, je veux « Envoyer un mail de test » sous le titre
    « Courrier ».
11. En tant qu'utilisateur, je veux sur chaque sous-page un lien de retour
    juste sous le titre, premier élément de la barre, pour remonter sans
    chercher.
12. En tant qu'utilisateur, je veux que ce retour mène au parent de la page, pas
    à l'historique du navigateur, pour qu'il reste juste après un envoi de
    formulaire.
13. En tant qu'utilisateur, je veux que le retour s'écrive toujours
    `← <parent>`, pour le reconnaître d'une page à l'autre.
14. En tant qu'utilisateur, je veux qu'une sous-page sans geste ait quand même sa
    barre, réduite au retour.
15. En tant qu'utilisateur, je veux un seul retour par page, pour ne pas me
    demander si les deux mènent au même endroit.
16. En tant qu'utilisateur, je veux que la modification d'une veille me ramène à
    cette veille, et sa création à la liste des veilles.
17. En tant qu'utilisateur, je veux que le résultat d'un geste (sonde, rapport
    de passe, état du mail de test) s'affiche juste sous la barre, là où je
    viens de cliquer.
18. En tant qu'utilisateur, je veux que chaque infobulle reste collée à son
    bouton dans la barre.
19. En tant qu'utilisateur sur téléphone, je veux que la barre passe à la ligne
    plutôt que déborder.
20. En tant qu'utilisateur, je veux que les boutons qui terminent un formulaire
    (Enregistrer, Importer, Saisir la paire…) restent sous les champs qu'ils
    envoient.
21. En tant qu'utilisateur, je veux que les boutons d'une ligne de tableau
    (Voir, Lancer, marques ★, Supprimer une paire) restent dans leur ligne.
22. En tant que développeur, je veux qu'une nouvelle vue suive la règle en
    réutilisant un gabarit commun, sans la réinventer.

## Implementation Decisions

- **Ce que la règle vise.** Un **geste** est un bouton qui agit sur la page ou
  sur une section : Créer une veille ; Modifier les critères, Suspendre/
  Réactiver, Supprimer (veille) ; Lancer maintenant ; Sonder ; Se connecter
  maintenant, Oublier cette session ; Envoyer un mail de test ; Exporter le
  calendrier ; Imprimer la feuille, Copier pour WhatsApp. Les boutons d'envoi qui
  terminent un formulaire restent sous leurs champs ; les boutons d'une ligne de
  tableau restent dans leur ligne ; les onglets et les infobulles ne sont pas des
  gestes.
- **Le titre de référence.** Le titre de la page est son `<h2>`. Sur les pages à
  onglets (`/capitanat/*`, `/parametres/*`), l'onglet actif tient lieu de titre :
  la barre vient juste sous le dernier niveau d'onglets. Le titre d'une section
  est son `<h3>` ou `<h4>`. Sur la page d'une tâche ou d'une source, le titre est
  le `<h3>` qui la nomme : la barre, retour compris, passe **sous** lui (le
  retour est aujourd'hui au-dessus).
- **Placement des gestes actuels.**
  - `/veille` : Créer une veille sous le titre ; à cinq veilles, le message du
    maximum occupe la barre. Pas de bouton grisé.
  - Page d'une veille : `← Veilles`, Modifier les critères (un lien habillé en
    bouton), Suspendre/Réactiver, Supprimer en dernier avec son infobulle. La
    section « Gérer cette veille » disparaît.
  - `/capitanat/calendrier` : Exporter le calendrier sous les onglets, quand un
    calendrier est importé.
  - Planification : Imprimer la feuille et Copier pour WhatsApp sous le `<h3>`
    de la journée, au-dessus des cartes.
  - Page d'une tâche : `← Tâches`, Lancer maintenant.
  - Page d'une source : `← Sources`, Sonder ; les gestes de session sous le
    titre de la section session.
  - Courrier : Envoyer un mail de test sous le titre « Courrier ».
- **Sous-pages et retour.** Une **sous-page** est une page atteinte depuis une
  autre et absente des onglets : la page d'une tâche, d'une source, d'un tableau
  du capitanat, d'une veille, et le formulaire de veille. Le retour mène au
  **parent hiérarchique**, en lien fixe (pas d'historique, pas de JavaScript) :
  tâche → Tâches, source → Sources, tableau → Préférences, veille → Veilles,
  création → Veilles, modification → la page de cette veille (`← <nom de la
  veille>`). Libellé unique `← <parent>`, lien simple et non bouton, toujours
  premier dans la barre. Les « Retour aux veilles » de bas de page disparaissent.
  La page d'erreur n'est pas une sous-page : son « Retour à l'accueil » reste.
- **Un gabarit partagé.** Le socle gagne une classe `barre-actions` — une ligne
  flexible qui passe à la ligne, les gestes qui postent gardant leur `<form>`
  mis en ligne, les infobulles suivant leur bouton — et un partial `retour`
  (chemin et libellé). Chaque vue écrit sa barre et y inclut le retour, comme
  elle inclut déjà `entete` et `pied`. (La spec prévoyait un partial qui reçoive
  aussi les gestes ; EJS n'a pas de blocs, et passer des formulaires en chaîne
  HTML aurait été pire que la classe.) Le formulaire de veille reçoit son
  retour de la route, qui seule sait s'il s'agit d'une création ou d'une
  modification.
- **Résultat d'un geste.** Rendu juste sous la barre d'actions : résultats de
  sonde, rapport de « Lancer maintenant », état du mail de test.
- **Documentation.** La convention s'écrit dans ARCHITECTURE.md, à l'interface
  du socle. Pas d'entrée au glossaire (convention d'interface, pas vocabulaire
  métier), pas d'ADR (facile à défaire).
- **Pas de changement de route, de port ni de schéma.** Seules les vues et la
  feuille de style bougent.

## Testing Decisions

- **Ce qui fait un bon test.** On teste ce que la page sert : l'ordre des
  éléments dans le HTML rendu — titre, puis barre, puis retour, puis gestes —
  sans tester le partial isolément ni le détail de ses classes au-delà de ce
  qu'il faut pour repérer la barre.
- **Une seule couture, déjà existante** : `test/interface.test.ts`,
  l'application assemblée visitée en HTTP.
- **Prior art.** « titre chaque page du nom de sa section, sous-pages
  comprises » boucle déjà sur une table de chemins et vérifie le HTML par
  expression régulière : les deux tests nouveaux suivent sa forme.
- **Cas couverts.**
  - Sur chaque sous-page (tâche, source, tableau, veille, création et
    modification de veille), la barre suit immédiatement le titre et son premier
    enfant est `← <parent>` vers le bon chemin ; aucun autre lien de retour sur la
    page.
  - La modification d'une veille renvoie à cette veille, la création à
    `/veille`.
  - Sur `/veille`, la page d'une veille, la page d'une tâche,
    `/capitanat/calendrier` et la planification, chaque geste est dans la barre
    qui suit son titre.
  - À cinq veilles, le message du maximum occupe la barre et « Créer une
    veille » n'apparaît pas.
  - Supprimer est le dernier geste de la barre d'une veille.

## Out of Scope

- **Les boutons d'envoi de formulaire** : ils restent sous leurs champs.
- **Les boutons de ligne de tableau** : ils restent dans leur ligne.
- **La navigation par onglets** et l'en-tête (Babo, Se déconnecter).
- **Un fil d'Ariane** à plusieurs niveaux : un seul retour, vers le parent.
- **Un retour par l'historique du navigateur.**
- **Les boutons grisés** : un geste impossible est remplacé par la raison.
- **La page d'erreur.**

## Further Notes

Prolonge [[033__socle__sources-en-sous-pages.tech]], qui a introduit les pages
de tâche et de source et leurs retours `← …`, et
[[037__socle__declencher-une-tache-a-la-main.feat]], qui a posé « Lancer
maintenant » sous le titre de la tâche et le rapport juste en dessous — la règle
généralise ce placement.
