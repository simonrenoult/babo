-- Spec 008 : les disponibilités aux interclubs, telles qu'un sondage les donne.
--
-- Les tables vivent dans les migrations du socle parce qu'aucune feature ne
-- persiste hors d'ici (017), mais la notion appartient à `capitanat`.

-- Un nom du sondage — « Simon », « Madoche » —, et le membre auquel le
-- capitaine l'a rattaché. Le rattachement tient au nom et survit aux imports :
-- le sondage J6-J10 retrouve les rattachements du sondage J1-J5.
--
-- La licence n'est pas une clé étrangère vers `coequipier` : l'import d'équipe
-- remplace la table entière, et un rattachement vers un membre parti se lit
-- simplement comme non rattaché.
create table repondant (
    nom       text primary key,
    remarque  text,
    licence   text
) strict;

-- Une réponse par nom et par journée. La journée, et non la rencontre : un
-- réimport du calendrier change les dates, pas les numéros.
create table disponibilite (
    nom      text not null references repondant (nom) on delete cascade,
    journee  integer not null,
    reponse  text not null check (reponse in ('oui', 'si-besoin', 'non')),
    primary key (nom, journee)
) strict;
