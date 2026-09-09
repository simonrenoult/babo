-- Spec 012 : les veilles, et ce que chacune voit.
--
-- Une veille est une recherche nommée qu'on garde — « DH avec Louis »,
-- « Tournois en région avec l'équipe ». Cinq au plus : le plafond n'est pas
-- une limite technique mais le constat qu'au-delà on ne les relit plus.
--
-- Elle vit ici, dans les migrations du socle, comme `coequipier` avant elle :
-- aucune feature ne persiste hors de là (017). C'est le seul point de contact.
create table veille (
    id            integer primary key autoincrement,
    nom           text not null unique,
    -- Suspendue plutôt que supprimée : supprimer efface ce que la veille a
    -- déjà vu, donc la recréer réalerte sur tout (013). Une veille qui ne sert
    -- qu'en début de saison se met en pause.
    active        integer not null default 1,
    -- Le périmètre. Un point et un rayon en v1 ; 034 y mettra des isochrones
    -- et des régions, et c'est pourquoi la colonne s'appelle `rayon_km` et non
    -- « zone » : mieux vaut un nom étroit et vrai qu'un nom large et faux.
    latitude      real not null,
    longitude     real not null,
    rayon_km      integer not null,
    -- La fenêtre, sous l'une de deux formes et jamais les deux : glissante
    -- (« d'ici trois mois ») ou intervalle fixe. Pas de récurrence annuelle —
    -- « tous les novembres » a l'air utile et ne l'est pas, ce qu'on veut
    -- vraiment étant « pendant les vacances de la Toussaint », dont les dates
    -- changent chaque année.
    fenetre_jours integer,
    fenetre_du    text,
    fenetre_au    text,
    -- Les critères de contenu, en listes séparées par des virgules. Des codes
    -- fermés, tous validés à l'écriture : `Tableau`, `Lettre`, catégorie d'âge.
    tableaux      text not null,
    series        text not null,
    categories    text not null,
    -- « Inscriptions encore ouvertes » : la date limite n'est pas passée.
    ouvertes      integer not null default 1,
    creee_le      text not null,
    check (
        (fenetre_jours is not null and fenetre_du is null and fenetre_au is null)
     or (fenetre_jours is null and fenetre_du is not null and fenetre_au is not null)
    )
) strict;

-- Ce qu'une veille voit, et depuis quand.
--
-- **C'est la seule chose qui lui appartienne en propre.** Le tournoi, lui, est
-- partagé : le 50750 apparaîtra dans trois veilles sur cinq, et en garder trois
-- exemplaires ferait trois villes et trois dates limites du même fait — l'argument
-- que 002 a écrit en séparant `tournoi` d'`engagement`.
--
-- `sorti_le` plutôt qu'une ligne effacée : avec une requête par veille,
-- l'absence a deux sens — le tournoi est annulé, ou il ne répond plus aux
-- critères de *cette* veille. Seule une appartenance datée les distingue, et
-- c'est elle qui garde les rappels de 014 quand je resserre un rayon, et qui
-- empêche un tournoi qui sort puis rentre de réalerter.
--
-- `alerte_le` est déclarée ici et n'est écrite par personne : elle appartient à
-- 013. La poser maintenant évite une migration pour une colonne dont on connaît
-- déjà le nom et la raison.
create table veille_tournoi (
    veille    integer not null references veille (id) on delete cascade,
    evenement integer not null references tournoi (evenement) on delete cascade,
    vu_le     text not null,
    sorti_le  text,
    alerte_le text,
    primary key (veille, evenement)
) strict;

create index veille_tournoi_par_veille on veille_tournoi (veille, sorti_le);

-- Ce que la recherche publique apporte, et que la fiche ne donne pas.
--
-- 002 n'avait écrit que le lieu et les journées, en annonçant que « 012 y
-- ajoutera la date limite, les tableaux proposés et les classements admis ».
-- Les voici — sauf les deux derniers, qui sont des listes et prennent leurs
-- propres tables.
alter table tournoi add column nom text;
alter table tournoi add column latitude real;
alter table tournoi add column longitude real;
-- Au jour près : c'est ce que porte l'attribut `title` de `deadline`
-- (« Inscr. av. le 03/09/2026 »), et cela suffit à filtrer. L'heure exacte est
-- sur l'enveloppe de la fiche, et c'est 014 qui en aura besoin.
alter table tournoi add column date_limite text;
-- Les familles et les catégories telles que la recherche les rend, sans être
-- réinterprétées : « N, R, D, P, NC », « Jeunes ». Elles mentent parfois — un
-- tournoi annoncé `N` dont la fiche exclut N1 —, d'où les séries lues sur la
-- fiche, ci-dessous. On garde les deux : l'écart se verra.
alter table tournoi add column familles text;
alter table tournoi add column categories text;
-- Quand la fiche a été relevée. Nul veut dire « jamais » : c'est ce qui rend la
-- passe des fiches incrémentale maintenant que la recherche insère des lignes
-- sans en avoir relevé aucune.
alter table tournoi add column fiche_relevee_le text;

-- Les tableaux réellement proposés, un par ligne.
--
-- Le code tel que badnet l'écrit, et non un `Tableau` du socle : le relevé du
-- 9 septembre 2026 en a montré sept — SH, SD, DH, DD, MX, mais aussi `ST` et
-- `SI`, que le projet ne connaît pas. Les refuser ferait perdre le tournoi
-- entier ; les traduire serait inventer. On range ce qu'on lit.
create table tournoi_tableau (
    evenement integer not null references tournoi (evenement) on delete cascade,
    tableau   text not null,
    primary key (evenement, tableau)
) strict;

-- Les séries admises, rang par rang, lues sur la fiche.
--
-- C'est la seule source exacte : le champ `clt` de la recherche ne rend que des
-- familles, et se trompe. La fiche donne « N2 N3 | R4 R5 R6 | D7 D8 D9 |
-- P10 P11 P12 | NC », ce qui se compare directement au barème de 001.
create table tournoi_serie (
    evenement integer not null references tournoi (evenement) on delete cascade,
    serie     text not null,
    primary key (evenement, serie)
) strict;
