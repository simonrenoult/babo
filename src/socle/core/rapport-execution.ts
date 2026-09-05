/**
 * La trace laissée par toute exécution automatique — spec 019.
 *
 * Le mode de panne d'un scraper n'est pas l'exception, c'est le succès vide :
 * d'où une issue à trois valeurs, `vide` étant un échec au même titre
 * qu'`echec`.
 */
export const ISSUES = ["succes", "vide", "echec"] as const;

export type Issue = (typeof ISSUES)[number];

export type RapportExecution = {
  readonly tache: string;
  readonly demarreLe: Date;
  readonly termineLe: Date;
  readonly issue: Issue;
  /** Volume extrait de la page — jamais le nombre de nouveautés (spec 019). */
  readonly volumeExtrait: number | null;
  readonly detail: string | null;
};

export type RapportArchive = RapportExecution & { readonly id: number };

/**
 * Une exécution qui n'extrait rien alors que la précédente extrayait quelque
 * chose est un échec, même sans erreur levée. Règle volontairement binaire :
 * un seuil en pourcentage produirait surtout de fausses alertes.
 */
export function issueDuVolume(
  volumeExtrait: number,
  volumePrecedent: number | null,
): Extract<Issue, "succes" | "vide"> {
  const precedentAvaitQuelqueChose = volumePrecedent !== null && volumePrecedent > 0;
  return volumeExtrait === 0 && precedentAvaitQuelqueChose ? "vide" : "succes";
}

/** Port : `infrastructure` en fournit l'adaptateur SQLite. */
export type DepotRapports = {
  consigner(rapport: RapportExecution): RapportArchive;
  /** Ancienneté d'une source, affichée par l'interface même quand la donnée est périmée. */
  dernierRapport(tache: string): RapportArchive | null;
  /**
   * La dernière exécution qui a **abouti** — spec 002.
   *
   * Distincte de `dernierRapport`, et c'est tout l'intérêt : une page métier
   * date ce qu'elle affiche, et un échec de ce matin ne rajeunit pas une donnée
   * qui n'a pas bougé depuis trois semaines. C'est la distinction que 019 fait
   * déjà dans le battement entre « dernière donnée » et « dernier réveil ».
   *
   * Pourquoi pas la date écrite à côté de la donnée, comme le classement le
   * fait avec `vu_le` ? Parce qu'un remplacement intégral peut aboutir à zéro
   * ligne : la passe des engagements vide la table en intersaison (027), et la
   * seule trace de sa réussite disparaîtrait avec. La page dirait « jamais
   * relevé » le lendemain d'une passe parfaite.
   *
   * `vide` n'en fait pas partie : 019 le classe comme une panne, et une passe
   * aveugle ne date rien.
   */
  dernierSucces(tache: string): RapportArchive | null;
  derniers(combien: number): readonly RapportArchive[];
  /**
   * Tout ce qui a tourné depuis une date, du plus ancien au plus récent.
   *
   * C'est la matière du battement hebdomadaire : sans les succès, on ne
   * distingue pas une semaine sans incident d'un planificateur arrêté.
   */
  depuis(quand: Date): readonly RapportArchive[];
};
