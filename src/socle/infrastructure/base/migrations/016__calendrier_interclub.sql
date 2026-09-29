-- Le calendrier d'interclub de mon équipe, tel qu'icbad le publie.
--
-- Les tables vivent dans les migrations du socle parce qu'aucune feature ne
-- persiste hors d'ici (017), mais la notion appartient à `capitanat`.
--
-- Importé à la main et remplacé en entier à chaque import : une rencontre
-- déplacée par le comité ne laisse pas derrière elle sa date d'avant.

-- Une seule ligne : l'équipe suivie, la page d'où vient son calendrier, et
-- quand on l'a lue. L'URL et le code restent pour qu'un réimport ne demande
-- rien à retaper.
create table calendrier_interclub (
    id           integer primary key check (id = 1),
    url          text not null,
    code_equipe  text not null,
    nom_equipe   text not null,
    competition  text not null,
    groupe       text not null,
    importe_le   text not null
) strict;

-- Les rencontres de mon équipe seule. L'identifiant est celui d'icbad
-- (`/rencontre/<id>`) : il survit à un changement de date.
create table rencontre_interclub (
    id              integer primary key,
    journee         integer not null,
    debut           text not null,
    lieu            text not null,
    nom_domicile    text not null,
    code_domicile   text not null,
    nom_exterieur   text not null,
    code_exterieur  text not null
) strict;
