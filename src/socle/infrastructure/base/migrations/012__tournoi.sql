-- Spec 002 : les tournois, tels que badnet les publie.
--
-- Le début de l'index que 012 construira. Cette spec-là disait « la première
-- des deux traitée la paiera pour l'autre » : 002 passe devant, donc 002 paie.
-- Elle n'écrit que ce dont elle a besoin — le lieu et les journées ; 012 y
-- ajoutera la date limite, les tableaux proposés et les classements admis.
--
-- Séparée de `engagement` volontairement : un tournoi existe indépendamment de
-- mon inscription, et recopier la ville sur l'engagement en ferait deux
-- versions du même fait le jour où 012 remplira l'index.
create table tournoi (
    evenement  integer primary key,
    -- La salle et son adresse, telles que l'organisateur les a saisies.
    gymnase    text not null,
    adresse    text not null,
    -- La ville, lue derrière le code postal : la seule découpe fiable d'une
    -- adresse française écrite à la main. C'est elle que la page affiche.
    ville      text not null,
    releve_le  text not null
) strict;

-- Les journées réellement jouées, une ligne par jour.
--
-- C'est la seule source d'intervalle du projet : `/competitions` ne rend qu'une
-- date, et 027 en avait conclu qu'il n'y en avait pas d'autre. La fiche
-- publique dément, en listant un jour par ligne — ce qui permet d'écrire
-- « du 24 au 25 octobre » au lieu de perdre la moitié du week-end.
create table tournoi_journee (
    evenement integer not null references tournoi (evenement) on delete cascade,
    jour      text not null,
    primary key (evenement, jour)
) strict;
