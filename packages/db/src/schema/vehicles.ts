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
import { profiles, sites, tenants } from "./core";
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
    siteId: uuid("site_id"),

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
     * Massa complessiva a pieno carico. Oltre 3.500 kg servono la patente
     * C1 e la revisione annuale (art. 80 CdS), come oltre i 9 posti. Le
     * regole del catalogo non lo leggono: per i pulmini e i mezzi di
     * protezione civile la revisione nasce annuale (il lato sicuro) e il
     * responsabile la porta a 24 mesi sui mezzi che lo consentono.
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
    /** km all'ingresso in flotta: la base delle letture quando non ce n'è nessuna */
    initialOdometerKm: integer("initial_odometer_km").notNull().default(0),
    /**
     * Il giorno a cui si riferiscono i km d'ingresso. Se è noto, la prima
     * lettura si controlla anche per i salti impossibili (una cifra di
     * troppo); se manca (mezzo caricato senza sapere quando) no.
     */
    initialOdometerOn: date("initial_odometer_on"),
    /**
     * Km attuali: **derivati**, li scrive solo il trigger su
     * `odometer_readings` (l'ultima lettura, o i km iniziali). Una scrittura
     * diretta viene rifiutata: il km si cambia inserendo una lettura.
     */
    odometerKm: integer("odometer_km").notNull().default(0),
    odometerUpdatedAt: timestamp("odometer_updated_at", { withTimezone: true }),
    /**
     * La **matricola** con cui il distributore identifica il mezzo nel
     * riepilogo della fattura, quando è diversa dal numero interno. Se il
     * distributore usa il numero interno, resta vuota: l'abbinamento prova
     * prima questa, poi il numero interno, poi la targa.
     */
    fuelVehicleCode: text("fuel_vehicle_code"),

    // --- fine vita ---
    decommissionedOn: date("decommissioned_on"),
    decommissionReason: text("decommission_reason"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("vehicles", t),
    /* unicità sui valori normalizzati, gli stessi che usa il riconoscimento
       della matricola (`normalizeVehicleCode` / `normalizePlate`): «05» e
       «5», «FX 123 AB» e «FX123AB» sono lo stesso mezzo */
    uniqueIndex("vehicles_tenant_internal_code_uq").on(
      t.tenantId,
      sql`regexp_replace(regexp_replace(upper(${t.internalCode}), '[^A-Z0-9]', '', 'g'), '^0+([0-9]+)$', '\\1')`,
    ),
    uniqueIndex("vehicles_tenant_plate_uq").on(
      t.tenantId,
      sql`regexp_replace(upper(${t.plate}), '[^A-Z0-9]', '', 'g')`,
    ),
    uniqueIndex("vehicles_tenant_fuel_code_uq")
      .on(
        t.tenantId,
        sql`regexp_replace(regexp_replace(upper(${t.fuelVehicleCode}), '[^A-Z0-9]', '', 'g'), '^0+([0-9]+)$', '\\1')`,
      )
      .where(sql`${t.fuelVehicleCode} is not null`),
    index("vehicles_tenant_status_idx").on(t.tenantId, t.status),
    check("vehicles_odometer_ck", sql`${t.odometerKm} >= 0 and ${t.initialOdometerKm} >= 0`),
    /* un codice vuoto (o di soli spazi e trattini) non è un codice: nasconderebbe
       il numero interno al riconoscimento e occuperebbe l'indice unico */
    check(
      "vehicles_codes_ck",
      sql`regexp_replace(upper(${t.internalCode}), '[^A-Z0-9]', '', 'g') <> ''
          and regexp_replace(upper(${t.plate}), '[^A-Z0-9]', '', 'g') <> ''
          and (${t.fuelVehicleCode} is null
               or regexp_replace(upper(${t.fuelVehicleCode}), '[^A-Z0-9]', '', 'g') <> '')`,
    ),
    tenantFk("vehicles_site_id_fk", t.tenantId, t.siteId, sites),
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
    vehicleId: uuid("vehicle_id").notNull(),
    km: integer("km").notNull(),
    source: odometerSource("source").notNull().default("manual"),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    /** chi ha letto il contachilometri (un volontario registra solo a proprio nome) */
    recordedById: uuid("recorded_by_id").notNull(),
  },
  (t) => [
    index("odometer_vehicle_idx").on(t.tenantId, t.vehicleId, t.readAt),
    check("odometer_km_ck", sql`${t.km} >= 0`),
    tenantFk("odometer_readings_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles, "cascade"),
    tenantFk("odometer_readings_recorded_by_id_fk", t.tenantId, t.recordedById, profiles),
  ],
);
