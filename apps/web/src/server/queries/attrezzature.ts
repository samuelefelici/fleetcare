/**
 * Le letture della sezione attrezzature. Ogni funzione riceve la
 * transazione di `run` (@/server/db): la RLS filtra per associazione e
 * ruolo, qui non si filtra per tenant. Le join portano il tenant per usare
 * le chiavi composte, non per sicurezza.
 */
import "server-only";
import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "@fleetcare/db";
import type { TenantTx } from "@fleetcare/db/client";
import type { ListFilters } from "@/app/(app)/attrezzature/parse";

const e = schema.equipment;
const t = schema.equipmentTypes;
const v = schema.vehicles;
const s = schema.sites;

const typeJoin = and(eq(t.id, e.equipmentTypeId), eq(t.tenantId, e.tenantId));
const vehicleJoin = and(eq(v.id, e.vehicleId), eq(v.tenantId, e.tenantId));
const siteJoin = and(eq(s.id, e.siteId), eq(s.tenantId, e.tenantId));

/** L'ordine del catalogo: per gruppo (l'ordine dell'enum), poi la posizione, poi l'etichetta. */
const byType = [asc(t.group), asc(t.sortOrder), asc(t.label)];

/** Ordine «naturale» del numero interno di un mezzo: 5 prima di 10, poi i codici senza cifre. */
const byInternalCode = [
  sql`nullif(regexp_replace(${v.internalCode}, '[^0-9]', '', 'g'), '')::numeric nulls last`,
  asc(v.internalCode),
];

/** L'elenco: tipo, codici, stato e dove sta; per tipo poi codice inventario. */
export async function listEquipment(tx: TenantTx, f: ListFilters) {
  return tx
    .select({
      id: e.id,
      inventoryCode: e.inventoryCode,
      serialNumber: e.serialNumber,
      manufacturer: e.manufacturer,
      model: e.model,
      status: e.status,
      typeLabel: t.label,
      missionCritical: t.missionCritical,
      vehicleCode: v.internalCode,
      siteName: s.name,
    })
    .from(e)
    .innerJoin(t, typeJoin)
    .leftJoin(v, vehicleJoin)
    .leftJoin(s, siteJoin)
    .where(
      and(
        f.vehicleId ? eq(e.vehicleId, f.vehicleId) : undefined,
        f.siteId ? eq(e.siteId, f.siteId) : undefined,
        f.typeId ? eq(e.equipmentTypeId, f.typeId) : undefined,
        f.status ? eq(e.status, f.status) : undefined,
        !f.status && !f.showAll ? ne(e.status, "disposed") : undefined,
      ),
    )
    .orderBy(
      ...byType,
      sql`${e.inventoryCode} nulls last`,
      sql`${e.serialNumber} nulls last`,
      asc(e.createdAt),
    );
}

/** La scheda: tutte le colonne, con il tipo, il mezzo e la sede; null se non c'è (o non è di questa associazione). */
export async function getEquipment(tx: TenantTx, id: string) {
  const rows = await tx
    .select({
      id: e.id,
      equipmentTypeId: e.equipmentTypeId,
      inventoryCode: e.inventoryCode,
      manufacturer: e.manufacturer,
      model: e.model,
      serialNumber: e.serialNumber,
      status: e.status,
      vehicleId: e.vehicleId,
      siteId: e.siteId,
      positionNote: e.positionNote,
      ownership: e.ownership,
      ownerName: e.ownerName,
      manufacturedOn: e.manufacturedOn,
      purchaseDate: e.purchaseDate,
      purchaseValueEur: e.purchaseValueEur,
      warrantyUntil: e.warrantyUntil,
      attributes: e.attributes,
      notes: e.notes,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      typeLabel: t.label,
      typeGroup: t.group,
      electromedical: t.electromedical,
      missionCritical: t.missionCritical,
      vehicleCode: v.internalCode,
      vehiclePlate: v.plate,
      siteName: s.name,
    })
    .from(e)
    .innerJoin(t, typeJoin)
    .leftJoin(v, vehicleJoin)
    .leftJoin(s, siteJoin)
    .where(eq(e.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type EquipmentRow = NonNullable<Awaited<ReturnType<typeof getEquipment>>>;

/** Solo ciò che serve alle azioni: dove sta e in che stato è. */
export async function getEquipmentPlace(tx: TenantTx, id: string) {
  const rows = await tx
    .select({ id: e.id, vehicleId: e.vehicleId, siteId: e.siteId, status: e.status })
    .from(e)
    .where(eq(e.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Lo storico degli spostamenti, dal più recente, con i nomi di mezzi, sedi e di chi ha spostato. */
export async function listMovements(tx: TenantTx, equipmentId: string, limit = 50) {
  const m = schema.equipmentMovements;
  const fromVehicle = alias(v, "from_vehicle");
  const toVehicle = alias(v, "to_vehicle");
  const fromSite = alias(s, "from_site");
  const toSite = alias(s, "to_site");
  return tx
    .select({
      id: m.id,
      movedAt: m.movedAt,
      reason: m.reason,
      fromVehicleCode: fromVehicle.internalCode,
      fromSiteName: fromSite.name,
      toVehicleCode: toVehicle.internalCode,
      toSiteName: toSite.name,
      movedBy: schema.profiles.fullName,
    })
    .from(m)
    .leftJoin(
      fromVehicle,
      and(eq(fromVehicle.id, m.fromVehicleId), eq(fromVehicle.tenantId, m.tenantId)),
    )
    .leftJoin(toVehicle, and(eq(toVehicle.id, m.toVehicleId), eq(toVehicle.tenantId, m.tenantId)))
    .leftJoin(fromSite, and(eq(fromSite.id, m.fromSiteId), eq(fromSite.tenantId, m.tenantId)))
    .leftJoin(toSite, and(eq(toSite.id, m.toSiteId), eq(toSite.tenantId, m.tenantId)))
    .leftJoin(
      schema.profiles,
      and(eq(schema.profiles.id, m.movedById), eq(schema.profiles.tenantId, m.tenantId)),
    )
    .where(eq(m.equipmentId, equipmentId))
    .orderBy(desc(m.movedAt), desc(m.id))
    .limit(limit);
}

/** Quante scadenze (non archiviate) ha un'attrezzatura: il conto che si mostra appena creata. */
export async function countEquipmentDeadlines(tx: TenantTx, equipmentId: string): Promise<number> {
  const rows = await tx
    .select({ n: count() })
    .from(schema.deadlines)
    .where(and(eq(schema.deadlines.equipmentId, equipmentId), isNull(schema.deadlines.archivedAt)));
  return rows[0]?.n ?? 0;
}

/** I tipi per il menu del modulo: solo quelli attivi, nell'ordine del catalogo. */
export async function listEquipmentTypes(tx: TenantTx) {
  return tx
    .select({ id: t.id, label: t.label, group: t.group, missionCritical: t.missionCritical })
    .from(t)
    .where(eq(t.active, true))
    .orderBy(...byType);
}

/** Il catalogo intero, con quante attrezzature (in archivio e dismesse) ha ogni tipo. */
export async function listEquipmentTypesWithCounts(tx: TenantTx) {
  return tx
    .select({
      id: t.id,
      code: t.code,
      label: t.label,
      group: t.group,
      electromedical: t.electromedical,
      missionCritical: t.missionCritical,
      active: t.active,
      inArchive: sql<number>`count(${e.id}) filter (where ${e.status} <> 'disposed')`.mapWith(
        Number,
      ),
      disposed: sql<number>`count(${e.id}) filter (where ${e.status} = 'disposed')`.mapWith(Number),
    })
    .from(t)
    .leftJoin(e, and(eq(e.equipmentTypeId, t.id), eq(e.tenantId, t.tenantId)))
    .groupBy(t.id)
    .orderBy(...byType);
}

export async function getTypeHeading(tx: TenantTx, id: string) {
  const rows = await tx.select({ id: t.id, label: t.label }).from(t).where(eq(t.id, id)).limit(1);
  return rows[0] ?? null;
}

/** I mezzi fra cui scegliere: non dismessi, per numero interno. */
export async function listVehiclesForSelect(tx: TenantTx) {
  return tx
    .select({ id: v.id, internalCode: v.internalCode, plate: v.plate })
    .from(v)
    .where(ne(v.status, "decommissioned"))
    .orderBy(...byInternalCode);
}

export async function getVehicleHeading(tx: TenantTx, id: string) {
  const rows = await tx
    .select({ id: v.id, internalCode: v.internalCode, plate: v.plate })
    .from(v)
    .where(eq(v.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Le sedi per il menu: prima le attive, la principale in testa, poi le altre. */
export async function listSitesForSelect(tx: TenantTx) {
  return tx
    .select({ id: s.id, name: s.name, active: s.active })
    .from(s)
    .orderBy(desc(s.active), desc(s.isHeadquarters), asc(s.name));
}

export async function getSiteHeading(tx: TenantTx, id: string) {
  const rows = await tx.select({ id: s.id, name: s.name }).from(s).where(eq(s.id, id)).limit(1);
  return rows[0] ?? null;
}
