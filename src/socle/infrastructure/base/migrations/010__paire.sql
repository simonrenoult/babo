-- Spec 030 : les paires du capitaine, et ce qu'il privilégie.
--
-- Les tables vivent dans les migrations du socle parce qu'aucune feature ne
-- persiste hors d'ici (017), mais les notions appartiennent à `capitanat` :
-- une paire est une décision de capitaine, pas un fait fédéral.
--
-- Persistées, et non tenues en brouillon de page : une paire est exactement ce
-- que 023 range parmi les choses qui ne se re-scrapent pas.

-- Une paire est deux licences, rien de plus. Son tableau n'est pas stocké : il
-- se déduit des sexes — deux hommes DH, deux femmes DD, un de chaque MX —, et
-- comme 005 n'accepte que `F` ou `M`, il n'y a aucun autre choix possible. Le
-- stocker permettrait de l'écrire faux ; le déduire rend la ligne fausse
-- impossible.
create table paire (
    id           integer primary key,
    -- Rangées, `licence_a` avant `licence_b`. « Dupont avec Martin » et
    -- « Martin avec Dupont » sont la même décision : sans cette contrainte,
    -- l'index d'unicité ne verrait pas le doublon.
    licence_a    text not null,
    licence_b    text not null,
    -- Un booléen, pas un degré : une échelle demande d'être calibrée et
    -- personne ne la recalibre. Pas de note non plus — la raison est évidente
    -- au moment où l'on marque.
    privilegiee  integer not null default 0 check (privilegiee in (0, 1)),
    saisie_le    text not null,
    check (licence_a < licence_b)
) strict;

-- Deux fois la même paire n'est pas une décision de plus.
create unique index paire_unique on paire (licence_a, licence_b);

-- Ce que le capitaine privilégie sur un tableau donné. Une ligne présente vaut
-- « marqué » : un booléen à deux valeurs dans une table à deux clés n'aurait
-- rien ajouté qu'une troisième façon de dire non.
--
-- Le couple, et non la seule licence : le même joueur se marque indépendamment
-- en SH, en DH et en MX. Ce qu'on privilégie n'est pas un joueur, c'est un
-- joueur *à cette place*.
create table marque_joueur (
    licence    text not null,
    tableau    text not null check (tableau in ('SH', 'SD', 'DH', 'DD', 'MX')),
    marque_le  text not null,
    primary key (licence, tableau)
) strict;
