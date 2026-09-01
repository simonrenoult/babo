# Poser la forme de l'application

| Champ  | Valeur |
|--------|--------|
| id     | 020    |
| module | socle  |
| type   | tech   |

## Contexte

Cinq specs de socle sont posées : l'accès aux sources
[[015__source-de-donnees]], l'envoi de mail [[016__envoi-de-mail]], la
persistance [[017__persistance-sqlite]], l'ordonnancement
[[018__ordonnancement]] et la robustesse du scraping
[[019__robustesse-du-scraping]]. Chacune tranche un mécanisme.

Aucune ne dit ce qu'est Bado en tant que programme : ce qui s'exécute, sous
quelle forme, et sur quelle plateforme. Les specs de feature parlent pourtant
déjà de « l'interface » et du « serveur » comme si c'était acquis.

## Problème à résoudre

Trois décisions déjà prises contraignent la forme de l'application sans que
personne ne l'ait écrite : le planificateur vit dans le processus (018), la
base est un fichier local (017), et le jeton de session myffbad doit survivre
aux redémarrages (015). Elles impliquent un artefact unique tenu par une seule
instance — mais tant que ce n'est pas dit, rien n'interdit à une feature de
supposer le contraire.

Il manque aussi une plateforme d'exécution, et 018 se termine sur une question
— qui garantit le redémarrage de l'application ? — qui n'appartient à aucune
spec.

Résolu quand la plateforme est choisie, quand la forme de l'artefact déployé
est fixée, et quand le redémarrage a un responsable désigné.

## Solutions envisagées

- **Application unique, un seul processus, une seule instance.** Retenue :
  c'est la seule forme compatible avec un fichier SQLite unique et un
  planificateur interne. Un utilisateur, un serveur privé, aucun besoin de
  montée en charge.
- **Processus séparés — web d'un côté, travailleur de l'autre.** Écarté :
  deux processus écrivant le même fichier SQLite, pour isoler des scrapings qui
  durent quelques secondes par jour.
- **Rendu côté serveur, pas de client riche ni d'API publique.** Retenue :
  l'interface affiche des tableaux, saisit des critères et rafraîchit l'auth
  myffbad. Rien de tout cela n'est temps réel.
- **Node, TypeScript, Express.** Retenue. Express n'impose aucune structure :
  c'est ce qui le rend adapté à une application de cette taille, et c'est aussi
  pourquoi l'organisation du code doit être décidée à part —
  [[022__decoupage-du-code]].

Exécution : l'application tourne en service supervisé, redémarré
automatiquement en cas d'arrêt — c'est la réponse à la question laissée ouverte
par 018, et la condition du risque qui y est accepté.

## Questions

- Qui supervise le processus et le relance ? Le mécanisme retenu est, par
  construction, la seule pièce qui ne peut pas vivre dans l'application.
  Tranché : une unité systemd en `Restart=always` (`deploiement/babo.service`).
- Qui termine TLS ? Le cookie `Secure` de [[021__authentification]] rend HTTPS
  obligatoire, et rien ne dit si c'est Express ou un proxy en amont qui s'en
  charge. Tranché : un proxy en amont ; Express se contente de lui faire
  confiance.

## Notes

Une seule instance : la montée en charge horizontale est exclue par
construction, pas par oubli.

L'organisation interne du code — modules et sens des dépendances — fait l'objet
de [[022__decoupage-du-code]]. L'authentification fait l'objet de
[[021__authentification]].

Cadre [[015__source-de-donnees]], [[016__envoi-de-mail]],
[[017__persistance-sqlite]], [[018__ordonnancement]] et
[[019__robustesse-du-scraping]] : cette spec ne remplace aucune de leurs
décisions, elle dit ce qui les héberge.

À traiter en premier, avec [[017__persistance-sqlite]] : c'est le squelette
dans lequel la sonde d'accès de 015 vient se poser.
