/*
 * Le peu de JavaScript de l'interface. Tout y est facultatif : sans lui, les
 * pages s'affichent, les formulaires partent, les infobulles s'ouvrent au
 * survol et au focus. Il ajoute le toucher aux infobulles, et le tri aux
 * tableaux.
 */

// --- Infobulles ------------------------------------------------------------
//
// Elles s'ouvrent au survol et au focus, en CSS. Ce code ne sert que le
// toucher : Safari sur iOS ne donne pas le focus à un bouton qu'on touche. Un
// toucher ouvre, un autre ferme, Échap ferme tout.
document.addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest?.(".infobulle > button");
  for (const ouverte of document.querySelectorAll(".infobulle.ouverte")) {
    if (ouverte !== bouton?.parentElement) ouverte.classList.remove("ouverte");
  }
  bouton?.parentElement.classList.toggle("ouverte");
});
document.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Escape") return;
  for (const ouverte of document.querySelectorAll(".infobulle.ouverte")) ouverte.classList.remove("ouverte");
  if (document.activeElement?.closest(".infobulle")) document.activeElement.blur();
});

// --- Tri des tableaux ------------------------------------------------------
//
// Tout tableau dont la première ligne n'a que des en-têtes se trie par
// colonne : un clic trie, un second inverse. La clé est l'attribut `data-tri`
// de la cellule quand la page en pose un (une cote derrière une lettre, une
// date derrière « du 24 au 25 octobre »), son texte sinon. Les lignes
// `.decompte` — les totaux sous une grille — restent en bas.

/** Une valeur comparable : un nombre quand le texte en est un, le texte sinon. */
function cle(cellule) {
  const brut = (cellule?.dataset.tri ?? cellule?.textContent ?? "").trim();
  if (brut === "" || brut === "—") return null;

  const compact = brut.replace(/[\s  ]/g, "");
  const nombre = /^(-?\d+(?:,\d+)?)(%|pts|km|ko|s|min|journées?)?$/i.exec(compact);
  if (nombre) return Number(nombre[1].replace(",", "."));

  const date = /^(\d{2})\/(\d{2})\/(\d{4})(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(compact);
  if (date) {
    const [, jour, mois, annee, heures = 0, minutes = 0, secondes = 0] = date;
    return new Date(annee, mois - 1, jour, heures, minutes, secondes).getTime();
  }

  const heure = /^(\d{1,2})h(\d{2})?$/.exec(compact);
  if (heure) return Number(heure[1]) * 60 + Number(heure[2] ?? 0);

  return brut;
}

function comparer(un, autre) {
  // Une cellule vide ferme la liste, dans un sens comme dans l'autre.
  if (un === null || autre === null) return 0;
  if (typeof un === "number" && typeof autre === "number") return un - autre;
  return String(un).localeCompare(String(autre), "fr", { numeric: true, sensitivity: "base" });
}

function rendreTriable(table) {
  const lignes = [...table.rows];
  const entete = lignes[0];
  if (entete === undefined || lignes.length < 3) return;
  if ([...entete.cells].some((cellule) => cellule.tagName !== "TH")) return;

  const corps = entete.parentElement;
  [...entete.cells].forEach((th, colonne) => {
    // Un bouton dans l'en-tête : c'est lui qui se prend au clavier, et qui
    // annonce au lecteur d'écran qu'on peut trier.
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "trier";
    bouton.append(...th.childNodes);
    th.append(bouton);

    bouton.addEventListener("click", () => {
      const croissant = th.getAttribute("aria-sort") !== "ascending";
      for (const autre of entete.cells) autre.removeAttribute("aria-sort");
      th.setAttribute("aria-sort", croissant ? "ascending" : "descending");

      const toutes = [...table.rows].slice(1);
      const fixes = toutes.filter((ligne) => ligne.classList.contains("decompte"));
      const mobiles = toutes.filter((ligne) => !fixes.includes(ligne));
      const valeurs = new Map(mobiles.map((ligne) => [ligne, cle(ligne.cells[colonne])]));

      mobiles.sort((une, autre) => {
        const a = valeurs.get(une);
        const b = valeurs.get(autre);
        if (a === null || b === null) return (a === null) - (b === null);
        return croissant ? comparer(a, b) : comparer(b, a);
      });
      for (const ligne of [...mobiles, ...fixes]) corps.append(ligne);
    });
  });
}

for (const table of document.querySelectorAll("table")) rendreTriable(table);
