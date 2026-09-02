import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { HachageDeMotDePasse } from "../../core/authentification.ts";

/**
 * Adaptateur du port `HachageDeMotDePasse` : scrypt — spec 021.
 *
 * scrypt parce qu'il est dans Node : ni `bcrypt`, qui se compile, ni `argon2`,
 * qui se compile aussi, pour hacher un mot de passe une fois par démarrage et
 * une fois par connexion. Les paramètres sont écrits dans le haché, si bien
 * qu'on pourra les durcir sans invalider ce qui est déjà en base.
 *
 * Synchrone, et ce n'est pas un oubli : la connexion est le seul chemin qui en
 * dépende, une centaine de millisecondes y est le coût recherché, et bloquer la
 * boucle pendant ce temps est une limitation de débit de plus sur la seule
 * porte qu'on cherche à forcer.
 */
const N = 16384;
const R = 8;
const P = 1;
const OCTETS = 32;
const SEL = 16;

export function motDePasseScrypt(): HachageDeMotDePasse {
  const deriver = (clair: string, sel: Buffer): Buffer =>
    scryptSync(clair.normalize("NFKC"), sel, OCTETS, { N, r: R, p: P });

  return {
    hacher(clair: string): string {
      const sel = randomBytes(SEL);
      return ["scrypt", N, R, P, sel.toString("base64"), deriver(clair, sel).toString("base64")].join(
        "$",
      );
    },

    verifier(clair: string, hache: string): boolean {
      const parts = hache.split("$");
      if (parts.length !== 6 || parts[0] !== "scrypt") {
        // Haché absent ou illisible : on dérive quand même, contre un sel
        // fixe. L'appelant compare un mot de passe à un compte qui n'existe
        // pas, et le temps de réponse ne doit pas le lui apprendre.
        deriver(clair, Buffer.alloc(SEL));
        return false;
      }

      const [, n, r, p, sel64, attendu64] = parts as [string, string, string, string, string, string];
      const attendu = Buffer.from(attendu64, "base64");
      const obtenu = scryptSync(clair.normalize("NFKC"), Buffer.from(sel64, "base64"), attendu.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
      });
      return obtenu.length === attendu.length && timingSafeEqual(obtenu, attendu);
    },
  };
}
