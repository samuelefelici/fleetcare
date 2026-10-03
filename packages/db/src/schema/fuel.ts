import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fleetcareSchema } from "./_schema";
import { crewMembers, profiles, suppliers, tenants } from "./core";
import { fuelInvoiceStatus, fuelMatchStatus, fuelProduct } from "./enums";
import { vehicles } from "./vehicles";

/*
 * RIFORNIMENTI: un distributore convenzionato, una fattura a fine mese.
 *
 * Ci sono due racconti dello stesso fatto e il valore sta nel confrontarli:
 *
 *   fuel_logs           cosa dichiara l'equipaggio alla pompa
 *                       (mezzo, km, litri, importo, chi)
 *   fuel_invoice_lines  cosa fattura il distributore a fine mese
 *                       (il riepilogo allegato alla fattura, riga per riga)
 *
 * L'abbinamento (`domain/fuel-reconciliation`) produce tre liste: righe
 * che tornano, rifornimenti fatturati ma mai registrati (da chiedere al
 * distributore o a chi era in turno), rifornimenti registrati ma non
 * fatturati. Solo una fattura con tutte le righe spiegate passa a
 * `reconciled` e poi al pagamento.
 */

/** Il rifornimento dichiarato dall'equipaggio. */
export const fuelLogs = fleetcareSchema.table(
  "fuel_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    /** il distributore; null solo per un rifornimento fuori convenzione (in trasferta) */
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    refueledAt: timestamp("refueled_at", { withTimezone: true }).notNull(),
    product: fuelProduct("product").notNull().default("diesel"),
    liters: numeric("liters", { precision: 8, scale: 2 }).notNull(),
    /** importo dello scontrino/buono, IVA inclusa; può mancare e arrivare dalla fattura */
    amountEur: numeric("amount_eur", { precision: 10, scale: 2 }),
    /** €/litro, calcolato dal database: mai scritto a mano, resta coerente */
    unitPriceEur: numeric("unit_price_eur", { precision: 8, scale: 4 }).generatedAlwaysAs(
      sql`case when liters > 0 and amount_eur is not null then round(amount_eur / liters, 4) end`,
    ),
    /**
     * Pieno fatto fino allo scatto. Il consumo (km/l) si calcola solo fra
     * due pieni: un rabbocco da 20 € non dice quanto ha bevuto il mezzo.
     */
    fullTank: boolean("full_tank").notNull().default(true),
    odometerKm: integer("odometer_km"),
    /** n. del buono / scontrino: la chiave più forte per l'abbinamento con la fattura */
    receiptNumber: text("receipt_number"),
    crewMemberId: uuid("crew_member_id").references(() => crewMembers.id),
    recordedById: uuid("recorded_by_id").references(() => profiles.id),
    /** 'app' (inserito dall'equipaggio) | 'invoice' (creato da una riga di fattura non registrata) */
    source: text("source").notNull().default("app"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fuel_logs_vehicle_idx").on(t.tenantId, t.vehicleId, t.refueledAt),
    index("fuel_logs_date_idx").on(t.tenantId, t.refueledAt),
    check("fuel_logs_liters_ck", sql`${t.liters} > 0`),
    check("fuel_logs_amount_ck", sql`${t.amountEur} is null or ${t.amountEur} >= 0`),
  ],
);

/** La fattura mensile del distributore (FatturaPA via SdI, o PDF). */
export const fuelInvoices = fleetcareSchema.table(
  "fuel_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    number: text("number").notNull(),
    issuedOn: date("issued_on").notNull(),
    /** il mese fatturato */
    periodFrom: date("period_from").notNull(),
    periodTo: date("period_to").notNull(),
    netAmountEur: numeric("net_amount_eur", { precision: 12, scale: 2 }),
    vatAmountEur: numeric("vat_amount_eur", { precision: 12, scale: 2 }),
    totalAmountEur: numeric("total_amount_eur", { precision: 12, scale: 2 }).notNull(),
    /**
     * Gli importi delle righe del riepilogo sono IVA inclusa? Lo scontrino
     * alla pompa lo è sempre: se le righe sono imponibili, l'abbinamento
     * deve riportarle al lordo prima di confrontarle.
     */
    linesIncludeVat: boolean("lines_include_vat").notNull().default(true),
    vatRatePct: numeric("vat_rate_pct", { precision: 5, scale: 2 }).notNull().default("22"),
    dueOn: date("due_on"),
    paidOn: date("paid_on"),
    status: fuelInvoiceStatus("status").notNull().default("received"),
    /** identificativo SdI della fattura elettronica, quando importata da XML */
    sdiId: text("sdi_id"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fuel_invoices_supplier_number_uq").on(t.tenantId, t.supplierId, t.number),
    index("fuel_invoices_tenant_status_idx").on(t.tenantId, t.status),
    check("fuel_invoices_period_ck", sql`${t.periodTo} >= ${t.periodFrom}`),
  ],
);

/**
 * Le righe del riepilogo rifornimenti allegato alla fattura, come le
 * scrive il distributore. La targa si tiene com'è (`plate_raw`) accanto
 * al mezzo riconosciuto: se il riconoscimento sbaglia, il dato d'origine
 * c'è ancora.
 */
export const fuelInvoiceLines = fleetcareSchema.table(
  "fuel_invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => fuelInvoices.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    refueledOn: date("refueled_on").notNull(),
    refueledTime: time("refueled_time"),
    plateRaw: text("plate_raw"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    product: fuelProduct("product").notNull().default("diesel"),
    liters: numeric("liters", { precision: 8, scale: 2 }),
    unitPriceEur: numeric("unit_price_eur", { precision: 8, scale: 4 }),
    amountEur: numeric("amount_eur", { precision: 10, scale: 2 }).notNull(),
    receiptNumber: text("receipt_number"),
    /** il rifornimento registrato a cui corrisponde: al massimo una riga per rifornimento */
    fuelLogId: uuid("fuel_log_id").references(() => fuelLogs.id),
    matchStatus: fuelMatchStatus("match_status").notNull().default("unmatched"),
    /** perché non torna, o come è stata spiegata a mano */
    matchNote: text("match_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fuel_invoice_lines_no_uq").on(t.invoiceId, t.lineNo),
    uniqueIndex("fuel_invoice_lines_log_uq")
      .on(t.fuelLogId)
      .where(sql`${t.fuelLogId} is not null`),
    index("fuel_invoice_lines_vehicle_idx").on(t.tenantId, t.vehicleId, t.refueledOn),
  ],
);
