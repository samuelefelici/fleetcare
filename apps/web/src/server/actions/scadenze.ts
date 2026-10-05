"use server";

/**
 * Le scritture dello scadenzario. Le regole stanno nel database (RLS e
 * trigger della migration 0001): la scadenza vale la più lontana fra la
 * base scritta a mano e l'ultimo adempimento valido, una data a mano più
 * vicina di quella fissata dall'adempimento si rifiuta, niente adempimenti
 * nel futuro, una scadenza con storico si archivia invece di sparire.
 * Qui si controlla il ruolo prima (per dare subito la frase giusta) e ogni
 * rifiuto del database arriva all'utente tradotto: le frasi proprie dello
 * scadenzario (doppioni, scadenza sparita) da `specialDbMessage`, tutto il
 * resto da `dbErrorMessage`.
 *
 * Le righe toccate si contano: una policy di UPDATE non rifiuta la riga
 * che non si può toccare, la salta.
 */
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as schema from "@fleetcare/db";
import { formValues, specialDbMessage } from "@/app/(app)/scadenze/logica";
import {
  completionSchema,
  newDeadlineSchema,
  overrideSchema,
  removeSchema,
  setDueSchema,
} from "@/app/(app)/scadenze/moduli";
import { todayRome } from "@/lib/format";
import {
  attempt,
  dbErrorMessage,
  fail,
  unwrapDbError,
  zodMessage,
  type ActionResult,
} from "@/server/actions";
import { EQUIPMENT, STAFF, requireRole, requireSession, run } from "@/server/db";

const NOT_FOUND = "Scadenza non trovata, o non è un'operazione del tuo ruolo";

/** L'errore del database come esito: prima le frasi dello scadenzario, poi la traduzione comune. */
function dbFail(error: unknown): ActionResult {
  const cause = unwrapDbError(error);
  return fail(specialDbMessage(cause) ?? dbErrorMessage(cause));
}

function revalidateDeadline(id?: string): void {
  revalidatePath("/scadenze");
  if (id) revalidatePath(`/scadenze/${id}`);
}

/**
 * (a) «Imposta la scadenza»: data e/o km diventano la nuova base; il
 * database tiene la più lontana con l'ultimo adempimento e rifiuta una
 * data più vicina di quella che l'adempimento ha fissato.
 */
export async function setDeadlineDue(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = setDueSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const input = parsed.data;
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    try {
      const updated = await run((tx) =>
        tx
          .update(schema.deadlines)
          .set({ dueOn: input.data, dueKm: input.km, notes: input.note })
          .where(eq(schema.deadlines.id, input.id))
          .returning({ id: schema.deadlines.id }),
      );
      if (updated.length === 0) return fail(NOT_FOUND);
    } catch (error) {
      return dbFail(error);
    }
    revalidateDeadline(input.id);
    return input.id;
  });
}

/** (b) «Registra adempimento», a nome di chi è entrato: il database sposta la scadenza da sé. */
export async function recordCompletion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = completionSchema(todayRome()).safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const input = parsed.data;
    const session = await requireSession();
    requireRole(session, STAFF);
    try {
      const id = await run(async (tx, ctx) => {
        const [row] = await tx
          .insert(schema.deadlineCompletions)
          .values({
            tenantId: ctx.tenantId,
            deadlineId: input.id,
            doneOn: input.data,
            doneKm: input.km,
            outcome: input.esito,
            nextDueOn: input.prossima_data,
            nextDueKm: input.prossima_km,
            supplierId: input.fornitore,
            documentNumber: input.documento,
            costEur: input.costo,
            notes: input.note,
            recordedById: ctx.userId,
          })
          .returning({ id: schema.deadlineCompletions.id });
        if (!row) throw new Error("Adempimento senza riga di ritorno");
        return row.id;
      });
      revalidateDeadline(input.id);
      return id;
    } catch (error) {
      return dbFail(error);
    }
  });
}

/** (d) correzione a mano di periodicità, preavviso e blocco della singola scadenza: vuoto = eredita. */
export async function overrideDeadline(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = overrideSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const input = parsed.data;
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    try {
      const updated = await run((tx) =>
        tx
          .update(schema.deadlines)
          .set({
            intervalMonths: input.mesi,
            intervalDays: input.giorni,
            intervalKm: input.km_periodo,
            alertDays: input.preavviso_giorni,
            alertKm: input.preavviso_km,
            blocking: input.blocco,
          })
          .where(eq(schema.deadlines.id, input.id))
          .returning({ id: schema.deadlines.id }),
      );
      if (updated.length === 0) return fail(NOT_FOUND);
    } catch (error) {
      return dbFail(error);
    }
    revalidateDeadline(input.id);
    return input.id;
  });
}

/**
 * (c) «Elimina»: `remove_deadline` cancella una scadenza senza storico e
 * archivia una con adempimenti. L'esito ('deleted' | 'archived') torna
 * come `id`, così il pulsante dice cosa è successo. Si usa legata all'id
 * (`removeDeadline.bind(null, id)`), con la firma di `useActionState`:
 * così il modulo funziona anche senza JavaScript.
 */
export async function removeDeadline(
  id: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = removeSchema.safeParse({ id });
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    let esito: string;
    try {
      esito = await run(async (tx) => {
        const rows = await tx.execute<{ esito: string }>(
          sql`select fleetcare.remove_deadline(${parsed.data.id}) as esito`,
        );
        return rows[0]?.esito ?? "";
      });
    } catch (error) {
      return dbFail(error);
    }
    if (esito !== "deleted" && esito !== "archived") return fail("Esito inatteso dal database");
    revalidateDeadline(parsed.data.id);
    return esito;
  });
}

/** /scadenze/nuova: una scadenza fuori catalogo per un mezzo o un'attrezzatura; nasce con la data e i km scritti qui. */
export async function createDeadline(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = newDeadlineSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const input = parsed.data;
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    try {
      const id = await run(async (tx, ctx) => {
        const [row] = await tx
          .insert(schema.deadlines)
          .values({
            tenantId: ctx.tenantId,
            deadlineTypeId: input.tipo,
            vehicleId: input.mezzo,
            equipmentId: input.attrezzatura,
            label: input.etichetta,
            dueOn: input.data,
            dueKm: input.km,
          })
          .returning({ id: schema.deadlines.id });
        if (!row) throw new Error("Scadenza senza riga di ritorno");
        return row.id;
      });
      revalidateDeadline(id);
      return id;
    } catch (error) {
      return dbFail(error);
    }
  });
}
