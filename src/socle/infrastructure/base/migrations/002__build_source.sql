-- Spec 015 : mesurer la péremption des identifiants d'action.
--
-- myffbad se lit par Server Actions, désignées par un hash calculé à la
-- construction du site. Il change quand myffbad redéploie l'action, et on
-- ignore à quelle fréquence. Chaque réponse porte le `buildId` : le consigner
-- transforme la question en mesure, et prévient avant le 404 plutôt qu'après.
--
-- Une ligne par build observé, et non une par observation : ce qu'on veut
-- compter, ce sont les déploiements, pas les passes.
create table build_source (
    source                text not null,
    build                 text not null,
    vu_la_premiere_fois   text not null,
    vu_la_derniere_fois   text not null,
    primary key (source, build)
) strict;

create index build_par_source on build_source (source, vu_la_derniere_fois desc);
