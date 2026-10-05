/**
 * Le regole dei moduli di persone e utenze: schemi Zod e funzioni pure,
 * senza database né sessione, così si provano con Vitest
 * (tests/persone.test.ts). Le usano le server action
 * (src/server/actions/persone.ts). Non è un file "use server".
 *
 * I campi dei moduli hanno nomi italiani (nome, ruolo, tessera…): il primo
 * errore di Zod arriva all'utente come «campo: frase», quindi il nome del
 * campo deve leggersi bene.
 */
import { z } from "zod";
import { profileRole } from "@fleetcare/db";
import { hashPassword, passwordProblem } from "@fleetcare/db/ops/password";

/** I ruoli, nell'ordine dell'enum del database. */
export const ROLES = profileRole.enumValues;
export type Role = (typeof ROLES)[number];

/** Un campo di testo facoltativo: assente o vuoto → null, altrimenti ripulito. */
const optionalText = (max: number, label: string) =>
  z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(max, `${label}: troppo lungo`).nullable(),
  );

/** Una casella di spunta di un modulo HTML: presente («on») → vero, assente → falso. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === "1", z.boolean());

const uuid = z.string().uuid("Identificativo non valido");

const email = z
  .string({ message: "Scrivi l'email" })
  .trim()
  .min(1, "Scrivi l'email")
  .max(200, "Email troppo lunga")
  .email("Non è un indirizzo email");

/** Una password nuova: le regole sono quelle di @fleetcare/db (passwordProblem). */
const newPassword = z.string({ message: "Scrivi la password" }).superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

const personFields = {
  nome: z
    .string({ message: "Scrivi nome e cognome" })
    .trim()
    .min(1, "Scrivi nome e cognome")
    .max(120, "Nome troppo lungo"),
  ruolo: z.enum(ROLES, { message: "Scegli un ruolo" }),
  tessera: optionalText(40, "Numero di tessera"),
  autista: checkbox,
  telefono: optionalText(40, "Telefono"),
};

/** /persone/nuova: la persona, più l'utenza facoltativa. */
export const newPersonSchema = z.object({
  ...personFields,
  email: optionalText(200, "Email").pipe(email.nullable()),
  password: optionalText(200, "Password"),
});
export type NewPersonInput = z.infer<typeof newPersonSchema>;

/** /persone/[id]: la modifica della scheda. */
export const editPersonSchema = z.object({ id: uuid, ...personFields });
export type EditPersonInput = z.infer<typeof editPersonSchema>;

/** L'email dell'utenza (crea o cambia). */
export const accountEmailSchema = z.object({ id: uuid, email });

/** La password temporanea scritta dalla direzione. */
export const tempPasswordSchema = z.object({ id: uuid, password: newPassword });

/** /profilo: il cambio della propria password. */
export const ownPasswordSchema = z
  .object({
    attuale: z
      .string({ message: "Scrivi la password attuale" })
      .min(1, "Scrivi la password attuale"),
    nuova: newPassword,
    conferma: z.string({ message: "Ripeti la password nuova" }),
  })
  .refine((d) => d.nuova === d.conferma, {
    path: ["conferma"],
    message: "Le due password non coincidono",
  });

/** /profilo: il proprio telefono. */
export const ownPhoneSchema = z.object({ telefono: optionalText(40, "Telefono") });

/** I campi di un modulo come oggetto semplice, per Zod (una casella assente non c'è). */
export function formValues(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData);
}

/** Cosa fare dell'utenza quando nasce una persona. */
export type AccountPlan =
  | { kind: "none" }
  | { kind: "create"; email: string; phone: string | null; passwordHash: string | null };

/**
 * Con l'email si crea anche l'utenza (password facoltativa: senza, la
 * persona non entra finché la direzione non gliene imposta una). Telefono
 * e password stanno nell'utenza, quindi senza email non si possono
 * salvare: meglio dirlo che perderli in silenzio. Restituisce la frase
 * dell'errore, se c'è.
 */
export function planAccount(
  input: { email: string | null; telefono: string | null; password: string | null },
  hash: (password: string) => string = hashPassword,
): AccountPlan | string {
  if (!input.email) {
    if (input.telefono) return "Per salvare il telefono serve anche l'email dell'utenza";
    if (input.password) return "Per impostare una password serve anche l'email dell'utenza";
    return { kind: "none" };
  }
  let passwordHash: string | null = null;
  if (input.password) {
    const problem = passwordProblem(input.password);
    if (problem) return problem;
    passwordHash = hash(input.password);
  }
  return { kind: "create", email: input.email, phone: input.telefono, passwordHash };
}

/**
 * Ciò che la direzione non può fare a sé stessa: togliersi l'accesso o
 * cambiarsi il ruolo (resterebbe un'associazione senza direzione, o con
 * una sessione che dice una cosa e il database un'altra). Lo chiede a un
 * altro membro della direzione.
 */
export function selfChangeProblem(
  ctx: { userId: string; role: string },
  target: { id: string; role?: string; active?: boolean },
): string | null {
  if (target.id !== ctx.userId) return null;
  if (target.active === false) {
    return "Non puoi disattivare te stesso: chiedi a un altro membro della direzione";
  }
  if (target.role !== undefined && target.role !== ctx.role) {
    return "Non puoi cambiare il tuo ruolo: chiedi a un altro membro della direzione";
  }
  return null;
}

/**
 * drizzle-orm 0.44 avvolge l'errore del driver in un DrizzleQueryError:
 * il codice Postgres (23505, 42501…) sta in `cause`. Si scarta l'involucro
 * prima di tradurre l'errore in una frase.
 */
export function unwrapDbError(error: unknown): unknown {
  if (error instanceof Error && error.cause !== undefined && error.cause !== null) {
    const cause = error.cause as { code?: unknown };
    if (typeof cause.code === "string") return cause;
  }
  return error;
}

const UNIQUE_MESSAGES: Record<string, string> = {
  profile_accounts_tenant_email_uq: "Email già usata da un'altra persona dell'associazione",
  profiles_tenant_badge_uq: "Numero di tessera già assegnato a un'altra persona",
  profile_accounts_pkey: "Questa persona ha già un'utenza",
};

/** La frase per un doppione (errore 23505) delle tabelle delle persone, o null se l'errore è un altro. */
export function uniqueViolationMessage(error: unknown): string | null {
  const pg = error as { code?: unknown; constraint_name?: unknown } | null;
  if (!pg || pg.code !== "23505") return null;
  const name = typeof pg.constraint_name === "string" ? pg.constraint_name : "";
  return UNIQUE_MESSAGES[name] ?? "Esiste già una persona con questi dati";
}
