import type { MotifDeRefus } from "../core/coequipier.ts";
import type { JourneeSondee, Reponse, ReponsesDUnRepondant, Sondage } from "../core/disponibilite.ts";
import { DisponibilitesRefusees, normaliser } from "../core/disponibilite.ts";

/**
 * L'export du sondage de disponibilités — spec 008.
 *
 * Relevé sur le sondage J1-J5 de la saison 2026-2027 :
 *
 *     Nom;J1 - jeu. 05/11/2026 20h-22h30 (Ext. BAD18-5);J2 - sam. 14/11/2026 …
 *     Simon;Oui;Oui;Oui;Oui;Oui
 *     Madoche (qui est blessée et qui changera son vote si elle est réparée);Non;…
 *
 * Première colonne : le nom, et entre parenthèses une remarque qu'on garde.
 * Les autres : une journée chacune, désignée par son numéro et sa date — le
 * reste de l'intitulé (horaire, adversaire) est ignoré, c'est le calendrier
 * qui fait foi. Réponses : `Oui`, `Non`, `Si besoin` ; une case vide n'est pas
 * une réponse.
 *
 * `;` seul, UTF-8 exigé, tout ou rien — comme le fichier d'équipe (005).
 */
const SEPARATEUR = ";";
const JOURNEE = /^J(\d+)\b.*?(\d{2})\/(\d{2})\/(\d{4})/u;
const NOM_ET_REMARQUE = /^(.*?)\s*\((.*)\)\s*$/u;
const VALEURS: Readonly<Record<string, Reponse>> = { oui: "oui", non: "non", "si besoin": "si-besoin" };

export function lireLeCsvDesDisponibilites(contenu: string): Sondage {
  const lignes = contenu.replace(/^﻿/u, "").split(/\r?\n/u);

  const illisibles = lignes.flatMap((ligne, index) =>
    ligne.includes("�")
      ? [
          {
            ligne: index + 1,
            raison:
              "caractère illisible : le fichier n'est pas en UTF-8. Le réenregistrer en « CSV UTF-8 » depuis le tableur.",
          },
        ]
      : [],
  );
  if (illisibles.length > 0) throw new DisponibilitesRefusees(illisibles);

  const numerotees = lignes
    .map((texte, index) => ({ numero: index + 1, texte }))
    .filter(({ texte }) => texte.trim() !== "");
  const [entete, ...donnees] = numerotees;
  if (entete === undefined) throw new DisponibilitesRefusees([{ ligne: null, raison: "fichier vide." }]);

  const motifs: MotifDeRefus[] = [];
  const [, ...intitules] = decouper(entete.texte);
  const journees: JourneeSondee[] = [];
  for (const intitule of intitules) {
    const trouve = JOURNEE.exec(intitule);
    if (trouve === null) {
      motifs.push({
        ligne: entete.numero,
        raison: `colonne « ${intitule} » : ni journée ni date. Attendu « J1 - jeu. 05/11/2026 … ».`,
      });
      continue;
    }
    const [, numero, jour, mois, annee] = trouve;
    const journee = Number(numero);
    if (journees.some((deja) => deja.journee === journee)) {
      motifs.push({ ligne: entete.numero, raison: `J${journee} présente deux fois dans l'en-tête.` });
      continue;
    }
    journees.push({ journee, date: `${annee}-${mois}-${jour}` });
  }
  if (journees.length === 0 && motifs.length === 0) {
    motifs.push({ ligne: entete.numero, raison: "aucune colonne de journée dans l'en-tête." });
  }
  if (motifs.length > 0) throw new DisponibilitesRefusees(motifs);

  if (donnees.length === 0) {
    throw new DisponibilitesRefusees([{ ligne: null, raison: "aucune réponse sous l'en-tête." }]);
  }

  const repondants: ReponsesDUnRepondant[] = [];
  const vus = new Map<string, number>();
  for (const { numero, texte } of donnees) {
    const [cellule = "", ...valeurs] = decouper(texte);
    if (valeurs.length > journees.length) {
      motifs.push({
        ligne: numero,
        raison: `${journees.length + 1} colonne(s) attendue(s), ${valeurs.length + 1} trouvée(s).`,
      });
      continue;
    }

    const avecRemarque = NOM_ET_REMARQUE.exec(cellule);
    const nom = (avecRemarque?.[1] ?? cellule).trim();
    const remarque = avecRemarque?.[2]?.trim() || null;
    if (nom === "") {
      motifs.push({ ligne: numero, raison: "nom vide." });
      continue;
    }
    const cle = normaliser(nom);
    const premiere = vus.get(cle);
    if (premiere !== undefined) {
      motifs.push({ ligne: numero, raison: `« ${nom} » déjà présent ligne ${premiere}.` });
      continue;
    }
    vus.set(cle, numero);

    const reponses = new Map<number, Reponse>();
    for (const [index, valeur] of valeurs.entries()) {
      if (valeur === "") continue;
      const reponse = VALEURS[normaliser(valeur)];
      const journee = journees[index]?.journee;
      if (reponse === undefined || journee === undefined) {
        motifs.push({ ligne: numero, raison: `« ${valeur} » : attendu Oui, Non ou Si besoin.` });
        continue;
      }
      reponses.set(journee, reponse);
    }
    repondants.push({ nom, remarque, reponses });
  }

  if (motifs.length > 0) throw new DisponibilitesRefusees(motifs);
  return { journees, repondants };
}

function decouper(ligne: string): readonly string[] {
  return ligne.split(SEPARATEUR).map((cellule) => cellule.trim());
}
