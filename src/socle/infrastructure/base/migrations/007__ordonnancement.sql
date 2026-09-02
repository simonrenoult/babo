-- Spec 018 : le planificateur, ses fréquences et ses échéances.
--
-- Deux tables et pas une : le réglage d'une tâche est une donnée qu'on
-- modifie, l'échéance est un fait qu'on ferme. Les confondre ferait perdre la
-- trace de ce qui a tourné au premier changement de cadence.

-- Le réglage d'une tâche. En base, donc modifiable sans redéploiement — c'est
-- la raison pour laquelle 018 écarte le cron système.
--
-- `jour` est en numérotation ISO (1 = lundi … 7 = dimanche), nul hors cadence
-- hebdomadaire. `grace_minutes` à zéro veut dire « à l'heure dite » : c'est le
-- battement de 019, qui mentirait s'il était rattrapé plus tard.
create table reglage_tache (
    tache          text primary key,
    nature         text not null check (nature in ('quotidienne', 'hebdomadaire', 'ponctuelle')),
    jour           integer check (jour is null or jour between 1 and 7),
    heure          integer not null default 0 check (heure between 0 and 23),
    minute         integer not null default 0 check (minute between 0 and 59),
    grace_minutes  integer not null check (grace_minutes >= 0),
    active         integer not null default 1 check (active in (0, 1))
) strict;

-- Une occurrence à exécuter, périodique ou ponctuelle. C'est la ligne qui
-- survit au redémarrage, et c'est elle qui tient la promesse de 018 : ni perdre
-- un rappel, ni le renvoyer.
--
-- `etat` dit seulement s'il reste quelque chose à faire. `faite` ne veut pas
-- dire réussie — l'issue est dans `rapport_execution` (019) —, et une échéance
-- qui a épuisé ses trois tentatives est `faite` : elle a bien tourné trois
-- fois. `abandonnee` est réservé à ce qui n'a jamais tourné : hors fenêtre de
-- grâce, tâche débranchée, ou cadence changée.
create table echeance (
    id                      integer primary key,
    tache                   text not null,
    prevue_le               text not null,
    tentatives              integer not null default 0,
    prochaine_tentative_le  text not null,
    etat                    text not null check (etat in ('en-attente', 'faite', 'abandonnee')),
    creee_le                text not null,
    close_le                text
) strict;

-- La clé de l'idempotence : réinscrire la même occurrence ne la duplique pas.
-- Sans elle, un redémarrage juste avant l'heure dite enverrait deux fois le
-- même rappel — le mode de panne que 018 refuse explicitement.
create unique index echeance_par_occurrence on echeance (tache, prevue_le);

-- L'index du réveil : toutes les minutes, « qu'est-ce qui est dû ? ».
create index echeance_due on echeance (etat, prochaine_tentative_le);
