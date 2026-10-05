/**
 * Le letture dello scadenzario. Tutto parte dalla vista `deadlines_effective`
 * (i valori effettivi, già ereditati da regola e tipo) e si aggancia il
 * soggetto: il mezzo (numero interno, targa, km attuali per valutare le
 * scadenze a km) oppure l'attrezzatura (tipo, matricola e il mezzo su cui
 * sta). Chi vede cosa lo decide la RLS: qui non si filtra per associazione.
 */
import "server-only";
import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "@fleetcare/db";
import type { TenantTx } from "@fleetcare/db/client";

const v = schema.deadlinesEffective;
const d = schema.deadlines;
const t = schema.deadlineTypes;
const c = schema.deadlineCompletions;
/** il mezzo a bordo del quale sta l'attrezzatura (secondo join sulla stessa tabella) */
const hostVehicle = alias(schema.vehicles, "host_vehicle");

/** Le colonne del soggetto, uguali nell'elenco e nella scheda. */
const subjectColumns = {
  vehicleCode: schema.vehicles.internalCode,
  vehiclePlate: schema.vehicles.plate,
  vehicleOdometerKm: schema.vehicles.odometerKm,
  equipmentTypeLabel: schema.equipmentTypes.label,
  equipmentSerial: schema.equipment.serialNumber,
  equipmentInventory: schema.equipment.inventoryCode,
  hostVehicleId: hostVehicle.id,
  hostVehicleCode: hostVehicle.internalCode,
  hostVehiclePlate: hostVehicle.plate,
};

const viewColumns = {
  id: v.id,
  deadlineTypeId: v.deadlineTypeId,
  typeCode: v.typeCode,
  typeLabel: v.typeLabel,
  subject: v.subject,
  vehicleId: v.vehicleId,
  equipmentId: v.equipmentId,
  label: v.label,
  dueOn: v.dueOn,
  dueKm: v.dueKm,
  baseDueOn: v.baseDueOn,
  baseDueKm: v.baseDueKm,
  lastDoneOn: v.lastDoneOn,
  lastDoneKm: v.lastDoneKm,
  archivedAt: v.archivedAt,
  intervalMonths: v.intervalMonths,
  intervalDays: v.intervalDays,
  intervalKm: v.intervalKm,
  alertDays: v.alertDays,
  alertKm: v.alertKm,
  blocking: v.blocking,
  monthEnd: v.monthEnd,
  renewFromDue: v.renewFromDue,
  renewGraceDays: v.renewGraceDays,
  overridden: v.overridden,
};

/* I join del soggetto: il mezzo, oppure l'attrezzatura con il suo tipo e il mezzo che la ospita. */
const vehicleJoin = and(
  eq(schema.vehicles.id, v.vehicleId),
  eq(schema.vehicles.tenantId, v.tenantId),
);
const equipmentJoin = and(
  eq(schema.equipment.id, v.equipmentId),
  eq(schema.equipment.tenantId, v.tenantId),
);
const equipmentTypeJoin = and(
  eq(schema.equipmentTypes.id, schema.equipment.equipmentTypeId),
  eq(schema.equipmentTypes.tenantId, schema.equipment.tenantId),
);
const hostVehicleJoin = and(
  eq(hostVehicle.id, schema.equipment.vehicleId),
  eq(hostVehicle.tenantId, v.tenantId),
);

export interface DeadlineFilter {
  vehicleId?: string | undefined;
  equipmentId?: string | undefined;
}

/**
 * Le scadenze non archiviate (tutte, o quelle di un mezzo / di
 * un'attrezzatura). L'ordine per urgenza lo fa `sortByUrgency`, in
 * memoria: lo stato dipende dall'oggi di Roma e dai km del mezzo.
 */
export async function listDeadlines(tx: TenantTx, filter: DeadlineFilter = {}) {
  const conditions: SQL[] = [isNull(v.archivedAt)];
  if (filter.vehicleId) conditions.push(eq(v.vehicleId, filter.vehicleId));
  if (filter.equipmentId) conditions.push(eq(v.equipmentId, filter.equipmentId));
  return tx
    .select({ ...viewColumns, ...subjectColumns })
    .from(v)
    .leftJoin(schema.vehicles, vehicleJoin)
    .leftJoin(schema.equipment, equipmentJoin)
    .leftJoin(schema.equipmentTypes, equipmentTypeJoin)
    .leftJoin(hostVehicle, hostVehicleJoin)
    .where(and(...conditions))
    .orderBy(asc(v.typeLabel), asc(v.label));
}

export type DeadlineListRow = Awaited<ReturnType<typeof listDeadlines>>[number];

/** La scheda: valori effettivi, correzioni a mano, il tipo, il soggetto. Anche se archiviata. */
export async function getDeadline(tx: TenantTx, id: string) {
  const rows = await tx
    .select({
      ...viewColumns,
      ...subjectColumns,
      notes: d.notes,
      ownIntervalMonths: d.intervalMonths,
      ownIntervalDays: d.intervalDays,
      ownIntervalKm: d.intervalKm,
      ownAlertDays: d.alertDays,
      ownAlertKm: d.alertKm,
      ownBlocking: d.blocking,
      updatedAt: d.updatedAt,
      typeDescription: t.description,
      typeReference: t.reference,
      completedByCrew: t.completedByCrew,
      documentRequired: t.documentRequired,
    })
    .from(v)
    .innerJoin(d, and(eq(d.id, v.id), eq(d.tenantId, v.tenantId)))
    .innerJoin(t, and(eq(t.id, v.deadlineTypeId), eq(t.tenantId, v.tenantId)))
    .leftJoin(schema.vehicles, vehicleJoin)
    .leftJoin(schema.equipment, equipmentJoin)
    .leftJoin(schema.equipmentTypes, equipmentTypeJoin)
    .leftJoin(hostVehicle, hostVehicleJoin)
    .where(eq(v.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type DeadlineDetail = NonNullable<Awaited<ReturnType<typeof getDeadline>>>;

/** Lo storico degli adempimenti, dal più recente, con fornitore e nome di chi l'ha registrato. */
export async function listCompletions(tx: TenantTx, deadlineId: string) {
  return tx
    .select({
      id: c.id,
      doneOn: c.doneOn,
      doneKm: c.doneKm,
      outcome: c.outcome,
      nextDueOn: c.nextDueOn,
      nextDueKm: c.nextDueKm,
      costEur: c.costEur,
      documentNumber: c.documentNumber,
      notes: c.notes,
      createdAt: c.createdAt,
      supplierName: schema.suppliers.name,
      recordedBy: schema.profiles.fullName,
    })
    .from(c)
    .leftJoin(
      schema.suppliers,
      and(eq(schema.suppliers.id, c.supplierId), eq(schema.suppliers.tenantId, c.tenantId)),
    )
    .leftJoin(
      schema.profiles,
      and(eq(schema.profiles.id, c.recordedById), eq(schema.profiles.tenantId, c.tenantId)),
    )
    .where(eq(c.deadlineId, deadlineId))
    .orderBy(desc(c.doneOn), desc(c.createdAt));
}

export type CompletionRow = Awaited<ReturnType<typeof listCompletions>>[number];

/** I fornitori attivi, per la tendina dell'adempimento. */
export async function listSuppliers(tx: TenantTx) {
  return tx
    .select({ id: schema.suppliers.id, name: schema.suppliers.name })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.active, true))
    .orderBy(asc(schema.suppliers.name));
}

/** I tipi di scadenza non archiviati per i mezzi oppure per le attrezzature. */
export async function listDeadlineTypes(tx: TenantTx, subject: "vehicle" | "equipment") {
  return tx
    .select({
      id: t.id,
      code: t.code,
      label: t.label,
      intervalMonths: t.intervalMonths,
      intervalDays: t.intervalDays,
      intervalKm: t.intervalKm,
    })
    .from(t)
    .where(and(eq(t.subject, subject), isNull(t.archivedAt)))
    .orderBy(asc(t.sortOrder), asc(t.label));
}

/** Il mezzo di un filtro o di una scadenza nuova: quanto basta per il titolo. */
export async function getVehicleBrief(tx: TenantTx, id: string) {
  const rows = await tx
    .select({
      id: schema.vehicles.id,
      internalCode: schema.vehicles.internalCode,
      plate: schema.vehicles.plate,
      odometerKm: schema.vehicles.odometerKm,
    })
    .from(schema.vehicles)
    .where(eq(schema.vehicles.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** L'attrezzatura di un filtro o di una scadenza nuova: tipo, matricola e il mezzo su cui sta. */
export async function getEquipmentBrief(tx: TenantTx, id: string) {
  const rows = await tx
    .select({
      id: schema.equipment.id,
      serialNumber: schema.equipment.serialNumber,
      inventoryCode: schema.equipment.inventoryCode,
      typeLabel: schema.equipmentTypes.label,
      vehicleId: schema.equipment.vehicleId,
      vehicleCode: schema.vehicles.internalCode,
      vehiclePlate: schema.vehicles.plate,
    })
    .from(schema.equipment)
    .innerJoin(
      schema.equipmentTypes,
      and(
        eq(schema.equipmentTypes.id, schema.equipment.equipmentTypeId),
        eq(schema.equipmentTypes.tenantId, schema.equipment.tenantId),
      ),
    )
    .leftJoin(
      schema.vehicles,
      and(
        eq(schema.vehicles.id, schema.equipment.vehicleId),
        eq(schema.vehicles.tenantId, schema.equipment.tenantId),
      ),
    )
    .where(eq(schema.equipment.id, id))
    .limit(1);
  return rows[0] ?? null;
}
