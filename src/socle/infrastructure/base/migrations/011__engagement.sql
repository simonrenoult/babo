-- Spec 027 : mes engagements de tournoi, relevés sur badnet.
--
-- La table vit dans le socle parce qu'aucune feature ne persiste hors d'ici
-- (017), et la notion aussi : c'est une passe du socle qui l'écrit, et
-- `mon-profil` la lira pour l'afficher (002). Même raison que `Classement`.

-- Un tournoi auquel je suis inscrit. `evenement` est l'identifiant badnet :
-- lui seul est stable, un nom de tournoi se réécrit d'une saison à l'autre.
create table engagement (
    evenement   integer primary key,
    nom         text not null,
    -- La seule date que badnet rende, au format ISO. Pas d'intervalle : le
    -- déduire serait fabriquer une donnée que la source ne donne pas.
    date        text not null,
    -- Ce que badnet dit de l'inscription, tel quel. Personne ne sait encore
    -- quelles valeurs cette phrase prend ; en tirer une échéance à trois
    -- valeurs inventerait une taxonomie qui ne correspondrait à rien (002).
    statut      text,
    releve_le   text not null
) strict;

-- L'ordre que 002 affiche, et celui sur lequel se lisent les chevauchements.
create index engagement_par_date on engagement (date);

-- Un tableau sur lequel je suis engagé, et avec qui. Une ligne par tableau :
-- un même tournoi se joue en double *et* en mixte, avec deux partenaires
-- différents — les mettre sur la même ligne obligerait à choisir lequel.
create table engagement_tableau (
    evenement          integer not null,
    tableau            text not null check (tableau in ('SH', 'SD', 'DH', 'DD', 'MX')),
    -- « S4 », gardée telle quelle et jamais interprétée : c'est la règle de 001
    -- sur les lettres du barème, et elle vaut ici.
    serie              text,
    -- Le partenaire, quand il y en a un : absent sur un simple, absent aussi
    -- tant que la paire n'est pas formée.
    partenaire_licence text,
    partenaire_nom     text,
    primary key (evenement, tableau)
) strict;
