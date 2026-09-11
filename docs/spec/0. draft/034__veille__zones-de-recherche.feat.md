# Décrire le périmètre d'une veille autrement qu'en kilomètres

| Champ       | Valeur |
|-------------|--------|
| id          | 034    |
| module      | veille |
| type        | feat   |
| bloquée par | —      |

## Contexte

[[012__veille__recherche-de-tournois.feat]] donne à chaque veille un périmètre :
un point et un rayon, filtré à vol d'oiseau. C'est ce que badnet sait faire, et
c'était la v1.

Ce n'est pas ainsi que je décide d'y aller. Ce que je veux dire, c'est « à moins
d'une heure en transports en commun de chez moi », ou « en Bretagne, près de la
mer, le week-end où l'équipe descend ».

## Problème à résoudre

Un rayon à vol d'oiseau ne dit rien du trajet réel. Depuis Paris, 40 km au
nord-ouest font 35 minutes de train ; 40 km au sud-est font deux changements et
1 h 20. Un rayon assez large pour attraper le premier ramène cinquante tournois
que je n'irai jamais jouer ; assez étroit pour les écarter, il perd le second.

Et certains périmètres ne sont pas des cercles du tout : une région, un
littoral, le trajet d'une ligne.

Résolu quand une veille porte **une ou plusieurs zones**, remplies au choix par
un cercle autour d'un point, un contour de temps de trajet, ou une liste de
départements ou de régions — et que « le tournoi est dans le périmètre » veut
dire « dans l'une de ses zones ».

## Solutions envisagées

**Le temps de trajet.**

- Un service d'itinéraires interrogé par tournoi (PRIM pour l'Île-de-France,
  Google Maps ailleurs). Exact, mais une clé, un quota, un appel par tournoi et
  par veille, et une dépendance réseau de plus à surveiller dans un projet qui
  en a déjà deux.
- **Une isochrone calculée une fois par veille** : le service rend le contour
  « une heure depuis Paris », Babo teste l'appartenance en local. Un appel par
  veille et par mois, pas par tournoi. Elle survit à une panne du service — un
  contour vieux d'un mois reste juste, un réseau de transport ne bouge pas —,
  et elle rend le critère lisible : la veille porte « 1 h en transports depuis
  Paris », pas une distance déguisée.

Piste retenue à ce stade : l'isochrone.

Sa limite est connue : elle vaut pour un départ « n'importe quand », sans heure
ni jour. C'est exactement la question qu'on se pose deux mois à l'avance, et ce
serait insuffisant pour décider la veille au soir.

**Les zones nommées.** « Proche de la mer » peut se traiter par un trait de côte
embarqué et une distance au segment le plus proche ; ou se ramener à une liste
de départements, saisie une fois. La seconde n'a aucun jeu de données à tenir à
jour et absorbe aussi « en région avec l'équipe ».

**Une seule spec, et non deux.** Une isochrone *est* une zone, une région *est*
une zone, un cercle autour d'un point aussi. Les découper par fournisseur — PRIM
d'un côté, contours de l'autre — ferait deux specs qui se marchent dessus sur la
seule chose qui compte : comment une veille porte plusieurs zones, et ce que
« dedans » veut dire.

## Questions

- PRIM couvre l'Île-de-France ; que fait-on ailleurs, et bascule-t-on de
  fournisseur selon le point de départ ?
- Une isochrone se périme-t-elle, et à quel rythme la recalcule-t-on ?
- Où passe la frontière avec badnet : continue-t-on d'envoyer un `rayon` dans la
  requête, avec la zone en filtre local par-dessus, ou abandonne-t-on le rayon ?
- Comment se saisit une zone à l'écran — une carte, une liste de cases, un
  point et une durée ?
- Les clés d'API : dans la configuration, comme les mots de passe de 015 ?

## Notes

Reportée de 012, qui livre le cercle et le vol d'oiseau et laisse le reste ici.

La v1 de 012 recalcule déjà la distance à vol d'oiseau en local, par-dessus le
`rayon` envoyé à badnet — non que celui-ci coupe mal, la sonde du 9 septembre
2026 a vérifié qu'il coupe juste, mais parce que la page doit afficher une
distance et que le champ `distance` de badnet est faux. Le point d'accroche
existe donc : c'est ce filtre local que cette spec remplace.
