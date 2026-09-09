-- Spec 036 : un tournoi peut n'avoir pas encore de salle.
--
-- 002 a posé `gymnase`, `adresse` et `ville` en `not null`, sur la seule fiche
-- qu'elle avait sous les yeux — celle d'un tournoi dont l'organisateur avait
-- tout saisi. Le relevé du 9 septembre 2026 dit l'inverse : sept tournois sur
-- neuf n'ont aucun gymnase, la fiche écrivant « Aucun gymnase renseigné par
-- l'organisateur pour le moment ». Une salle se réserve après la publication.
--
-- La contrainte faisait donc échouer la passe sur le cas le plus courant, et
-- 019 alertait pour une panne qui n'en était pas une.
--
-- SQLite ne sait pas retirer un `not null` : la table se reconstruit. Et
-- `tournoi_journee` se reconstruit avec elle, non par symétrie mais par
-- nécessité — sa clé étrangère est `on delete cascade`, `foreign_keys` est à
-- `ON`, et `drop table tournoi` exécute un `delete` implicite qui cascade sur
-- **tout** ce qui référence ce nom.
--
-- D'où l'ordre, qui n'est pas décoratif : la table des journées neuves vise
-- `tournoi_nouveau` et non `tournoi`, sans quoi le `drop` la viderait elle
-- aussi — essayé, et les deux journées avaient disparu. C'est le `rename` qui
-- recoud ensuite la référence vers le nom définitif.
create table tournoi_nouveau (
    evenement  integer primary key,
    -- La salle et son adresse, quand l'organisateur les a saisies.
    gymnase    text,
    adresse    text,
    -- La ville, nommée par l'enveloppe de la fiche — `data-datedata` — ou lue
    -- derrière le code postal quand un gymnase existe. Nulle quand badnet ne la
    -- nomme pas : la page sait dire « lieu non relevé », et une ville absente
    -- n'est pas une fiche illisible.
    ville      text,
    releve_le  text not null
) strict;

insert into tournoi_nouveau (evenement, gymnase, adresse, ville, releve_le)
select evenement, gymnase, adresse, ville, releve_le from tournoi;

create table tournoi_journee_nouveau (
    evenement integer not null references tournoi_nouveau (evenement) on delete cascade,
    jour      text not null,
    primary key (evenement, jour)
) strict;

insert into tournoi_journee_nouveau (evenement, jour)
select evenement, jour from tournoi_journee;

drop table tournoi_journee;
drop table tournoi;

alter table tournoi_nouveau rename to tournoi;
alter table tournoi_journee_nouveau rename to tournoi_journee;
