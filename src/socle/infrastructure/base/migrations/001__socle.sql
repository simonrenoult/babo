-- Spec 017 : l'état du socle, et lui seul.
--
-- Volontairement partiel. 017 dit de ne créer tout de suite que ce qui doit
-- exister tout de suite — le jeton et les captures — et de dessiner le schéma
-- des matchs et des tournois après la sonde de 015, sur des pages réellement
-- observées. Les rapports d'exécution s'y ajoutent : ils naissent avec la
-- première passe automatique (019).

-- Le jeton de session myffbad, un par source, qui survit aux redémarrages.
-- Les identifiants n'entrent jamais ici : ils restent en environnement (015).
create table jeton_source (
    source     text primary key,
    valeur     text not null,
    obtenu_le  text not null,
    expire_le  text not null
) strict;

-- Les réponses brutes, archivées avant analyse (019). Croissance non bornée
-- assumée : aucune politique de rétention n'est définie tant que les mesures
-- de taille ne la justifient pas.
create table capture (
    id           integer primary key,
    source       text not null,
    url          text not null,
    statut_http  integer not null,
    contenu      text not null,
    capturee_le  text not null
) strict;

create index capture_par_source on capture (source, capturee_le desc);

-- Une ligne par exécution automatique, succès compris : sans les succès, on ne
-- distingue pas une semaine sans incident d'un planificateur arrêté (019).
create table rapport_execution (
    id              integer primary key,
    tache           text not null,
    demarre_le      text not null,
    termine_le      text not null,
    issue           text not null check (issue in ('succes', 'vide', 'echec')),
    volume_extrait  integer,
    detail          text
) strict;

create index rapport_par_tache on rapport_execution (tache, demarre_le desc);
