"use server";

/**
 * Le scritture della sezione mezzi. Chi può fare cosa lo decide il
 * database (RLS e trigger della migration 0001); qui si controlla il
 * ruolo solo per dare subito la risposta giusta, e ogni rifiuto del
 * database arriva all'utente tradotto da `dbErrorMessage`.
 *
 * Il km del mezzo (`odometer_km`) non si scrive mai: lo ricalcola il
 * database a ogni lettura del contachilometri.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as schema from "@fleetcare/db";
import {
  decommissionSchema,
  formValues,
  odometerReadingSchema,
  statusChangeSchema,
  vehicleEditSchema,
  vehicleSchema,
} from "@/app/(app)/mezzi/parse";
import { attempt, fail, zodMessage, type ActionResult } from "@/server/actions";
import { FLEET, requireRole, requireSession, run } from "@/server/db";
import { createDeadlinesFor } from "@/server/deadlines";

function revalidateVehicle(id: string) {
  revalidatePath("/mezzi");
  revalidatePath(`/mezzi/${id}`);
}

/** Nuovo mezzo: insert e, nella stessa transazione, le scadenze della sua categoria. */
export async function createVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = vehicleSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, FLEET);
    const data = parsed.data;
    const id = await run(async (tx, ctx) => {
      const [row] = await tx
        .insert(schema.vehicles)
        .values({ tenantId: ctx.tenantId, ...data })
        .returning({ id: schema.vehicles.id });
      if (!row) throw new Error("Inserimento del mezzo senza riga di ritorno");
      await createDeadlinesFor(tx, ctx.tenantId, row.id, {
        kind: "vehicle",
        category: data.category,
        ownership: data.ownership,
        bolloExempt: data.bolloExempt,
      });
      return row.id;
    });
    revalidateVehicle(id);
    return id;
  });
}

/** Modifica dell'anagrafica: tutti i campi del modulo, mai il km attuale. */
export async function updateVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = vehicleEditSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, FLEET);
    const { id, ...data } = parsed.data;
    const updated = await run((tx) =>
      tx
        .update(schema.vehicles)
        .set(data)
        .where(eq(schema.vehicles.id, id))
        .returning({ id: schema.vehicles.id }),
    );
    if (updated.length === 0) return fail("Mezzo non trovato");
    revalidateVehicle(id);
    return id;
  });
}

/** Una lettura del contachilometri, a nome di chi è entrato: la fa chiunque. */
export async function addOdometerReading(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = odometerReadingSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { vehicleId, km, readAt } = parsed.data;
    await run((tx, ctx) =>
      tx.insert(schema.odometerReadings).values({
        tenantId: ctx.tenantId,
        vehicleId,
        km,
        readAt,
        source: "manual",
        recordedById: ctx.userId,
      }),
    );
    revalidateVehicle(vehicleId);
  });
}

/** Cambio di stato (in servizio, riserva, officina, fermo) con il motivo; rimette in flotta un mezzo dismesso. */
export async function changeVehicleStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = statusChangeSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, FLEET);
    const { vehicleId, status, reason } = parsed.data;
    const updated = await run((tx) =>
      tx
        .update(schema.vehicles)
        .set({
          status,
          statusReason: reason,
          statusChangedAt: new Date(),
          decommissionedOn: null,
          decommissionReason: null,
        })
        .where(eq(schema.vehicles.id, vehicleId))
        .returning({ id: schema.vehicles.id }),
    );
    if (updated.length === 0) return fail("Mezzo non trovato");
    revalidateVehicle(vehicleId);
  });
}

/** Dismissione: data e motivo, lo stato diventa «dismesso». */
export async function decommissionVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = decommissionSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, FLEET);
    const { vehicleId, decommissionedOn, reason } = parsed.data;
    const updated = await run((tx) =>
      tx
        .update(schema.vehicles)
        .set({
          status: "decommissioned",
          decommissionedOn,
          decommissionReason: reason,
          statusReason: reason,
          statusChangedAt: new Date(),
        })
        .where(eq(schema.vehicles.id, vehicleId))
        .returning({ id: schema.vehicles.id }),
    );
    if (updated.length === 0) return fail("Mezzo non trovato");
    revalidateVehicle(vehicleId);
  });
}
