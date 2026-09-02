-- Spec 028 : les licences sur huit chiffres, zéros de tête compris.
--
-- Un numéro fédéral s'écrit sur huit chiffres, et myffbad le montre lui-même :
-- la fiche demandée pour `409390` répond pour `00409390`. Un tableur, lui,
-- traite la colonne comme un nombre et mange les zéros de tête au premier
-- export en CSV — c'est ainsi que l'équipe est entrée en base.
--
-- Le type `Licence` normalise désormais à l'écriture. Cette migration rattrape
-- ce qui est déjà écrit, pour que la passe suivante ne laisse pas la moitié de
-- l'équipe muette : sans elle, les deux écritures désignent la même personne et
-- font deux clés différentes.
--
-- `substr('00000000' || licence, -8)` plutôt que `printf` : pas de conversion
-- en nombre, donc pas de surprise sur un numéro qui n'en serait pas un. Un
-- numéro déjà complet en ressort inchangé. Si deux écritures d'une même licence
-- coexistaient, la contrainte de clé primaire ferait échouer la migration
-- entière — ce qui est le bon comportement : la corriger à la main vaut mieux
-- que d'en perdre une en silence.
update coequipier set licence = substr('00000000' || licence, -8) where length(licence) < 8;
update classement set licence = substr('00000000' || licence, -8) where length(licence) < 8;
update identite  set licence = substr('00000000' || licence, -8) where length(licence) < 8;
