-- Spec 016 : la boîte d'envoi.
--
-- Tout message est écrit ici avant d'être remis, en développement comme en
-- production. Le mode « écrit plutôt qu'envoyé » que 016 exige en test n'est
-- donc pas un adaptateur de plus : c'est le cas où personne ne vide la file.
--
-- C'est aussi ce qui rend le réessai possible sans rejouer la tâche appelante.
-- Un mail raté pendant une passe de scraping ne doit pas relancer le scraping,
-- ni le compte dont le bannissement est un risque assumé (015).
create table message (
    id                      integer primary key,
    -- Préfixé par « [Bado] » au dépôt : le sujet stocké est celui qui part.
    sujet                   text not null,
    html                    text not null,
    -- Facultatif. `nodemailer` ne sait pas le dériver du HTML — l'option qui le
    -- faisait a disparu avec sa version 2 — et aucun client grand public ne
    -- refuse le HTML : l'exiger serait du travail d'écriture perpétuel.
    texte                   text,
    depose_le               text not null,
    -- Trois tentatives, à cinq puis trente minutes. Au-delà, `abandonne`.
    tentatives              integer not null default 0,
    prochaine_tentative_le  text not null,
    etat                    text not null check (etat in ('en-attente', 'envoye', 'abandonne')),
    -- Gardée même après un envoi réussi au coup suivant : c'est elle qui dit
    -- pourquoi le message a mis une demi-heure à partir.
    dernier_echec           text,
    clos_le                 text
) strict;

-- L'index du vidage : « qu'est-ce qui est dû ? », posé à chaque reprise.
create index message_du on message (etat, prochaine_tentative_le);

-- L'écran affiche les derniers messages, envoyés et abandonnés compris. Rien
-- n'est purgé : quelques messages par semaine ne pèsent rien, et l'historique
-- répond à la seule question qu'on se posera vraiment — « est-ce que l'alerte
-- est partie, et que disait-elle ? ».
create index message_par_depot on message (depose_le desc);
