import { boolean, index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { fleetcareSchema, tenantFk, tenantKey } from "./_schema";
import { profiles, tenants } from "./core";
import { faultArea, faultSeverity, faultStatus } from "./enums";
import { equipment } from "./equipment";
import { maintenanceJobs } from "./maintenance";
import { vehicles } from "./vehicles";

/**
 * Segnalazioni di guasto: dall'equipaggio, a fine servizio o dalla
 * check-list. Stesso principio del gestionale TPL (segnalare costa meno
 * di un minuto, nessun campo obbligatorio oltre mezzo + descrizione +
 * gravità), ma senza la tassonomia VMRS a tre livelli: per una ventina di
 * mezzi un'area (`fault_area`) e, se è un'attrezzatura, quale, bastano a
 * smistare e a fare statistica.
 */
export const faultReports = fleetcareSchema.table(
  "fault_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    number: text("number").notNull(), // SGN-YYYY-NNNNN
    vehicleId: uuid("vehicle_id").notNull(),
    /** se il guasto è di un'attrezzatura: quale (l'aspiratore non aspira, il DAE non supera l'autotest) */
    equipmentId: uuid("equipment_id"),
    area: faultArea("area").notNull().default("other"),
    description: text("description").notNull(),
    severity: faultSeverity("severity").notNull(),
    status: faultStatus("status").notNull().default("open"),
    /** «il mezzo non è sicuro»: avviso immediato al responsabile, il mezzo va verificato prima di uscire */
    unsafe: boolean("unsafe").notNull().default(false),
    /** chi ha segnalato, dall'app sul proprio dispositivo (mai a nome di un altro) */
    reportedById: uuid("reported_by_id").notNull(),
    odometerKm: integer("odometer_km"),
    maintenanceJobId: uuid("maintenance_job_id"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    rejectedReason: text("rejected_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("fault_reports", t),
    uniqueIndex("fault_reports_tenant_number_uq").on(t.tenantId, t.number),
    index("fault_reports_tenant_status_idx").on(t.tenantId, t.status),
    index("fault_reports_vehicle_idx").on(t.tenantId, t.vehicleId, t.status),
    index("fault_reports_created_idx").on(t.tenantId, t.createdAt),
    tenantFk("fault_reports_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles),
    tenantFk("fault_reports_equipment_id_fk", t.tenantId, t.equipmentId, equipment),
    tenantFk("fault_reports_reported_by_id_fk", t.tenantId, t.reportedById, profiles),
    tenantFk(
      "fault_reports_maintenance_job_id_fk",
      t.tenantId,
      t.maintenanceJobId,
      maintenanceJobs,
    ),
  ],
);

/**
 * Il filo di messaggi di una segnalazione: il responsabile chiede «mi
 * mandi una foto della spia?», il volontario risponde dall'app. È ciò che
 * fa tornare a segnalare: chi segnala e non sente più niente smette.
 *
 * `internal` = nota fra responsabili, che l'equipaggio non vede (RLS).
 */
export const faultReportComments = fleetcareSchema.table(
  "fault_report_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    faultReportId: uuid("fault_report_id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fault_report_comments_report_idx").on(t.tenantId, t.faultReportId, t.createdAt),
    tenantFk(
      "fault_report_comments_fault_report_id_fk",
      t.tenantId,
      t.faultReportId,
      faultReports,
      "cascade",
    ),
    tenantFk("fault_report_comments_author_id_fk", t.tenantId, t.authorId, profiles),
  ],
);
