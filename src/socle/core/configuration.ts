import type { Licence } from "./licence.ts";

/**
 * Ce dont l'application a besoin pour démarrer — spec 020.
 *
 * Rien de ce qui est ici ne vit en base : la clé de chiffrement protège
 * justement la base, et le secret de signature de 021 la rejoindra ici.
 */
export type Configuration = {
  readonly port: number;
  readonly base: ConfigurationBase;
  /**
   * Ma licence. Elle n'est pas un secret — elle s'affiche sur ma fiche
   * publique — mais elle désigne les pages que l'acquisition va chercher
   * (spec 015), donc elle se configure plutôt qu'elle ne se devine.
   */
  readonly licence: Licence;
  /**
   * Mot de passe myffbad, s'il est configuré. Absent, l'application marche
   * quand même : la session s'enregistre alors à la main (spec 015). Il ne
   * touche jamais la base — seul le jeton y entre.
   */
  readonly motDePasseMyffbad: string | null;
  /**
   * TLS n'est pas terminé par Express : un proxy en amont s'en charge, et
   * c'est lui qui porte le `Secure` du cookie de 021. Passer à `false` si
   * l'application est un jour exposée sans intermédiaire.
   */
  readonly derriereUnProxy: boolean;
};

export type ConfigurationBase = {
  /** Chemin du fichier SQLite, ou `:memory:` pour les tests. */
  readonly chemin: string;
  /** Clé de chiffrement au repos. Jamais en base, jamais dans la sauvegarde. */
  readonly cle: string;
};
