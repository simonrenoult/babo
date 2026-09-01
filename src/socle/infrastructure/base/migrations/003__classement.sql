-- Spec 001 : le classement relevé sur la fiche myffbad.
--
-- Une ligne par changement de valeur, jamais une par passe : le classement ne
-- bouge qu'à la publication mensuelle du CPPH, et une passe quotidienne
-- écrirait trois cent cinquante lignes identiques par an. D'où les deux dates
-- — `apparu_le`, l'entrée dans le palier, et `vu_le`, la dernière passe qui a
-- relevé ces valeurs. Seule `vu_le` s'affiche ; `apparu_le` s'écrit pour 024,
-- parce qu'un historique ne se rattrape pas après coup.
--
-- Conservation sans limite : une douzaine de lignes par an et par discipline.
--
-- Trois disciplines et non cinq tableaux : c'est ce que la fiche expose
-- (`SimpleSubLevel`, `DoubleSubLevel`, `MixteSubLevel`), et en déduire `SH` ou
-- `SD` demanderait un sexe que rien ne configure.
create table classement (
    id          integer primary key,
    licence     text not null,
    discipline  text not null check (discipline in ('simple', 'double', 'mixte')),
    -- Le barème fédéral, fermé ici comme il l'est dans le `core` : une valeur
    -- inattendue fait échouer l'extraction plutôt que d'entrer en base (019).
    lettre      text not null check (
                    lettre in ('N1', 'N2', 'N3', 'R4', 'R5', 'R6',
                               'D7', 'D8', 'D9', 'P10', 'P11', 'P12', 'NC')
                ),
    cpph        real not null,
    apparu_le   text not null,
    vu_le       text not null
) strict;

create index classement_par_licence on classement (licence, discipline, id desc);
