-- Spec 005 : l'équipe, importée d'un CSV une fois par saison.
--
-- Elle est ici, en base chiffrée, et non dans un fichier de configuration
-- comme 015 le prévoyait : ce serait la seule donnée personnelle de tiers en
-- clair sur le disque. 015 est amendée.
--
-- La table vit dans les migrations du socle parce qu'aucune feature ne
-- persiste hors d'ici (017), mais la notion, elle, appartient à `capitanat` :
-- c'est le `Joueur` que 022 refuse de faire monter dans le socle.
--
-- Trois colonnes, et exactement celles que myffbad ne publie pas. Ni nom ni
-- classement — ils se relèvent (028), et les saisir ici serait recopier à la
-- main une donnée qui se périme chaque semaine. Ni mail — myffbad ne publie
-- pas les coordonnées de ses licenciés, et une colonne sans usage ne se
-- stocke pas.
create table coequipier (
    -- La licence est la clé : c'est elle qui relie le tableur du club à la
    -- fiche fédérale, et c'est par elle que 028 ira chercher nom et classement.
    -- La forme exacte (`^\d{6,8}$`) est celle du `Licence` du socle ; la base
    -- n'en garde que la longueur, pour ne pas avoir deux règles à faire vivre.
    licence    text primary key check (length(licence) between 6 and 8),
    -- Fermé comme le barème de 001 : la valeur inattendue ne rentre pas.
    sexe       text not null check (sexe in ('F', 'M')),
    -- Stocké tel quel : on vérifie qu'il existe, jamais sa forme, sinon un
    -- numéro belge se fait rejeter.
    telephone  text not null check (telephone <> '')
) strict;
