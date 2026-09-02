-- Spec 028 : qui est derrière une licence, lu sur la fiche publique myffbad.
--
-- Deux colonnes de nature différente sous la même clé, parce qu'une seule
-- requête les rend :
--
--   * `nom`, un fait fédéral, affiché tel que myffbad le rend
--     (« Simon RENOULT », prénom puis nom) ;
--   * `person_id`, la clé interne des personnes chez myffbad, jamais affichée.
--     C'est un cache : l'action `classement` ne prend que lui, et sans lui il
--     faudrait relire la fiche avant chaque relevé. Avec lui, le régime de
--     croisière est d'une requête par joueur et par semaine.
--
-- Une ligne par licence, mise à jour en place. Pas d'historique du nom : au
-- contraire du classement, personne n'a l'usage de ses valeurs passées.
--
-- Le cache se répare tout seul : sur réponse vide, la passe relit la fiche et
-- réécrit ici avant de retenter. Un cache qui ne se répare pas laisse un joueur
-- muet jusqu'à ce que quelqu'un lise un rapport.
create table identite (
    licence    text primary key check (length(licence) between 6 and 8),
    person_id  integer not null check (person_id > 0),
    nom        text not null check (nom <> ''),
    vu_le      text not null
) strict;
