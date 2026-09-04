import type { Courrier, Message } from "./courrier.ts";
import { TACHE_COURRIER } from "./courrier.ts";
import type { DepotRapports, Issue, RapportArchive, RapportExecution } from "./rapport-execution.ts";

/**
 * L'alerte de panne — spec 019.
 *
 * Le mode de panne d'un scraper n'est pas l'exception, c'est le succès vide :
 * la page répond, le parseur s'exécute sans rien lever, mais une classe CSS a
 * changé et il n'extrait plus rien. Rien ne casse visiblement, aucun mail ne
 * part, et l'application sert indéfiniment une donnée figée. C'est ce silence
 * que ce fichier rompt.
 *
 * Un décorateur du dépôt, et non un appel dans chaque passe : c'est le même
 * choix que `enArchivant` et `sousPlafond` pour les requêtes sortantes (015).
 * Une passe qui oublierait d'alerter alerterait moins bien qu'une passe qui ne
 * peut pas oublier — et il y en aura d'autres, celles de 015 en premier.
 */

/**
 * `vide` est une panne au même titre qu'`echec` : c'est tout le propos de 019.
 * Une extraction nulle est plus grave qu'une exception, parce qu'elle ne se
 * voit pas.
 */
export function estUnePanne(issue: Issue | undefined): boolean {
  return issue === "echec" || issue === "vide";
}

/**
 * Le dépôt de rapports, qui prévient à l'entrée en panne.
 *
 * **Au passage, pas à chaque exécution.** La spec disait « toute panne
 * déclenche un mail » ; un parseur aveugle le reste jusqu'à correction, et un
 * mail quotidien identique se filtre en trois jours — une alerte qu'on filtre
 * est pire qu'une alerte absente. Le trou que cela ouvrirait, celui de la panne
 * qu'on oublie, est fermé par le battement hebdomadaire, qui rappelle les
 * pannes encore ouvertes.
 *
 * La sortie de panne est annoncée de la même façon, pour une raison symétrique :
 * sans elle, on ne sait jamais si le silence veut dire réparé ou toujours cassé.
 */
export function enAlertant(
  rapports: DepotRapports,
  options: { readonly courrier: Courrier; readonly journal?: (erreur: unknown) => void },
): DepotRapports {
  const { courrier } = options;
  const journal = options.journal ?? ((erreur) => console.error("[socle] alerte", erreur));

  return {
    ...rapports,

    consigner(rapport: RapportExecution): RapportArchive {
      // Lu avant d'écrire : c'est la comparaison avec l'état précédent qui fait
      // toute la différence entre « entre en panne » et « est en panne ».
      const precedent = rapports.dernierRapport(rapport.tache);
      const archive = rapports.consigner(rapport);

      // **Le courrier ne s'alerte jamais lui-même.** 016 l'écrit : un échec
      // d'envoi ne peut pas être signalé par mail. Sans cette exclusion, un
      // vidage en échec déposerait un message, dont le dépôt consignerait un
      // rapport, qui déposerait un message : la boucle est infinie et la boîte
      // d'envoi se remplit toute seule.
      if (rapport.tache === TACHE_COURRIER) return archive;

      const entreEnPanne = estUnePanne(rapport.issue) && !estUnePanne(precedent?.issue);
      const enSort = !estUnePanne(rapport.issue) && estUnePanne(precedent?.issue);
      if (!entreEnPanne && !enSort) return archive;

      // Déposé sans attendre : `consigner` est synchrone et le rester est ce
      // qui permet aux passes de l'appeler sans devenir asynchrones. Le message
      // est écrit en base avant que la promesse ne suspende — c'est la première
      // instruction de `deposer` —, donc rien n'est perdu si le processus meurt
      // pendant la remise.
      void courrier
        .deposer(entreEnPanne ? alerteDePanne(archive) : retourALaNormale(archive, precedent))
        .catch(journal);

      return archive;
    },
  };
}

export function alerteDePanne(rapport: RapportArchive): Message {
  const quand = rapport.demarreLe.toLocaleString("fr-FR");
  const cause =
    rapport.issue === "vide"
      ? "extraction vide : la page a répondu, le parseur n'a rien tiré"
      : "échec";

  return {
    sujet: `Panne — ${rapport.tache}`,
    html:
      `<p><strong>${echapper(rapport.tache)}</strong> est en panne depuis le ${echapper(quand)}.</p>` +
      `<p>${echapper(cause)}.</p>` +
      `<p>${echapper(rapport.detail ?? "aucun détail")}</p>` +
      `<p>Volume extrait : ${rapport.volumeExtrait ?? 0}. La capture est archivée : le parseur se corrige dessus, sans requête réseau.</p>`,
    texte: [
      `${rapport.tache} est en panne depuis le ${quand}.`,
      cause + ".",
      rapport.detail ?? "aucun détail",
      `Volume extrait : ${rapport.volumeExtrait ?? 0}.`,
      "La capture est archivée : le parseur se corrige dessus, sans requête réseau.",
    ].join("\n"),
  };
}

function retourALaNormale(rapport: RapportArchive, precedent: RapportArchive | null): Message {
  const depuis = precedent === null ? "" : ` (en panne depuis le ${precedent.demarreLe.toLocaleString("fr-FR")})`;

  return {
    sujet: `Réparé — ${rapport.tache}`,
    html:
      `<p><strong>${echapper(rapport.tache)}</strong> a de nouveau abouti${echapper(depuis)}.</p>` +
      `<p>${echapper(rapport.detail ?? "aucun détail")}</p>`,
    texte: `${rapport.tache} a de nouveau abouti${depuis}.\n${rapport.detail ?? "aucun détail"}`,
  };
}

/**
 * Ces messages sont composés dans le `core`, donc sans moteur de vue.
 *
 * Le texte vient d'un rapport, qui vient d'un message d'exception, qui vient
 * d'une source distante : il n'y a aucune raison de le croire inoffensif.
 */
export function echapper(texte: string): string {
  return texte
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
