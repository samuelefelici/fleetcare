import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fleetcareSchema } from "./_schema";
import { profiles, tenants } from "./core";
import { checkOutcome, checklistItemKind, sanitizationKind, vehicleCategory } from "./enums";
import { equipmentTypes } from "./equipment";
import { faultReports } from "./faults";
import { supplyItems } from "./supplies";
import { vehicles } from "./vehicles";

/**
 * Modelli di check-list «controllo mezzo» a inizio turno, per categoria
 * di mezzo: l'ambulanza controlla ossigeno, DAE e aspiratore, il pulmino
 * il sollevatore e gli ancoraggi delle carrozzine.
 */
export const checklistTemplates = fleetcareSchema.table(
  "checklist_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    vehicleCategories: vehicleCategory("vehicle_categories")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /**
     * Si incrementa quando cambiano le voci: una check-list compilata resta
     * leggibile con le voci di allora, perché le risposte puntano alla voce
     * e le voci non si cancellano, si disattivano.
     */
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("checklist_templates_tenant_name_uq").on(t.tenantId, t.name)],
);

export const checklistTemplateItems = fleetcareSchema.table(
  "checklist_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => checklistTemplates.id, { onDelete: "cascade" }),
    section: text("section").notNull(), // "Esterno", "Vano sanitario", "Ossigeno"…
    label: text("label").notNull(),
    kind: checklistItemKind("kind").notNull().default("check"),
    /** per le voci numeriche: unità e soglie (pressione O2 sotto 50 bar = anomalia) */
    unit: text("unit"),
    minValue: numeric("min_value", { precision: 10, scale: 2 }),
    maxValue: numeric("max_value", { precision: 10, scale: 2 }),
    /** un'anomalia qui blocca il mezzo finché il responsabile non verifica */
    safetyCritical: boolean("safety_critical").notNull().default(false),
    /** la voce controlla un'attrezzatura o un articolo della dotazione */
    equipmentTypeId: uuid("equipment_type_id"),
    supplyItemId: uuid("supply_item_id").references(() => supplyItems.id),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    index("checklist_items_template_idx").on(t.tenantId, t.templateId, t.sortOrder),
    // nome esplicito: quello generato supera i 63 caratteri di Postgres
    foreignKey({
      name: "checklist_items_equipment_type_fk",
      columns: [t.equipmentTypeId],
      foreignColumns: [equipmentTypes.id],
    }),
  ],
);

/**
 * Una check-list compilata: è documentazione (chi ha controllato cosa,
 * quando, su quale mezzo), quindi non si modifica dopo l'invio.
 */
export const checklists = fleetcareSchema.table(
  "checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => checklistTemplates.id),
    templateVersion: integer("template_version").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
    /** "mattina", "pomeriggio", "notte": testo, i turni non sono materia del parco mezzi */
    shiftLabel: text("shift_label"),
    /** chi ha fatto il controllo */
    performedById: uuid("performed_by_id")
      .notNull()
      .references(() => profiles.id),
    odometerKm: integer("odometer_km"),
    fuelLevelPct: integer("fuel_level_pct"),
    hasAnomalies: boolean("has_anomalies").notNull().default(false),
    hasSafetyAnomalies: boolean("has_safety_anomalies").notNull().default(false),
    /** nome di chi firma, come scritto al momento (resta anche se l'anagrafica cambia) */
    signedName: text("signed_name").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("checklists_vehicle_idx").on(t.tenantId, t.vehicleId, t.performedAt),
    check(
      "checklists_fuel_level_ck",
      sql`${t.fuelLevelPct} is null or ${t.fuelLevelPct} between 0 and 100`,
    ),
  ],
);

export const checklistAnswers = fleetcareSchema.table(
  "checklist_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    templateItemId: uuid("template_item_id").notNull(),
    outcome: checkOutcome("outcome").notNull(),
    valueNumeric: numeric("value_numeric", { precision: 10, scale: 2 }),
    valueText: text("value_text"),
    note: text("note"),
    /** l'anomalia ha generato questa segnalazione */
    faultReportId: uuid("fault_report_id").references(() => faultReports.id),
  },
  (t) => [
    uniqueIndex("checklist_answers_item_uq").on(t.checklistId, t.templateItemId),
    index("checklist_answers_checklist_idx").on(t.tenantId, t.checklistId),
    foreignKey({
      name: "checklist_answers_template_item_fk",
      columns: [t.templateItemId],
      foreignColumns: [checklistTemplateItems.id],
    }),
  ],
);

/**
 * Registro delle sanificazioni del vano sanitario. È documentazione che
 * l'associazione deve poter esibire: chi, quando, come, con che prodotto.
 *
 * Per la sanificazione dopo un paziente infettivo si registra solo il
 * fatto: nessun dato del paziente né della patologia.
 */
export const sanitizations = fleetcareSchema.table(
  "sanitizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    kind: sanitizationKind("kind").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
    /** chi ha sanificato */
    performedById: uuid("performed_by_id")
      .notNull()
      .references(() => profiles.id),
    /** prodotto e lotto del disinfettante */
    product: text("product"),
    productLot: text("product_lot"),
    /** manuale, nebulizzazione, ozono, perossido di idrogeno… */
    method: text("method"),
    /** quanto il mezzo è rimasto fermo (l'ozono richiede tempi di aerazione) */
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sanitizations_vehicle_idx").on(t.tenantId, t.vehicleId, t.performedAt)],
);
