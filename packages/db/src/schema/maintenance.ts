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
import { fleetcareSchema, tenantFk, tenantKey } from "./_schema";
import { accidents } from "./accidents";
import { profiles, suppliers, tenants } from "./core";
import { downtimeCause, maintenanceKind, maintenanceStatus } from "./enums";
import { equipment } from "./equipment";
import { vehicles } from "./vehicles";

/**
 * Interventi di manutenzione: tagliando, riparazione, gomme, carrozzeria,
 * revisione, lavori sull'allestimento, assistenza su un'attrezzatura.
 *
 * Sostituisce gli ordini di lavoro del gestionale TPL. Lì c'era
 * un'officina interna con meccanici, ore, fosse e magazzino ricambi; qui
 * il lavoro lo fa quasi sempre un fornitore esterno e l'unità reale è
 * **la fattura dell'officina**: un intervento = un mezzo (o
 * un'attrezzatura), un fornitore, quando è entrato e uscito, cosa è
 * stato fatto, quanto è costato. Niente righe di manodopera né ricambi:
 * se un giorno servirà il dettaglio, si aggiunge una tabella di righe
 * senza toccare questa.
 */
export const maintenanceJobs = fleetcareSchema.table(
  "maintenance_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** MAN-AAAA-NNNNN: lo assegna il database all'inserimento, il valore del client si ignora */
    number: text("number").notNull().default(""),
    /** il mezzo; può mancare solo per l'assistenza su un'attrezzatura spedita da sola */
    vehicleId: uuid("vehicle_id"),
    equipmentId: uuid("equipment_id"),
    /** null = fatto in casa dai volontari */
    supplierId: uuid("supplier_id"),
    kind: maintenanceKind("kind").notNull(),
    status: maintenanceStatus("status").notNull().default("planned"),
    title: text("title").notNull(), // "Tagliando 60.000 km"
    description: text("description"), // cosa si chiede
    workDone: text("work_done"), // cosa è stato fatto (dal rapportino/fattura)
    plannedOn: date("planned_on"),
    /** consegnato in officina / ritirato: la differenza è il fermo */
    droppedOffAt: timestamp("dropped_off_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    odometerKm: integer("odometer_km"),
    estimateEur: numeric("estimate_eur", { precision: 12, scale: 2 }),
    /**
     * Importi della fattura. Per un'associazione che non detrae l'IVA il
     * costo vero è il totale: per questo si tengono tutti e tre, e i
     * report di costo usano `total_amount_eur`.
     */
    netAmountEur: numeric("net_amount_eur", { precision: 12, scale: 2 }),
    vatAmountEur: numeric("vat_amount_eur", { precision: 12, scale: 2 }),
    totalAmountEur: numeric("total_amount_eur", { precision: 12, scale: 2 }),
    invoiceNumber: text("invoice_number"),
    invoiceDate: date("invoice_date"),
    /** in garanzia: non dovremmo pagarlo */
    warranty: boolean("warranty").notNull().default(false),
    /** riparazione conseguente a un sinistro */
    accidentId: uuid("accident_id"),
    createdById: uuid("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("maintenance_jobs", t),
    uniqueIndex("maintenance_jobs_tenant_number_uq").on(t.tenantId, t.number),
    index("maintenance_jobs_tenant_status_idx").on(t.tenantId, t.status),
    index("maintenance_jobs_vehicle_idx").on(t.tenantId, t.vehicleId, t.plannedOn),
    index("maintenance_jobs_supplier_idx").on(t.tenantId, t.supplierId),
    check(
      "maintenance_jobs_subject_ck",
      sql`${t.vehicleId} is not null or ${t.equipmentId} is not null`,
    ),
    check(
      "maintenance_jobs_dates_ck",
      sql`${t.returnedAt} is null or ${t.droppedOffAt} is null or ${t.returnedAt} >= ${t.droppedOffAt}`,
    ),
    tenantFk("maintenance_jobs_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles),
    tenantFk("maintenance_jobs_equipment_id_fk", t.tenantId, t.equipmentId, equipment),
    tenantFk("maintenance_jobs_supplier_id_fk", t.tenantId, t.supplierId, suppliers),
    tenantFk("maintenance_jobs_accident_id_fk", t.tenantId, t.accidentId, accidents),
    tenantFk("maintenance_jobs_created_by_id_fk", t.tenantId, t.createdById, profiles),
  ],
);

/**
 * Fermi del mezzo: da quando a quando non è stato disponibile, e perché.
 * È la base del dato che conta di più per un'associazione in convenzione
 * 118: quante ore l'ambulanza non c'era, e con cosa è stata sostituita.
 *
 * `vehicles.status` dice com'è il mezzo adesso; questa tabella è la storia.
 */
export const vehicleDowntimes = fleetcareSchema.table(
  "vehicle_downtimes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    cause: downtimeCause("cause").notNull(),
    maintenanceJobId: uuid("maintenance_job_id"),
    /** il mezzo che lo ha sostituito in turno, se c'è stato */
    replacementVehicleId: uuid("replacement_vehicle_id"),
    note: text("note"),
    createdById: uuid("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("downtimes_vehicle_idx").on(t.tenantId, t.vehicleId, t.startedAt),
    /* un mezzo ha al massimo un fermo aperto alla volta */
    uniqueIndex("downtimes_one_open_uq")
      .on(t.tenantId, t.vehicleId)
      .where(sql`${t.endedAt} is null`),
    check("downtimes_dates_ck", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
    check(
      "downtimes_replacement_ck",
      sql`${t.replacementVehicleId} is null or ${t.replacementVehicleId} <> ${t.vehicleId}`,
    ),
    tenantFk("vehicle_downtimes_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles),
    tenantFk(
      "vehicle_downtimes_maintenance_job_id_fk",
      t.tenantId,
      t.maintenanceJobId,
      maintenanceJobs,
    ),
    tenantFk(
      "vehicle_downtimes_replacement_vehicle_id_fk",
      t.tenantId,
      t.replacementVehicleId,
      vehicles,
    ),
    tenantFk("vehicle_downtimes_created_by_id_fk", t.tenantId, t.createdById, profiles),
  ],
);
