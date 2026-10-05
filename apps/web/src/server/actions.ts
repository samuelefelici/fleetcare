/**
 * Le server action seguono tutte lo stesso schema:
 *   input `unknown` → Zod safeParse → sessione → ruolo → withTenant →
 *   revalidatePath → `ActionResult`, mai un'eccezione verso il client.
 * Un errore del database diventa una frase in italiano (`dbErrorMessage`):
 * i trigger e i vincoli parlano già italiano, qui si traducono i codici.
 */
import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "./db";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Il primo problema di un input non valido, nelle parole del campo. */
export function zodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dati non validi";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

interface PgError {
  code?: string;
  message?: string;
  constraint_name?: string;
  detail?: string;
}

/**
 * drizzle-orm 0.44 avvolge ogni errore del driver in un DrizzleQueryError:
 * il codice Postgres (23505, 42501, P0001…) sta in `cause`, non in `code`.
 * Si scarta l'involucro, così i codici arrivano alla traduzione.
 */
export function unwrapDbError(error: unknown): unknown {
  if (error instanceof Error && error.cause instanceof Object) {
    const cause = error.cause as { code?: unknown };
    if (typeof cause.code === "string") return cause;
  }
  return error;
}

export function dbErrorMessage(error: unknown): string {
  if (error instanceof UnauthorizedError) return "Accesso scaduto: entra di nuovo";
  if (error instanceof ForbiddenError) return error.message;
  const pg = unwrapDbError(error) as PgError;
  switch (pg.code) {
    case "23505":
      return "Esiste già: stesso codice, targa o nome";
    case "23503":
      return "Il riferimento non esiste o non è di questa associazione";
    case "23514":
    case "P0001":
      return pg.message ?? "Il database ha rifiutato il dato";
    case "42501":
      return "Non è un'operazione del tuo ruolo";
    case "22P02":
    case "22007":
    case "22008":
      return "Formato non valido (data o numero)";
    default:
      console.error("[action]", error);
      return "Operazione non riuscita";
  }
}

/** Esegue `fn` e traduce ogni errore in un ActionResult. */
export async function attempt(
  fn: () => Promise<ActionResult | string | void>,
): Promise<ActionResult> {
  try {
    const out = await fn();
    if (typeof out === "string") return { ok: true, id: out };
    return out ?? { ok: true };
  } catch (error) {
    // un redirect (la sessione fatta uscire) non è un errore da tradurre
    unstable_rethrow(error);
    return fail(dbErrorMessage(error));
  }
}
