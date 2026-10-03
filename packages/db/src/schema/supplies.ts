import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fleetcareSchema, tenantFk, tenantKey } from "./_schema";
import { sites, tenants } from "./core";
import { vehicleCategory } from "./enums";
import { equipmentTypes } from "./equipment";
import { vehicles } from "./vehicles";

/**
 * Materiale di consumo: garze, soluzione fisiologica, cannule, maschere O2,
 * guanti, coperte isotermiche. A differenza delle attrezzature non ha
 * matricola: conta quanto ce n'è e **quando scade il lotto**.
 */
export const supplyItems = fleetcareSchema.table(
  "supply_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull().default("pz"),
    /** medicazione, vie aeree, immobilizzazione, protezione, igiene… */
    category: text("category"),
    tracksExpiry: boolean("tracks_expiry").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("supply_items", t),
    uniqueIndex("supply_items_tenant_code_uq").on(t.tenantId, t.code),
  ],
);

/**
 * Quanto c'è di un articolo, di quale lotto, dove (a bordo di un mezzo o
 * in sede) e quando scade. Giacenza **a conteggio**: si aggiorna al
 * reintegro e al controllo, non a ogni servizio. Per una ventina di mezzi
 * basta e non chiede ai volontari di scaricare ogni garza; se servirà il
 * consumo per servizio si aggiunge una tabella di movimenti.
 */
export const supplyLots = fleetcareSchema.table(
  "supply_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    supplyItemId: uuid("supply_item_id").notNull(),
    vehicleId: uuid("vehicle_id"),
    siteId: uuid("site_id"),
    lotNumber: text("lot_number"),
    expiresOn: date("expires_on"),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    /** ultimo conteggio fisico */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("supply_lots_expiry_idx").on(t.tenantId, t.expiresOn),
    index("supply_lots_vehicle_idx").on(t.tenantId, t.vehicleId),
    check("supply_lots_place_ck", sql`(${t.vehicleId} is not null) <> (${t.siteId} is not null)`),
    check("supply_lots_qty_ck", sql`${t.quantity} >= 0`),
    tenantFk("supply_lots_supply_item_id_fk", t.tenantId, t.supplyItemId, supplyItems),
    tenantFk("supply_lots_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles, "cascade"),
    tenantFk("supply_lots_site_id_fk", t.tenantId, t.siteId, sites),
  ],
);

/**
 * Dotazione minima per categoria di mezzo: «un'ambulanza di soccorso deve
 * avere a bordo 1 DAE, 1 aspiratore, 2 bombole O2…». Ogni requisito è un
 * tipo di attrezzatura OPPURE un articolo di consumo.
 *
 * Serve a due domande: cosa manca a bordo di un mezzo (confronto con
 * `equipment` e `supply_lots`) e quali voci deve avere la check-list.
 */
export const kitRequirements = fleetcareSchema.table(
  "kit_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleCategory: vehicleCategory("vehicle_category").notNull(),
    equipmentTypeId: uuid("equipment_type_id"),
    supplyItemId: uuid("supply_item_id"),
    minQuantity: numeric("min_quantity", { precision: 10, scale: 2 }).notNull().default("1"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("kit_requirements_equipment_uq")
      .on(t.tenantId, t.vehicleCategory, t.equipmentTypeId)
      .where(sql`${t.equipmentTypeId} is not null`),
    uniqueIndex("kit_requirements_supply_uq")
      .on(t.tenantId, t.vehicleCategory, t.supplyItemId)
      .where(sql`${t.supplyItemId} is not null`),
    check(
      "kit_requirements_target_ck",
      sql`(${t.equipmentTypeId} is not null) <> (${t.supplyItemId} is not null)`,
    ),
    tenantFk(
      "kit_requirements_equipment_type_id_fk",
      t.tenantId,
      t.equipmentTypeId,
      equipmentTypes,
      "cascade",
    ),
    tenantFk(
      "kit_requirements_supply_item_id_fk",
      t.tenantId,
      t.supplyItemId,
      supplyItems,
      "cascade",
    ),
  ],
);
