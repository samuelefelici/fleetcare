"use server";

/**
 * Le scritture della sezione attrezzature: nuova, modifica, spostamento,
 * cambio di stato. Chi può fare cosa lo decide il database (RLS e trigger
 * della migration 0001: direzione, responsabile mezzi e responsabile del
 * materiale); qui si controlla il ruolo solo per dare subito la risposta
 * giusta, e ogni rifiuto del database arriva all'utente tradotto da
 * `dbErrorMessage`.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as schema from "@fleetcare/db";
import {
  equipmentEditSchema,
  equipmentSchema,
  formValues,
  moveSchema,
  samePlace,
  statusChangeSchema,
} from "@/app/(app)/attrezzature/parse";
import { attempt, fail, unwrapDbError, zodMessage, type ActionResult } from "@/server/actions";
import { EQUIPMENT, requireRole, requireSession, run } from "@/server/db";
import { createDeadlinesFor } from "@/server/deadlines";
import { getEquipmentPlace } from "@/server/queries/attrezzature";

function revalidateEquipment(id: string) {
  revalidatePath("/attrezzature");
  revalidatePath("/attrezzature/tipi");
  revalidatePath(`/attrezzature/${id}`);
}

/** Il vincolo unico del codice inventario, nelle parole del campo; ogni altro errore resta al traduttore. */
function inventoryCodeTaken(error: unknown): boolean {
  const pg = unwrapDbError(error) as { code?: string; constraint_name?: string };
  return pg.code === "23505" && pg.constraint_name === "equipment_tenant_inventory_uq";
}
const INVENTORY_TAKEN = "Esiste già un'attrezzatura con questo codice inventario";

/** Nuova attrezzatura: insert e, nella stessa transazione, le scadenze previste dal catalogo per il suo tipo. */
export async function createEquipment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = equipmentSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    const { place, ...data } = parsed.data;
    let id: string;
    try {
      id = await run(async (tx, ctx) => {
        const [row] = await tx
          .insert(schema.equipment)
          .values({
            tenantId: ctx.tenantId,
            ...data,
            vehicleId: place.vehicleId,
            siteId: place.siteId,
          })
          .returning({ id: schema.equipment.id });
        if (!row) throw new Error("Inserimento dell'attrezzatura senza riga di ritorno");
        await createDeadlinesFor(tx, ctx.tenantId, row.id, {
          kind: "equipment",
          equipmentTypeId: data.equipmentTypeId,
          ownership: data.ownership,
        });
        return row.id;
      });
    } catch (error) {
      if (inventoryCodeTaken(error)) return fail(INVENTORY_TAKEN);
      throw error;
    }
    revalidateEquipment(id);
    return id;
  });
}

/** Modifica della scheda: tutti i campi del modulo, mai la posizione (che passa da «Sposta»). */
export async function updateEquipment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = equipmentEditSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    const { id, ...data } = parsed.data;
    let updated: Array<{ id: string }>;
    try {
      updated = await run((tx) =>
        tx
          .update(schema.equipment)
          .set(data)
          .where(eq(schema.equipment.id, id))
          .returning({ id: schema.equipment.id }),
      );
    } catch (error) {
      if (inventoryCodeTaken(error)) return fail(INVENTORY_TAKEN);
      throw error;
    }
    if (updated.length === 0) return fail("Attrezzatura non trovata");
    revalidateEquipment(id);
    return id;
  });
}

/**
 * «Sposta»: la nuova posizione (mezzo, sede o nessuna) con il motivo.
 * Aggiorna l'attrezzatura e scrive la riga dello storico nella stessa
 * transazione, a nome di chi sposta.
 */
export async function moveEquipment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = moveSchema.safeParse(formValues(formData));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    const { equipmentId, place, reason } = parsed.data;
    const outcome = await run(async (tx, ctx) => {
      const current = await getEquipmentPlace(tx, equipmentId);
      if (!current) return fail("Attrezzatura non trovata");
      if (samePlace(current, place)) return fail("L'attrezzatura è già lì");
      await tx
        .update(schema.equipment)
        .set({ vehicleId: place.vehicleId, siteId: place.siteId })
        .where(eq(schema.equipment.id, equipmentId));
      await tx.insert(schema.equipmentMovements).values({
        tenantId: ctx.tenantId,
        equipmentId,
        fromVehicleId: current.vehicleId,
        fromSiteId: current.siteId,
        toVehicleId: place.vehicleId,
        toSiteId: place.siteId,
        reason,
        movedById: ctx.userId,
      });
      return null;
    });
    if (outcome) return outcome;
    revalidateEquipment(equipmentId);
  });
}

/** Cambio di stato da un pulsante della scheda (gli argomenti arrivano con `bind`, quindi si rileggono con Zod). */
export async function setEquipmentStatus(id: string, status: string): Promise<ActionResult> {
  return attempt(async () => {
    const parsed = statusChangeSchema.safeParse({ equipmentId: id, status });
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const session = await requireSession();
    requireRole(session, EQUIPMENT);
    const { equipmentId } = parsed.data;
    const updated = await run((tx) =>
      tx
        .update(schema.equipment)
        .set({ status: parsed.data.status })
        .where(eq(schema.equipment.id, equipmentId))
        .returning({ id: schema.equipment.id }),
    );
    if (updated.length === 0) return fail("Attrezzatura non trovata");
    revalidateEquipment(equipmentId);
  });
}
