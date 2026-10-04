/**
 * La password del ruolo applicativo, già cifrata come la conserva Postgres
 * (SCRAM-SHA-256, RFC 5802 e 7677). Con `ALTER ROLE … PASSWORD '<verifier>'`
 * la password in chiaro non arriva mai al server: non può finire nei suoi
 * log né in `pg_stat_activity`.
 *
 * Postgres prepara la password con SASLprep, che lascia invariato il testo
 * ASCII: per questo si accettano solo password ASCII stampabili (quelle
 * generate lo sono). Una password con altri caratteri si rifiuta invece di
 * produrre un verifier che poi non combacia.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export function scramSha256Verifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations = 4096,
): string {
  if (!PRINTABLE_ASCII.test(password)) {
    throw new Error(
      "La password del ruolo applicativo deve essere di soli caratteri ASCII stampabili",
    );
  }
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return (
    `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}` +
    `$${storedKey.toString("base64")}:${serverKey.toString("base64")}`
  );
}
