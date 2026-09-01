# Sauvegarder la base

| Champ  | Valeur |
|--------|--------|
| id     | 023    |
| module | socle  |
| type   | tech   |

## Contexte

[[017__persistance-sqlite]] range tout l'état de l'application dans un fichier
SQLite unique, et justifie son chiffrement au repos par le fait qu'une
sauvegarde est une copie de ce fichier.

Cette copie n'existe pas. Aucune spec ne dit qui la déclenche, où elle va, ni
comment on s'en sert.

## Problème à résoudre

L'essentiel des données se re-scrape : classements, matchs, tournois sont
toujours là, sur myffbad et badnet, le lendemain d'un incident. Trois choses
ne se retrouvent pas.

- **L'historique des relevés.** [[001__classement]] mesure la variation de
  classement contre le relevé précédent enregistré par l'outil. Myffbad expose
  l'état courant, pas le passé : une base perdue efface définitivement la
  profondeur d'historique accumulée, et il faut recommencer à zéro pour la
  reconstituer.
- **Ce qui a été saisi à la main** : les disponibilités
  ([[008__disponibilites-interclubs]]) et les critères de veille
  ([[012__recherche-de-tournois]]).
- **Ce qui évite les doublons** : tournois déjà notifiés (013), rappels déjà
  envoyés (014). Les perdre ne perd pas d'information, mais renvoie des
  alertes déjà reçues.

Résolu quand une copie exploitable de la base vit ailleurs que sur le serveur,
quand elle se refait seule, et quand une restauration a été faite au moins une
fois pour de vrai.

## Solutions envisagées

- **Copie du fichier par `cp` ou `rsync`.** Écarté seul : copier un fichier
  SQLite pendant qu'une transaction écrit produit une sauvegarde corrompue, et
  la corruption ne se voit qu'au moment de restaurer — le pire moment.
- **Copie par le mécanisme de sauvegarde de SQLite** (`VACUUM INTO`, API de
  backup). Retenue : cohérente même base ouverte, et le fichier produit est
  compacté.
- **Sauvegarde déclenchée par le planificateur** ([[018__ordonnancement]]),
  après la passe de scraping quotidienne : le moment où la base vient de
  changer, et où l'application est réveillée de toute façon.

Contraintes :

- **La copie part du serveur.** Une sauvegarde sur la même machine ne protège
  que de l'effacement accidentel, pas de la perte de la machine, qui est le cas
  qu'on craint.
- **La clé de chiffrement ne voyage pas avec la copie**, et ne vit pas
  uniquement sur le serveur sauvegardé : une base chiffrée dont la clé a brûlé
  avec la machine est un fichier inutile. C'est le prolongement direct de la
  question laissée ouverte par 017.
- **Le résultat de la sauvegarde entre dans le rapport d'exécution**
  ([[019__robustesse-du-scraping]]) et dans le battement hebdomadaire : taille
  et date de la dernière copie réussie. Une sauvegarde qui échoue en silence
  est exactement aussi utile que pas de sauvegarde.

## Questions

- Où part la copie : disque externe, machine personnelle, stockage distant
  chiffré ? Le choix décide aussi de qui détient les coordonnées des
  coéquipiers.
- Combien de copies garde-t-on ? Une seule copie écrasée chaque jour propage
  une corruption ou une suppression avant qu'on s'en aperçoive.
- La restauration est-elle documentée et testée, ou découverte le jour de
  l'incident ?

## Notes

Extraite de [[017__persistance-sqlite]], qui présentait la sauvegarde comme une
propriété du format sans jamais la déclencher.

Ne concerne que la base : le fichier de configuration de l'équipe
([[005__liste-des-membres-de-l-equipe]]) est une entrée, versionnée ailleurs, et
le code vit dans git.

Sans urgence tant que la base est vide, mais à traiter avant la première saison
complète : c'est l'accumulation d'historique qui crée la valeur à perdre.
