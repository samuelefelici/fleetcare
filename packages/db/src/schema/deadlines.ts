import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fleetcareSchema } from "./_schema";
import { profiles, suppliers, tenants } from "./core";
import { completionOutcome, deadlineSubject, vehicleCategory } from "./enums";
import { equipment, equipmentTypes } from "./equipment";
import { maintenanceJobs } from "./maintenance";
import { vehicles } from "./vehicles";

/*
 * UN SOLO MOTORE DI SCADENZE, per mezzi e attrezzature.
 *
 * Revisione, RCA, bollo, tagliando, autorizzazione sanitaria del mezzo;
 * verifica elettrica e manutenzione del DAE, scadenza degli elettrodi,
 * collaudo della bombola, controllo semestrale dell'estintore: sono tutte
 * la stessa cosa — una data (e/o un chilometraggio) entro cui fare
 * qualcosa, un preavviso, e il fatto che superarla blocchi o no.
 * Tenerle insieme dà una sola domanda per il semaforo di flotta: «cosa
 * scade nei prossimi 30 giorni, ovunque».
 *
 *   deadline_types        il catalogo (cosa è una «revisione»)
 *   deadline_rules        a chi si applica e ogni quanto (revisione: 12 mesi
 *                         per le ambulanze, 24 per l'automedica)
 *   deadlines             la scadenza corrente di UN mezzo o UNA attrezzatura
 *   deadline_completions  lo storico: ogni volta che è stata fatta, da chi,
 *                         con che esito, quanto è costata, il certificato
 */

/** Catalogo dei tipi di scadenza, per tenant, precaricato dal seed con le norme italiane. */
export const deadlineTypes = fleetcareSchema.table(
  "deadline_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(), // "revisione", "rca", "verifica_elettrica"…
    label: text("label").notNull(),
    subject: deadlineSubject("subject").notNull(),
    description: text("description"),
    /** riferimento normativo o fonte della periodicità (CdS art. 80, UNI 9994-1, manuale del fabbricante…) */
    reference: text("reference"),
    /*
     * Periodicità di default: mesi OPPURE giorni (non entrambi), e/o km.
     * Tutti nulli = scadenza non periodica: la data si legge dal documento
     * (elettrodi del DAE, fine vita dichiarata, autorizzazione regionale).
     */
    intervalMonths: integer("interval_months"),
    intervalDays: integer("interval_days"),
    intervalKm: integer("interval_km"),
    /**
     * La scadenza cade l'ultimo giorno del mese. È il caso della
     * revisione: si fa «entro il mese» dell'anniversario, non entro il
     * giorno.
     */
    monthEnd: boolean("month_end").notNull().default(false),
    alertDays: integer("alert_days").notNull().default(30),
    alertKm: integer("alert_km"),
    /** superata, il mezzo/attrezzatura non è utilizzabile (revisione, RCA, elettrodi scaduti…) */
    blocking: boolean("blocking").notNull().default(false),
    /** per chiuderla serve allegare un documento (certificato, ricevuta) */
    documentRequired: boolean("document_required").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deadline_types_tenant_code_uq").on(t.tenantId, t.code),
    check(
      "deadline_types_interval_ck",
      sql`not (${t.intervalMonths} is not null and ${t.intervalDays} is not null)`,
    ),
  ],
);

/**
 * Quali scadenze nascono, e con quale periodicità, quando si crea un
 * mezzo di una categoria o un'attrezzatura di un tipo.
 *
 * È qui che la stessa «revisione» vale 12 mesi per un'ambulanza (art. 80
 * CdS) e 24 per un'automedica immatricolata come autovettura. Una regola
 * riguarda una categoria di mezzi OPPURE un tipo di attrezzatura, mai
 * entrambi; i campi nulli ereditano dal tipo di scadenza.
 */
export const deadlineRules = fleetcareSchema.table(
  "deadline_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    deadlineTypeId: uuid("deadline_type_id")
      .notNull()
      .references(() => deadlineTypes.id, { onDelete: "cascade" }),
    vehicleCategory: vehicleCategory("vehicle_category"),
    equipmentTypeId: uuid("equipment_type_id").references(() => equipmentTypes.id, {
      onDelete: "cascade",
    }),
    intervalMonths: integer("interval_months"),
    intervalDays: integer("interval_days"),
    intervalKm: integer("interval_km"),
    alertDays: integer("alert_days"),
    blocking: boolean("blocking"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deadline_rules_vehicle_uq")
      .on(t.tenantId, t.deadlineTypeId, t.vehicleCategory)
      .where(sql`${t.vehicleCategory} is not null`),
    uniqueIndex("deadline_rules_equipment_uq")
      .on(t.tenantId, t.deadlineTypeId, t.equipmentTypeId)
      .where(sql`${t.equipmentTypeId} is not null`),
    check(
      "deadline_rules_target_ck",
      sql`(${t.vehicleCategory} is not null) <> (${t.equipmentTypeId} is not null)`,
    ),
    check(
      "deadline_rules_interval_ck",
      sql`not (${t.intervalMonths} is not null and ${t.intervalDays} is not null)`,
    ),
  ],
);

/**
 * La scadenza corrente di un mezzo o di un'attrezzatura (esattamente uno
 * dei due). Nasce dalla regola con periodicità, preavviso e blocco
 * copiati: da quel momento è sua, e si può correggere riga per riga
 * (il tagliando di quel Ducato è a 40.000 km, non a 30.000).
 *
 * `due_on` e `due_km` entrambi nulli è uno stato legittimo e voluto: la
 * scadenza esiste ma la data non è ancora stata inserita. Il semaforo la
 * mostra come «da completare», non come «in regola».
 */
export const deadlines = fleetcareSchema.table(
  "deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    deadlineTypeId: uuid("deadline_type_id")
      .notNull()
      .references(() => deadlineTypes.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "cascade" }),
    /** distingue due scadenze dello stesso tipo sullo stesso soggetto; '' quando non serve */
    label: text("label").notNull().default(""),
    intervalMonths: integer("interval_months"),
    intervalDays: integer("interval_days"),
    intervalKm: integer("interval_km"),
    dueOn: date("due_on"),
    dueKm: integer("due_km"),
    alertDays: integer("alert_days").notNull(),
    alertKm: integer("alert_km"),
    blocking: boolean("blocking").notNull(),
    /** ultimo adempimento (copia dell'ultima `deadline_completions`, per leggere senza join) */
    lastDoneOn: date("last_done_on"),
    lastDoneKm: integer("last_done_km"),
    /** false quando non si applica più (attrezzatura dismessa, bombola restituita al fornitore) */
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deadlines_tenant_due_idx").on(t.tenantId, t.dueOn),
    index("deadlines_vehicle_idx").on(t.tenantId, t.vehicleId),
    index("deadlines_equipment_idx").on(t.tenantId, t.equipmentId),
    uniqueIndex("deadlines_vehicle_uq")
      .on(t.tenantId, t.deadlineTypeId, t.vehicleId, t.label)
      .where(sql`${t.vehicleId} is not null`),
    uniqueIndex("deadlines_equipment_uq")
      .on(t.tenantId, t.deadlineTypeId, t.equipmentId, t.label)
      .where(sql`${t.equipmentId} is not null`),
    check(
      "deadlines_subject_ck",
      sql`(${t.vehicleId} is not null) <> (${t.equipmentId} is not null)`,
    ),
    check(
      "deadlines_interval_ck",
      sql`not (${t.intervalMonths} is not null and ${t.intervalDays} is not null)`,
    ),
  ],
);

/**
 * Ogni volta che una scadenza è stata adempiuta: revisione passata,
 * polizza rinnovata, bollo pagato, verifica elettrica fatta, elettrodi
 * sostituiti. È anche dove sta il **costo** degli adempimenti (premio
 * RCA, costo della revisione, della verifica): il TCO del mezzo lo legge
 * da qui e dagli interventi.
 *
 * Registrare un adempimento con esito positivo sposta in avanti la
 * scadenza: `next_due_on`/`next_due_km` (calcolati da `domain/deadlines`
 * o letti dal documento) vengono copiati su `deadlines.due_on`/`due_km`.
 */
export const deadlineCompletions = fleetcareSchema.table(
  "deadline_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    deadlineId: uuid("deadline_id")
      .notNull()
      .references(() => deadlines.id, { onDelete: "cascade" }),
    doneOn: date("done_on").notNull(),
    doneKm: integer("done_km"),
    outcome: completionOutcome("outcome").notNull().default("passed"),
    nextDueOn: date("next_due_on"),
    nextDueKm: integer("next_due_km"),
    /** chi l'ha fatta: centro revisioni, assistenza tecnica, compagnia */
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    /** n. certificato / n. polizza / n. ricevuta */
    documentNumber: text("document_number"),
    costEur: numeric("cost_eur", { precision: 12, scale: 2 }),
    maintenanceJobId: uuid("maintenance_job_id").references(() => maintenanceJobs.id),
    notes: text("notes"),
    recordedById: uuid("recorded_by_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deadline_completions_deadline_idx").on(t.tenantId, t.deadlineId, t.doneOn)],
);
