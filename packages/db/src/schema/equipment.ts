import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fleetcareSchema, tenantFk, tenantKey } from "./_schema";
import { profiles, sites, tenants } from "./core";
import { equipmentGroup, equipmentStatus, ownershipKind } from "./enums";
import { vehicles } from "./vehicles";

/**
 * Catalogo dei tipi di attrezzatura (DAE, aspiratore, bombola O2, barella
 * autocaricante, estintore, sollevatore…). È per tenant e il seed lo
 * precarica: un'associazione con un ventilatore di marca diversa aggiunge
 * il suo tipo senza toccare il codice.
 *
 * Le scadenze che un tipo porta con sé (verifica elettrica, manutenzione
 * del fabbricante, collaudo…) non stanno qui: stanno in `deadline_rules`.
 */
export const equipmentTypes = fleetcareSchema.table(
  "equipment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    label: text("label").notNull(),
    group: equipmentGroup("group").notNull(),
    /** dispositivo elettromedicale: soggetto a verifica di sicurezza elettrica (CEI EN 62353) */
    electromedical: boolean("electromedical").notNull().default(false),
    /**
     * Se è guasto o scaduto, il mezzo che lo richiede in dotazione non può
     * uscire: il DAE per l'ambulanza di soccorso, la barella autocaricante,
     * il sollevatore per il pulmino. È il collegamento fra lo stato di
     * un'attrezzatura e la disponibilità del mezzo.
     */
    missionCritical: boolean("mission_critical").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("equipment_types", t),
    uniqueIndex("equipment_types_tenant_code_uq").on(t.tenantId, t.code),
  ],
);

/** Attributi propri di un tipo: capacità bombola, kg e agente dell'estintore, portata della barella… */
export type EquipmentAttributes = Record<string, string | number | boolean>;

/**
 * Le singole attrezzature, una riga per oggetto con matricola. È il
 * registro che risponde a «dov'è il DAE con matricola X» e «cosa scade
 * a bordo dell'ambulanza 3».
 *
 * Un'attrezzatura sta **a bordo di un mezzo** oppure **in una sede**, mai
 * in entrambi (vincolo). Gli spostamenti lasciano traccia in
 * `equipment_movements`: un DAE che passa da un mezzo all'altro porta con
 * sé le sue scadenze, perché le scadenze sono dell'oggetto, non del mezzo.
 */
export const equipment = fleetcareSchema.table(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    equipmentTypeId: uuid("equipment_type_id").notNull(),
    /** n. di inventario interno (etichetta/QR applicato sull'oggetto) */
    inventoryCode: text("inventory_code"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    status: equipmentStatus("status").notNull().default("in_use"),
    vehicleId: uuid("vehicle_id"),
    siteId: uuid("site_id"),
    /** dove sta sul mezzo: "vano sanitario, parete sx", "zaino rosso" */
    positionNote: text("position_note"),
    ownership: ownershipKind("ownership").notNull().default("owned"),
    /** proprietario quando non è l'associazione (es. AST per un DAE in comodato) */
    ownerName: text("owner_name"),
    /** data di fabbricazione: per bombole ed estintori la vita del recipiente parte da qui */
    manufacturedOn: date("manufactured_on"),
    purchaseDate: date("purchase_date"),
    purchaseValueEur: numeric("purchase_value_eur", { precision: 12, scale: 2 }),
    warrantyUntil: date("warranty_until"),
    attributes: jsonb("attributes")
      .$type<EquipmentAttributes>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("equipment", t),
    index("equipment_tenant_status_idx").on(t.tenantId, t.status),
    index("equipment_vehicle_idx").on(t.tenantId, t.vehicleId),
    index("equipment_type_idx").on(t.tenantId, t.equipmentTypeId),
    uniqueIndex("equipment_tenant_inventory_uq")
      .on(t.tenantId, t.inventoryCode)
      .where(sql`${t.inventoryCode} is not null`),
    check(
      "equipment_one_place_ck",
      sql`not (${t.vehicleId} is not null and ${t.siteId} is not null)`,
    ),
    tenantFk("equipment_equipment_type_id_fk", t.tenantId, t.equipmentTypeId, equipmentTypes),
    tenantFk("equipment_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles),
    tenantFk("equipment_site_id_fk", t.tenantId, t.siteId, sites),
  ],
);

/** Storico degli spostamenti di un'attrezzatura: mezzo ↔ mezzo, mezzo ↔ sede, verso l'assistenza. */
export const equipmentMovements = fleetcareSchema.table(
  "equipment_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    equipmentId: uuid("equipment_id").notNull(),
    movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
    fromVehicleId: uuid("from_vehicle_id"),
    toVehicleId: uuid("to_vehicle_id"),
    fromSiteId: uuid("from_site_id"),
    toSiteId: uuid("to_site_id"),
    reason: text("reason"),
    movedById: uuid("moved_by_id"),
  },
  (t) => [
    index("equipment_movements_eq_idx").on(t.tenantId, t.equipmentId, t.movedAt),
    tenantFk(
      "equipment_movements_equipment_id_fk",
      t.tenantId,
      t.equipmentId,
      equipment,
      "cascade",
    ),
    tenantFk("equipment_movements_from_vehicle_id_fk", t.tenantId, t.fromVehicleId, vehicles),
    tenantFk("equipment_movements_to_vehicle_id_fk", t.tenantId, t.toVehicleId, vehicles),
    tenantFk("equipment_movements_from_site_id_fk", t.tenantId, t.fromSiteId, sites),
    tenantFk("equipment_movements_to_site_id_fk", t.tenantId, t.toSiteId, sites),
    tenantFk("equipment_movements_moved_by_id_fk", t.tenantId, t.movedById, profiles),
  ],
);
