import { boolean, index, numeric, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { fleetcareSchema } from "./_schema";
import { profiles, suppliers, tenants } from "./core";
import { accidentFault, accidentStatus } from "./enums";
import { vehicles } from "./vehicles";

/**
 * Sinistri stradali. Rispetto al gestionale TPL resta il nucleo della
 * pratica (fatto, colpa, controparte, assicurazione, denaro) e si
 * aggiunge `during_emergency`: un sinistro in emergenza con i dispositivi
 * accesi ha un'altra lettura, per la responsabilità e per l'assicurazione.
 *
 * Nessun dato di pazienti, feriti o testimoni: solo i sì/no che servono.
 */
export const accidents = fleetcareSchema.table(
  "accidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    number: text("number").notNull(), // SIN-YYYY-NNNNN
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    location: text("location"),
    description: text("description").notNull(),
    /** chi guidava */
    driverId: uuid("driver_id").references(() => profiles.id),
    /** in servizio di emergenza con dispositivi supplementari attivi (art. 177 CdS) */
    duringEmergency: boolean("during_emergency").notNull().default(false),
    fault: accidentFault("fault").notNull().default("unknown"),
    counterpartPlate: text("counterpart_plate"),
    counterpartInsurer: text("counterpart_insurer"),
    /** constatazione amichevole (CAI) firmata */
    cidSigned: boolean("cid_signed").notNull().default(false),
    /** intervento delle forze dell'ordine / verbale */
    policeReport: boolean("police_report").notNull().default(false),
    injuries: boolean("injuries").notNull().default(false),
    /** la nostra compagnia */
    insurerId: uuid("insurer_id").references(() => suppliers.id),
    claimNumber: text("claim_number"),
    estimatedDamageEur: numeric("estimated_damage_eur", { precision: 12, scale: 2 }),
    settledAmountEur: numeric("settled_amount_eur", { precision: 12, scale: 2 }),
    deductibleEur: numeric("deductible_eur", { precision: 12, scale: 2 }),
    status: accidentStatus("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accidents_tenant_number_uq").on(t.tenantId, t.number),
    index("accidents_tenant_status_idx").on(t.tenantId, t.status, t.occurredAt),
    index("accidents_vehicle_idx").on(t.tenantId, t.vehicleId, t.occurredAt),
  ],
);
