import { echapper, estUnePanne } from "./alerte.ts";
import type { Courrier } from "./courrier.ts";
import type { Horloge } from "./horloge.ts";
import type { DepotRapports, RapportArchive } from "./rapport-execution.ts";

/**
 * Le battement hebdomadaire — spec 019.
 *
 * À jour et heure fixes, **pour que son absence se remarque**. C'est là toute
 * sa raison d'être : sans lui, l'arrêt complet du planificateur est
 * indiscernable d'une semaine sans incident, et un mail qui ne part pas ne
 * ressemble à rien. Il est le seul mécanisme du projet dont le silence soit une
 * information.
 *
 * Il est aussi la contrepartie d'une décision de l'alerte : celle-ci ne prévient
 * qu'à l'**entrée** en panne, pour ne pas se faire filtrer. Le trou que cela
 * ouvre — la panne qu'on oublie — est fermé ici, en rappelant chaque semaine ce
 * qui est encore cassé.
 *
 * Sa grâce est nulle (018) : rattrapé le lendemain, il mentirait sur la date à
 * laquelle il a constaté ce qu'il annonce.
 */
export const TACHE_BATTEMENT = "battement";

const SEMAINE = 7 * 24 * 60 * 60_000;

/** Une tâche que le battement doit savoir nommer, même si elle n'a jamais tourné. */
export type TacheSuivie = {
  readonly tache: string;
  readonly intitule: string;
};

export type LigneDuBattement = {
  readonly tache: string;
  readonly intitule: string;
  readonly executions: number;
  readonly volumeExtrait: number;
  /** La date de la dernière donnée : ce que l'écran appelle l'ancienneté. */
  readonly derniereReussite: Date | null;
  /** Depuis quand la tâche est en panne, `null` si elle ne l'est pas. */
  readonly enPanneDepuis: Date | null;
};

export type Battement = {
  readonly depuis: Date;
  readonly jusqua: Date;
  readonly lignes: readonly LigneDuBattement[];
  readonly executions: number;
  readonly pannesOuvertes: number;
  readonly tailleDeLaBase: number;
  readonly captures: number;
};

export function composerLeBattement(options: {
  readonly taches: readonly TacheSuivie[];
  readonly rapports: DepotRapports;
  readonly tailleDeLaBase: number;
  readonly captures: number;
  readonly maintenant: Date;
}): Battement {
  const { taches, rapports, maintenant } = options;
  const depuis = new Date(maintenant.getTime() - SEMAINE);
  const semaine = rapports.depuis(depuis);

  const lignes = taches.map(({ tache, intitule }) => {
    const siennes = semaine.filter((rapport) => rapport.tache === tache);
    const dernier = rapports.dernierRapport(tache);

    return {
      tache,
      intitule,
      executions: siennes.length,
      volumeExtrait: siennes.reduce((total, { volumeExtrait }) => total + (volumeExtrait ?? 0), 0),
      // La dernière fois que la donnée a bougé, pas la dernière fois que la
      // tâche s'est réveillée : une passe qui échoue depuis trois semaines a
      // tourné hier et ne rapporte pourtant rien de neuf.
      derniereReussite: derniereReussite(tache, rapports),
      enPanneDepuis: estUnePanne(dernier?.issue) ? (dernier?.demarreLe ?? null) : null,
    };
  });

  return {
    depuis,
    jusqua: maintenant,
    lignes,
    executions: semaine.length,
    pannesOuvertes: lignes.filter(({ enPanneDepuis }) => enPanneDepuis !== null).length,
    tailleDeLaBase: options.tailleDeLaBase,
    captures: options.captures,
  };
}

/**
 * La dernière exécution de cette tâche qui ait abouti.
 *
 * Cherchée dans un historique borné plutôt que par une requête dédiée : rien
 * n'est purgé (019), et une tâche qui n'a pas abouti depuis deux cents
 * exécutions est un cas dont on veut surtout savoir qu'il existe.
 */
function derniereReussite(tache: string, rapports: DepotRapports): Date | null {
  const reussie = rapports
    .derniers(200)
    .find((rapport) => rapport.tache === tache && !estUnePanne(rapport.issue));
  return reussie?.demarreLe ?? null;
}

/**
 * La tâche que le planificateur déclenche — spec 018.
 *
 * Elle dépose son message **et** consigne son rapport : le battement est une
 * exécution automatique comme les autres, et 019 demande que toute exécution
 * laisse une trace.
 */
export function battreLeCoeur(options: {
  readonly taches: readonly TacheSuivie[];
  readonly rapports: DepotRapports;
  readonly courrier: Courrier;
  readonly horloge: Horloge;
  readonly tailleDeLaBase: () => number;
  readonly captures: () => number;
}): Promise<RapportArchive> {
  const { taches, rapports, courrier, horloge } = options;
  const demarreLe = horloge.maintenant();

  const battement = composerLeBattement({
    taches,
    rapports,
    tailleDeLaBase: options.tailleDeLaBase(),
    captures: options.captures(),
    maintenant: demarreLe,
  });

  return courrier
    .deposer({
      sujet: sujetDuBattement(battement),
      html: enHtml(battement),
      texte: enTexte(battement),
    })
    .then(() =>
      rapports.consigner({
        tache: TACHE_BATTEMENT,
        demarreLe,
        termineLe: horloge.maintenant(),
        // Le battement a fait son travail dès lors que le message est déposé :
        // qu'il annonce des pannes ne le met pas lui-même en panne, et un
        // `echec` ici enverrait une alerte pour dire qu'on a bien alerté.
        issue: "succes",
        volumeExtrait: battement.executions,
        detail: `${battement.executions} exécution(s) sur la semaine, ${battement.pannesOuvertes} panne(s) ouverte(s)`,
      }),
    );
}

/**
 * Le nombre de pannes est dans le sujet : c'est ce qu'on lit dans la liste des
 * messages, sans ouvrir.
 */
function sujetDuBattement(battement: Battement): string {
  if (battement.pannesOuvertes === 0) return "Battement hebdomadaire — tout va bien";
  const pluriel = battement.pannesOuvertes > 1 ? "s" : "";
  return `Battement hebdomadaire — ${battement.pannesOuvertes} panne${pluriel} ouverte${pluriel}`;
}

function enTexte(battement: Battement): string {
  const lignes = battement.lignes.map(
    (ligne) =>
      `- ${ligne.intitule} : ${ligne.executions} exécution(s), ${ligne.volumeExtrait} extrait(s), ` +
      `dernière donnée ${quand(ligne.derniereReussite)}` +
      (ligne.enPanneDepuis === null ? "" : ` — EN PANNE depuis le ${quand(ligne.enPanneDepuis)}`),
  );

  return [
    `Semaine du ${quand(battement.depuis)} au ${quand(battement.jusqua)}.`,
    `${battement.executions} exécution(s), ${battement.pannesOuvertes} panne(s) ouverte(s).`,
    "",
    ...lignes,
    "",
    `Base : ${enMegaoctets(battement.tailleDeLaBase)}, ${battement.captures} capture(s) archivée(s).`,
    "",
    "Ce message part à jour et heure fixes. S'il manque, c'est le planificateur",
    "qui est arrêté — et rien d'autre ne le dirait.",
  ].join("\n");
}

function enHtml(battement: Battement): string {
  const lignes = battement.lignes
    .map(
      (ligne) =>
        `<tr><td>${echapper(ligne.intitule)}</td><td>${ligne.executions}</td>` +
        `<td>${ligne.volumeExtrait}</td><td>${echapper(quand(ligne.derniereReussite))}</td>` +
        `<td>${ligne.enPanneDepuis === null ? "—" : `en panne depuis le ${echapper(quand(ligne.enPanneDepuis))}`}</td></tr>`,
    )
    .join("");

  return (
    `<p>Semaine du ${echapper(quand(battement.depuis))} au ${echapper(quand(battement.jusqua))} : ` +
    `<strong>${battement.executions}</strong> exécution(s), ` +
    `<strong>${battement.pannesOuvertes}</strong> panne(s) ouverte(s).</p>` +
    "<table><tr><th>Tâche</th><th>Exécutions</th><th>Extraits</th><th>Dernière donnée</th><th>État</th></tr>" +
    `${lignes}</table>` +
    `<p>Base : ${echapper(enMegaoctets(battement.tailleDeLaBase))}, ${battement.captures} capture(s) archivée(s).</p>` +
    "<p>Ce message part à jour et heure fixes. S'il manque, c'est le planificateur qui est arrêté — et rien d'autre ne le dirait.</p>"
  );
}

function quand(date: Date | null): string {
  return date === null ? "jamais" : date.toLocaleString("fr-FR");
}

function enMegaoctets(octets: number): string {
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}
