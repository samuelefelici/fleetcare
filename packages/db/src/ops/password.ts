/**
 * Password delle utenze (profile_accounts.password_hash).
 *
 * scrypt di Node, senza dipendenze: `scrypt$N=16384,r=8,p=1$<sale>$<hash>`,
 * sale e hash in base64. I parametri stanno nel valore, così si possono
 * alzare in futuro senza rompere le utenze esistenti. Il confronto è a
 * tempo costante. La usano l'app web (login, cambio password) e l'avvio del
 * container, per la prima utenza della direzione (prepare.ts).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const MIN_LENGTH = 10;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_LENGTH) return `La password deve avere almeno ${MIN_LENGTH} caratteri`;
  if (password.length > 200) return "La password è troppo lunga";
  return null;
}

export function hashPassword(password: string): string {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$N=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Falso anche con un hash malformato o assente: mai un'eccezione nel login. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const match = /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(
    stored,
  );
  if (!match) return false;
  try {
    const expected = Buffer.from(match[5]!, "base64");
    const actual = scryptSync(password, Buffer.from(match[4]!, "base64"), expected.length, {
      N: Number(match[1]),
      r: Number(match[2]),
      p: Number(match[3]),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
