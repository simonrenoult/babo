import type { Discipline } from "../../socle/core/classement.ts";
import type { Sexe } from "../core/coequipier.ts";
import type { Places } from "../core/forces-par-tableau.ts";

/**
 * Les places d'un tableau, écrites comme on les dit — spec 029.
 *
 * « deux hommes classés en simple », « une femme classée en double », « un
 * homme et une femme classés en mixte ». L'accord est la seule raison d'être de
 * ce fichier : une phrase montée à la volée dans la vue donnerait « il manque
 * une femme classés en double », et une page qui écrit mal ce qu'elle a compté
 * fait douter du compte.
 */
const NOMBRES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];

export function enJoueurs(places: readonly Places[]): string {
  return places
    .map(({ sexe, nombre }) => `${combien(sexe, nombre)} ${qui(sexe, nombre)}`)
    .join(" et ");
}

export function joueursRequis(places: readonly Places[], discipline: Discipline): string {
  return `${enJoueurs(places)} ${classes(places)} en ${discipline}`;
}

function combien(sexe: Sexe, nombre: number): string {
  if (sexe === "F" && nombre === 1) return "une";
  return NOMBRES[nombre] ?? String(nombre);
}

function qui(sexe: Sexe, nombre: number): string {
  const singulier = sexe === "F" ? "femme" : "homme";
  return nombre > 1 ? `${singulier}s` : singulier;
}

/** Le masculin l'emporte dès qu'un homme est dans le groupe : c'est la règle, pas un choix. */
function classes(places: readonly Places[]): string {
  const total = places.reduce((somme, { nombre }) => somme + nombre, 0);
  const feminin = places.every(({ sexe }) => sexe === "F");
  if (feminin) return total > 1 ? "classées" : "classée";
  return total > 1 ? "classés" : "classé";
}
