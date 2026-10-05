"use server";

/**
 * Le scritture di persone e utenze. La rubrica (`profiles`) la scrive solo
 * la direzione; l'utenza (`profile_accounts`) la crea la direzione, e la
 * modifica la direzione o la persona stessa. Lo dicono le policy del
 * database: qui si chiede il ruolo prima (requireRole) per dare subito la
 * frase giusta, e si contano le righe toccate, perché una policy di UPDATE
 * non rifiuta la riga che non si può toccare: la salta.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import * as schema from "@fleetcare/db";
import { hashPassword, verifyPassword } from "@fleetcare/db/ops/password";
import {
  accountEmailSchema,
  editPersonSchema,
  formValues,
  newPersonSchema,
  ownPasswordSchema,
  ownPhoneSchema,
  planAccount,
  selfChangeProblem,
  tempPasswordSchema,
  uniqueViolationMessage,
  unwrapDbError,
} from "@/app/(app)/persone/campi";
import { attempt, dbErrorMessage, fail, zodMessage, type ActionResult } from "@/server/actions";
import { requireRole, requireSession, run } from "@/server/db";

const DIREZIONE = ["admin"] as const;

/** L'errore del database come esito: prima i doppioni (email, tessera), poi la traduzione comune. */
function dbFail(error: unknown): ActionResult {
  // un redirect (la sessione fatta uscire) non è un errore da tradurre
  unstable_rethrow(error);
  const cause = unwrapDbError(error);
  return fail(uniqueViolationMessage(cause) ?? dbErrorMessage(cause));
}

function revalidatePerson(id: string): void {
  revalidatePath("/persone");
  revalidatePath(`/persone/${id}`);
  revalidatePath("/profilo");
}

/** /persone/nuova: la persona e, se c'è l'email, la sua utenza, nella stessa transazione. */
export async function createPerson(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = newPersonSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const input = parsed.data;
    const plan = planAccount(input);
    if (typeof plan === "string") return fail(plan);

    const ctx = await requireSession();
    requireRole(ctx, DIREZIONE);
    try {
      const id = await run(async (tx) => {
        const [profile] = await tx
          .insert(schema.profiles)
          .values({
            tenantId: ctx.tenantId,
            fullName: input.nome,
            role: input.ruolo,
            badgeNumber: input.tessera,
            isDriver: input.autista,
          })
          .returning({ id: schema.profiles.id });
        if (!profile) throw new Error("La persona non è stata creata");
        if (plan.kind === "create") {
          await tx.insert(schema.profileAccounts).values({
            profileId: profile.id,
            tenantId: ctx.tenantId,
            email: plan.email,
            phone: plan.phone,
            passwordHash: plan.passwordHash,
          });
        }
        return profile.id;
      });
      revalidatePath("/persone");
      return id;
    } catch (error) {
      return dbFail(error);
    }
  });
}

/** /persone/[id]: nome, ruolo, tessera, autista; il telefono va nell'utenza, se c'è. */
export async function updatePerson(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = editPersonSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const input = parsed.data;

    const ctx = await requireSession();
    requireRole(ctx, DIREZIONE);
    const problem = selfChangeProblem(ctx, { id: input.id, role: input.ruolo });
    if (problem) return fail(problem);

    try {
      const outcome = await run(async (tx) => {
        const [updated] = await tx
          .update(schema.profiles)
          .set({
            fullName: input.nome,
            role: input.ruolo,
            badgeNumber: input.tessera,
            isDriver: input.autista,
          })
          .where(eq(schema.profiles.id, input.id))
          .returning({ id: schema.profiles.id });
        if (!updated) return "missing" as const;
        const [account] = await tx
          .update(schema.profileAccounts)
          .set({ phone: input.telefono })
          .where(eq(schema.profileAccounts.profileId, input.id))
          .returning({ profileId: schema.profileAccounts.profileId });
        // senza utenza il telefono non ha dove stare: meglio fermarsi che perderlo
        if (!account && input.telefono !== null) throw new NoAccountError();
        return "ok" as const;
      });
      if (outcome === "missing") return fail("Persona non trovata");
      revalidatePerson(input.id);
      return input.id;
    } catch (error) {
      if (error instanceof NoAccountError) {
        return fail("Il telefono si salva nell'utenza: prima crea l'utenza con l'email");
      }
      return dbFail(error);
    }
  });
}

/** Alzato dentro la transazione per annullare anche la modifica della scheda. */
class NoAccountError extends Error {}

/** «Disattiva» / «Riattiva»: una persona disattivata resta in rubrica ma non entra più. */
export async function setPersonActive(id: string, active: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return fail("Identificativo non valido");

    const ctx = await requireSession();
    requireRole(ctx, DIREZIONE);
    const problem = selfChangeProblem(ctx, { id, active });
    if (problem) return fail(problem);

    try {
      const updated = await run(async (tx) => {
        const [row] = await tx
          .update(schema.profiles)
          .set({ active })
          .where(eq(schema.profiles.id, id))
          .returning({ id: schema.profiles.id });
        return row ?? null;
      });
      if (!updated) return fail("Persona non trovata");
      revalidatePerson(id);
    } catch (error) {
      return dbFail(error);
    }
  });
}

/** L'email dell'utenza: la cambia se c'è, altrimenti crea l'utenza (senza password: la imposta poi la direzione). */
export async function setPersonEmail(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = accountEmailSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { id, email } = parsed.data;

    const ctx = await requireSession();
    requireRole(ctx, DIREZIONE);
    try {
      // un solo upsert: due richieste insieme non si pestano i piedi
      await run((tx) =>
        tx
          .insert(schema.profileAccounts)
          .values({ profileId: id, tenantId: ctx.tenantId, email })
          .onConflictDoUpdate({ target: schema.profileAccounts.profileId, set: { email } }),
      );
      revalidatePerson(id);
      return id;
    } catch (error) {
      return dbFail(error);
    }
  });
}

/** Una password temporanea scritta dalla direzione: la persona la cambia poi dal profilo. */
export async function setPersonPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = tempPasswordSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { id, password } = parsed.data;

    const ctx = await requireSession();
    requireRole(ctx, DIREZIONE);
    const passwordHash = hashPassword(password);
    try {
      const updated = await run(async (tx) => {
        const [row] = await tx
          .update(schema.profileAccounts)
          .set({ passwordHash })
          .where(eq(schema.profileAccounts.profileId, id))
          .returning({ profileId: schema.profileAccounts.profileId });
        return row ?? null;
      });
      if (!updated) return fail("Questa persona non ha ancora un'utenza: prima l'email");
      revalidatePerson(id);
      return id;
    } catch (error) {
      return dbFail(error);
    }
  });
}

/** /profilo: la propria password, con quella attuale a conferma. */
export async function changeOwnPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = ownPasswordSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { attuale, nuova } = parsed.data;

    try {
      const outcome = await run(async (tx, ctx) => {
        // la riga resta bloccata fino alla scrittura: una password temporanea
        // messa nel frattempo dalla direzione non viene sovrascritta alla cieca
        const [account] = await tx
          .select({ passwordHash: schema.profileAccounts.passwordHash })
          .from(schema.profileAccounts)
          .where(eq(schema.profileAccounts.profileId, ctx.userId))
          .limit(1)
          .for("update");
        if (!account) return "no-account" as const;
        if (!verifyPassword(attuale, account.passwordHash)) return "wrong" as const;
        await tx
          .update(schema.profileAccounts)
          .set({ passwordHash: hashPassword(nuova) })
          .where(eq(schema.profileAccounts.profileId, ctx.userId));
        return "ok" as const;
      });
      if (outcome === "no-account") return fail("Non hai ancora un'utenza: chiedi alla direzione");
      if (outcome === "wrong") return fail("La password attuale non è giusta");
      revalidatePath("/profilo");
    } catch (error) {
      return dbFail(error);
    }
  });
}

/** /profilo: il proprio telefono. */
export async function updateOwnPhone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = ownPhoneSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));

    try {
      const updated = await run(async (tx, ctx) => {
        const [row] = await tx
          .update(schema.profileAccounts)
          .set({ phone: parsed.data.telefono })
          .where(eq(schema.profileAccounts.profileId, ctx.userId))
          .returning({ profileId: schema.profileAccounts.profileId });
        return row ?? null;
      });
      if (!updated) return fail("Non hai ancora un'utenza: chiedi alla direzione");
      revalidatePath("/profilo");
    } catch (error) {
      return dbFail(error);
    }
  });
}
