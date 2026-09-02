-- Spec 021 : le compte unique, et son seul haché.
--
-- `id` contraint à 1 : 021 ne prévoit qu'un compte, et 008 a explicitement
-- refusé d'ouvrir l'outil aux coéquipiers. Une clé primaire sur la licence
-- aurait laissé deux comptes coexister en silence, et « lequel des deux ouvre
-- la porte ? » n'a pas de bonne réponse.
--
-- Le clair n'entre jamais ici. Le secret de signature des jetons non plus : il
-- vit dans la configuration du serveur, puisqu'il sert justement à protéger ce
-- que cette base contient.
create table compte (
    id       integer primary key check (id = 1),
    licence  text not null,
    hache    text not null,
    pose_le  text not null
) strict;
