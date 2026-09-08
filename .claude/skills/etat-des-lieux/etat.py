#!/usr/bin/env python3
"""Lit le dossier `spec/` et rend l'état brut : dépendances, volumes, questions.

La dépendance se lit dans la ligne « bloquée par » du tableau d'en-tête, que
TEMPLATE.md impose à toute spec. C'est la seule source : la prose, elle, sert de
contre-épreuve — un renvoi qui parle de dépendance sans figurer dans la ligne
devient un soupçon, à lever à la lecture.

Le jugement — complexité, priorité — n'est pas ici : ce script ne rend que des
faits.
"""

import json
import pathlib
import re
import sys

ETATS = ["0. draft", "1. backlog", "2. todo", "3. doing", "4. done"]
NOM = re.compile(r"^(\d{3})__([^_]+)__(.+)\.(feat|fix|refactor|tech|chore|docs|test)$")
BLOQUEE_PAR = re.compile(r"^\|\s*bloquée par\s*\|(.*)\|\s*$", re.IGNORECASE | re.MULTILINE)
# « Bloque » est l'arête inverse : « 015 bloque 001 » veut dire que 001 dépend
# de 015. À ne pas confondre avec « bloque une décision », qui parle des
# questions ouvertes.
SORTANTES = re.compile(r"\bBloque\b(?! une décision)", re.IGNORECASE)
DEPENDANCE_EN_PROSE = re.compile(r"\b(Dépend(?:ent)?|Bloquée?|Préalable)\b", re.IGNORECASE)
LIEN = re.compile(r"\[\[([^\]]+)\]\]")


def sans_barre(texte: str) -> str:
    """Retire les passages barrés : ils disent ce qui *n'est plus* vrai.

    « ~~Bloquée par [[015]]~~ **Faite** » n'est pas une dépendance, et une ligne
    « bloquée par » dont toutes les entrées sont barrées est une spec libre.
    C'est la convention d'amendement du dépôt ; la lire à l'envers ferait tenir
    pour bloquée une spec débloquée depuis des semaines.
    """
    return re.sub(r"~~.*?~~", " ", texte, flags=re.DOTALL)


def liens_de_la_phrase(texte: str, depart: int) -> list[str]:
    """Les renvois cités par une phrase, à partir de son mot déclencheur.

    On s'arrête à la fin de la phrase, jamais à un point situé dans un renvoi —
    « [[003__mon-profil__historique-de-matchs.feat]] » en contient un.
    """
    profondeur, fin = 0, len(texte)
    for i in range(depart, len(texte)):
        if texte.startswith("[[", i):
            profondeur += 1
        elif texte.startswith("]]", i):
            profondeur = max(0, profondeur - 1)
        elif profondeur == 0:
            if texte[i] == "." and (i + 1 >= len(texte) or texte[i + 1] in " \n"):
                fin = i
                break
            if texte.startswith("\n\n", i):
                fin = i
                break
    return LIEN.findall(texte[depart:fin])


def questions_ouvertes(texte: str) -> list[str]:
    """Les puces de « ## Questions » qui ne sont pas tranchées.

    Une question tranchée porte sa réponse barrée : « ~~…~~ **Tranché** ».
    """
    bloc = re.search(r"^## Questions\s*$(.*?)(?=^## |\Z)", texte, re.MULTILINE | re.DOTALL)
    if bloc is None:
        return []
    puces = re.findall(r"^- (.+?)(?=^- |\Z)", bloc.group(1), re.MULTILINE | re.DOTALL)
    return [" ".join(p.split())[:110] for p in puces if not p.lstrip().startswith("~~")]


def lire(racine: pathlib.Path) -> dict:
    specs = {}
    for etat in ETATS:
        for fichier in sorted((racine / etat).glob("*.md")):
            trouve = NOM.match(fichier.stem)
            if trouve is None:
                print(f"[!] nom hors convention : {fichier.name}", file=sys.stderr)
                continue
            texte = fichier.read_text(encoding="utf-8")
            vivant = sans_barre(texte)

            ligne = BLOQUEE_PAR.search(vivant)
            declaree = sorted(set(LIEN.findall(ligne.group(1)))) if ligne else []

            # La contre-épreuve : ce que la prose appelle une dépendance sans
            # que la ligne d'en-tête le porte. 006 en a été le cas d'école —
            # elle dépendait de 003 par un « **Et de [[003]]** » que rien ne
            # déclarait, et sa propre note dit qu'un tri l'aurait fait mentir.
            en_prose = []
            for m in DEPENDANCE_EN_PROSE.finditer(vivant):
                en_prose.extend(liens_de_la_phrase(vivant, m.end()))

            sortantes = []
            for m in SORTANTES.finditer(vivant):
                sortantes.extend(liens_de_la_phrase(vivant, m.end()))

            identifiant, module, _, type_ = trouve.groups()
            specs[fichier.stem] = {
                "id": identifiant,
                "module": module,
                "type": type_,
                "etat": etat,
                "titre": texte.splitlines()[0].lstrip("# ").strip(),
                "lignes": len(texte.splitlines()),
                "ligne_absente": ligne is None,
                "depend_de": declaree,
                "bloque_declare": sorted(set(sortantes)),
                "soupcons": sorted(set(en_prose) - set(declaree)),
                "questions": questions_ouvertes(texte),
            }
    return specs


def main() -> None:
    racine = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "spec")
    specs = lire(racine)

    for nom, spec in specs.items():
        debloque = {a for a in spec["bloque_declare"] if a in specs}
        debloque |= {autre for autre, s in specs.items() if nom in s["depend_de"]}
        spec["debloque"] = sorted(debloque)
        spec["bloquants"] = sorted(
            d for d in spec["depend_de"] if specs.get(d, {}).get("etat") != "4. done"
        )
        spec["renvois_inconnus"] = sorted(
            d for d in spec["depend_de"] + spec["bloque_declare"] if d not in specs
        )
        # Un soupçon ne compte que s'il désigne une spec qui n'est pas faite :
        # citer une spec livrée n'a jamais retenu personne.
        spec["soupcons"] = [
            s for s in spec["soupcons"] if specs.get(s, {}).get("etat", "4. done") != "4. done"
        ]

    print(json.dumps(specs, ensure_ascii=False, indent=1, sort_keys=True))


if __name__ == "__main__":
    main()
