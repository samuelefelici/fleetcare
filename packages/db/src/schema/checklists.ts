import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fleetcareSchema, tenantFk, tenantKey } from "./_schema";
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
     * Numero di versione del modello, informativo: lo aggiorna l'app quando
     * cambia le voci, e la check-list compilata lo ricopia. Le check-list
     * vecchie restano leggibili comunque, perché le risposte puntano alla
     * voce e una voce usata non si riscrive (si disattiva).
     */
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("checklist_templates", t),
    uniqueIndex("checklist_templates_tenant_name_uq").on(t.tenantId, t.name),
  ],
);

export const checklistTemplateItems = fleetcareSchema.table(
  "checklist_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    templateId: uuid("template_id").notNull(),
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
    supplyItemId: uuid("supply_item_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    tenantKey("checklist_template_items", t),
    index("checklist_items_template_idx").on(t.tenantId, t.templateId, t.sortOrder),
    // nome esplicito: quello generato supera i 63 caratteri di Postgres
    tenantFk("checklist_items_equipment_type_fk", t.tenantId, t.equipmentTypeId, equipmentTypes),
    tenantFk(
      "checklist_template_items_template_id_fk",
      t.tenantId,
      t.templateId,
      checklistTemplates,
      "cascade",
    ),
    tenantFk("checklist_template_items_supply_item_id_fk", t.tenantId, t.supplyItemId, supplyItems),
  ],
);

/**
 * Una check-list compilata: è documentazione (chi ha controllato cosa,
 * quando, su quale mezzo).
 *
 * Due stati: **bozza** (`submitted_at` nullo), in cui chi la compila
 * aggiunge e corregge le risposte, e **inviata**, da cui in poi niente si
 * modifica (solo la direzione). Il database, non il client, decide le cose
 * che contano (migration 0001): la firma è il nome di chi la compila, le
 * anomalie in testata si calcolano dalle risposte all'invio, una voce
 * numerica fuori soglia è un'anomalia qualunque cosa dica l'app.
 */
export const checklists = fleetcareSchema.table(
  "checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id").notNull(),
    templateId: uuid("template_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
    /** "mattina", "pomeriggio", "notte": testo, i turni non sono materia del parco mezzi */
    shiftLabel: text("shift_label"),
    /** chi ha fatto il controllo */
    performedById: uuid("performed_by_id").notNull(),
    odometerKm: integer("odometer_km"),
    fuelLevelPct: integer("fuel_level_pct"),
    /** calcolati dal database all'invio */
    hasAnomalies: boolean("has_anomalies").notNull().default(false),
    hasSafetyAnomalies: boolean("has_safety_anomalies").notNull().default(false),
    /** il nome di chi l'ha compilata, scritto dal database (resta anche se l'anagrafica cambia) */
    signedName: text("signed_name").notNull().default(""),
    /** null = bozza; valorizzato = inviata, non più modificabile */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("checklists", t),
    index("checklists_vehicle_idx").on(t.tenantId, t.vehicleId, t.performedAt),
    check(
      "checklists_fuel_level_ck",
      sql`${t.fuelLevelPct} is null or ${t.fuelLevelPct} between 0 and 100`,
    ),
    tenantFk("checklists_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles),
    tenantFk("checklists_template_id_fk", t.tenantId, t.templateId, checklistTemplates),
    tenantFk("checklists_performed_by_id_fk", t.tenantId, t.performedById, profiles),
  ],
);

export const checklistAnswers = fleetcareSchema.table(
  "checklist_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    checklistId: uuid("checklist_id").notNull(),
    templateItemId: uuid("template_item_id").notNull(),
    outcome: checkOutcome("outcome").notNull(),
    valueNumeric: numeric("value_numeric", { precision: 10, scale: 2 }),
    valueText: text("value_text"),
    note: text("note"),
    /** l'anomalia ha generato questa segnalazione */
    faultReportId: uuid("fault_report_id"),
  },
  (t) => [
    uniqueIndex("checklist_answers_item_uq").on(t.checklistId, t.templateItemId),
    index("checklist_answers_checklist_idx").on(t.tenantId, t.checklistId),
    tenantFk(
      "checklist_answers_template_item_fk",
      t.tenantId,
      t.templateItemId,
      checklistTemplateItems,
    ),
    tenantFk("checklist_answers_checklist_id_fk", t.tenantId, t.checklistId, checklists, "cascade"),
    tenantFk("checklist_answers_fault_report_id_fk", t.tenantId, t.faultReportId, faultReports),
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
    vehicleId: uuid("vehicle_id").notNull(),
    kind: sanitizationKind("kind").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
    /** chi ha sanificato */
    performedById: uuid("performed_by_id").notNull(),
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
  (t) => [
    tenantKey("sanitizations", t),
    index("sanitizations_vehicle_idx").on(t.tenantId, t.vehicleId, t.performedAt),
    tenantFk("sanitizations_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles),
    tenantFk("sanitizations_performed_by_id_fk", t.tenantId, t.performedById, profiles),
  ],
);
