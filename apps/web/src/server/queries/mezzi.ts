/**
 * Le letture della sezione mezzi. Ogni funzione riceve la transazione di
 * `run` (@/server/db): la RLS filtra per associazione e ruolo, qui non si
 * filtra per tenant.
 */
import "server-only";
import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import * as schema from "@fleetcare/db";
import type { TenantTx } from "@fleetcare/db/client";

const v = schema.vehicles;
const r = schema.odometerReadings;

/** Ordine «naturale» del numero interno: 5 prima di 10, poi i codici senza cifre. */
const byInternalCode = [
  sql`nullif(regexp_replace(${v.internalCode}, '[^0-9]', '', 'g'), '')::numeric nulls last`,
  asc(v.internalCode),
];

export async function listVehicles(
  tx: TenantTx,
  { includeDecommissioned }: { includeDecommissioned: boolean },
) {
  return tx
    .select({
      id: v.id,
      internalCode: v.internalCode,
      plate: v.plate,
      category: v.category,
      status: v.status,
      make: v.make,
      model: v.model,
      odometerKm: v.odometerKm,
    })
    .from(v)
    .where(includeDecommissioned ? undefined : ne(v.status, "decommissioned"))
    .orderBy(...byInternalCode);
}

/** La scheda di un mezzo, con il nome della sede; null se non c'è (o non è di questa associazione). */
export async function getVehicle(tx: TenantTx, id: string) {
  const rows = await tx
    .select({
      id: v.id,
      siteId: v.siteId,
      siteName: schema.sites.name,
      internalCode: v.internalCode,
      callSign: v.callSign,
      plate: v.plate,
      vin: v.vin,
      category: v.category,
      status: v.status,
      statusReason: v.statusReason,
      statusChangedAt: v.statusChangedAt,
      make: v.make,
      model: v.model,
      version: v.version,
      fuelType: v.fuelType,
      grossWeightKg: v.grossWeightKg,
      seats: v.seats,
      stretcherPositions: v.stretcherPositions,
      wheelchairPositions: v.wheelchairPositions,
      outfitter: v.outfitter,
      en1789Type: v.en1789Type,
      hasLift: v.hasLift,
      hasPriorityLights: v.hasPriorityLights,
      registrationDate: v.registrationDate,
      ownership: v.ownership,
      ownerName: v.ownerName,
      bolloExempt: v.bolloExempt,
      initialOdometerKm: v.initialOdometerKm,
      initialOdometerOn: v.initialOdometerOn,
      odometerKm: v.odometerKm,
      odometerUpdatedAt: v.odometerUpdatedAt,
      fuelVehicleCode: v.fuelVehicleCode,
      decommissionedOn: v.decommissionedOn,
      decommissionReason: v.decommissionReason,
      notes: v.notes,
      updatedAt: v.updatedAt,
    })
    .from(v)
    .leftJoin(
      schema.sites,
      and(eq(schema.sites.id, v.siteId), eq(schema.sites.tenantId, v.tenantId)),
    )
    .where(eq(v.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type VehicleRow = NonNullable<Awaited<ReturnType<typeof getVehicle>>>;

/** Le ultime letture del contachilometri di un mezzo, con chi le ha registrate. */
export async function listOdometerReadings(tx: TenantTx, vehicleId: string, limit = 10) {
  return tx
    .select({
      id: r.id,
      km: r.km,
      source: r.source,
      readAt: r.readAt,
      recordedBy: schema.profiles.fullName,
    })
    .from(r)
    .leftJoin(
      schema.profiles,
      and(eq(schema.profiles.id, r.recordedById), eq(schema.profiles.tenantId, r.tenantId)),
    )
    .where(eq(r.vehicleId, vehicleId))
    .orderBy(desc(r.readAt), desc(r.km))
    .limit(limit);
}

/** Le sedi per il menu del modulo: prima le attive, poi le altre (un mezzo può stare in una sede chiusa). */
export async function listSites(tx: TenantTx) {
  return tx
    .select({ id: schema.sites.id, name: schema.sites.name, active: schema.sites.active })
    .from(schema.sites)
    .orderBy(desc(schema.sites.active), asc(schema.sites.name));
}

/** Quante scadenze (non archiviate) ha un mezzo: il conto che si mostra appena creato. */
export async function countVehicleDeadlines(tx: TenantTx, vehicleId: string): Promise<number> {
  const rows = await tx
    .select({ n: count() })
    .from(schema.deadlines)
    .where(and(eq(schema.deadlines.vehicleId, vehicleId), isNull(schema.deadlines.archivedAt)));
  return rows[0]?.n ?? 0;
}
