-- Spec 011 : la composition retenue pour chaque journée d'interclub.
--
-- Une ligne par place remplie : une composition en cours n'a que quelques
-- lignes, et c'est ce qui permet de planifier en plusieurs fois.
--
-- La journée, et non la rencontre, pour la raison de 017 : un réimport du
-- calendrier change les dates, pas les numéros. La licence n'est pas une clé
-- étrangère vers `coequipier`, que l'import d'équipe remplace entière : un
-- joueur parti se signale sur la page, il ne fait pas disparaître la ligne.
create table composition (
    journee  integer not null,
    poste    text not null check (poste in ('SH1', 'SH2', 'SD', 'DH-1', 'DH-2', 'DD-1', 'DD-2', 'MX-F', 'MX-H')),
    licence  text not null,
    primary key (journee, poste)
) strict;
