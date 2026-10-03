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
import { crewMembers, profiles, sites, tenants } from "./core";
import {
  en1789Type,
  fuelType,
  odometerSource,
  ownershipKind,
  vehicleCategory,
  vehicleStatus,
} from "./enums";

/**
 * Anagrafica mezzi.
 *
 * Una tabella sola, non `vehicles` + `vehicle_fleet_profiles` come nel
 * gestionale TPL: lì la separazione serviva perché altri moduli Cerbero
 * leggevano i mezzi senza dipendere dallo schema dell'officina. Qui non
 * c'è un secondo modulo, e con una ventina di mezzi una riga larga e
 * leggibile vale più di un join.
 *
 * Un mezzo sanitario sono due cose: il **veicolo base** (Fiat Ducato,
 * VW Transporter…) e l'**allestimento** fatto da un allestitore, che ha
 * una sua omologazione. I campi sono raggruppati così.
 */
export const vehicles = fleetcareSchema.table(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => sites.id),

    // --- identificazione ---
    /** numero interno dell'associazione, quello scritto sulla fiancata */
    internalCode: text("internal_code").notNull(),
    /** sigla radio / nominativo con cui la centrale 118 chiama il mezzo */
    callSign: text("call_sign"),
    plate: text("plate").notNull(),
    vin: text("vin"), // telaio
    category: vehicleCategory("category").notNull(),
    status: vehicleStatus("status").notNull().default("operational"),
    /** perché non è operativo: si mostra in testata accanto allo stato */
    statusReason: text("status_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),

    // --- veicolo base ---
    make: text("make"), // Fiat, Volkswagen, Mercedes-Benz…
    model: text("model"), // Ducato, Transporter, Sprinter…
    version: text("version"),
    fuelType: fuelType("fuel_type").notNull().default("diesel"),
    euroClass: text("euro_class"),
    powerKw: integer("power_kw"),
    /**
     * Massa complessiva a pieno carico. Oltre 3.500 kg cambia la patente
     * richiesta (C1) e la periodicità della revisione: è il dato da cui
     * dipendono due regole, non un dettaglio tecnico.
     */
    grossWeightKg: integer("gross_weight_kg"),
    seats: integer("seats"), // posti omologati, conducente compreso
    stretcherPositions: integer("stretcher_positions"), // posti barella
    wheelchairPositions: integer("wheelchair_positions"), // posti carrozzina
    tankLiters: integer("tank_liters"),
    tyreSize: text("tyre_size"), // es. "225/75 R16C"

    // --- allestimento sanitario ---
    outfitter: text("outfitter"), // allestitore
    outfittingDate: date("outfitting_date"),
    /** n. di omologazione / collaudo dell'allestimento */
    outfittingApproval: text("outfitting_approval"),
    en1789Type: en1789Type("en1789_type"),
    /** pedana o sollevatore per carrozzine (il dispositivo vero è un'attrezzatura, con le sue scadenze) */
    hasLift: boolean("has_lift").notNull().default(false),
    /** dispositivi supplementari di segnalazione visiva e acustica (art. 177 CdS) */
    hasPriorityLights: boolean("has_priority_lights").notNull().default(false),

    // --- immatricolazione ---
    registrationDate: date("registration_date"), // prima immatricolazione
    /** n. della carta di circolazione / documento unico */
    registrationDocNumber: text("registration_doc_number"),

    // --- proprietà e provenienza ---
    ownership: ownershipKind("ownership").notNull().default("owned"),
    /** intestatario quando non è l'associazione (es. il Comune, per un comodato) */
    ownerName: text("owner_name"),
    purchaseDate: date("purchase_date"),
    purchaseValueEur: numeric("purchase_value_eur", { precision: 12, scale: 2 }),
    /**
     * Con che soldi è stato comprato: fondi propri, 5×1000, donazione,
     * bando regionale, fondazione. Chi finanzia di solito chiede di
     * rendicontare; senza questo campo la domanda «cosa abbiamo comprato
     * col 5×1000» non ha risposta.
     */
    fundingSource: text("funding_source"),
    /** donatore / dedica (la targa commemorativa sul mezzo) */
    donorName: text("donor_name"),
    usefulLifeYears: integer("useful_life_years"),
    /**
     * Esente dalla tassa automobilistica: frequente per ambulanze e mezzi
     * per disabili di un ente del Terzo Settore. Se è vero, la scadenza
     * «bollo» non nasce.
     */
    bolloExempt: boolean("bollo_exempt").notNull().default(false),

    // --- esercizio ---
    /** ultimo valore noto, aggiornato dal trigger su `odometer_readings` */
    odometerKm: integer("odometer_km").notNull().default(0),
    odometerUpdatedAt: timestamp("odometer_updated_at", { withTimezone: true }),
    /**
     * Come il distributore riconosce il mezzo, se non dalla targa
     * (tessera, codice cliente per mezzo). Serve all'abbinamento delle
     * righe di fattura con i rifornimenti.
     */
    fuelCardCode: text("fuel_card_code"),

    // --- fine vita ---
    decommissionedOn: date("decommissioned_on"),
    decommissionReason: text("decommission_reason"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vehicles_tenant_internal_code_uq").on(t.tenantId, t.internalCode),
    uniqueIndex("vehicles_tenant_plate_uq").on(t.tenantId, t.plate),
    index("vehicles_tenant_status_idx").on(t.tenantId, t.status),
    check("vehicles_odometer_ck", sql`${t.odometerKm} >= 0`),
  ],
);

/**
 * Letture del contachilometri, da qualunque fonte (check-list, rifornimento,
 * officina, a mano). Il trigger della migration 0001 rifiuta una lettura
 * più bassa della precedente e aggiorna `vehicles.odometer_km`: i km sono
 * la base di tagliandi e consumi, e un km sbagliato li sbaglia tutti.
 */
export const odometerReadings = fleetcareSchema.table(
  "odometer_readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    km: integer("km").notNull(),
    source: odometerSource("source").notNull().default("manual"),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    crewMemberId: uuid("crew_member_id").references(() => crewMembers.id),
    createdById: uuid("created_by_id").references(() => profiles.id),
  },
  (t) => [
    index("odometer_vehicle_idx").on(t.tenantId, t.vehicleId, t.readAt),
    check("odometer_km_ck", sql`${t.km} >= 0`),
  ],
);
