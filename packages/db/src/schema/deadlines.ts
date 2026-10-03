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
import { profiles, suppliers, tenants } from "./core";
import { completionOutcome, deadlineSubject, ownershipKind, vehicleCategory } from "./enums";
import { equipment, equipmentTypes } from "./equipment";
import { sanitizations } from "./checklists";
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
 *
 * TUTTO È DELL'ASSOCIAZIONE. Il seed precarica un catalogo con le norme
 * italiane, ma tipi, regole e scadenze si scelgono, si aggiungono, si
 * modificano e si eliminano dall'applicazione. L'unico limite è lo
 * storico: ciò che ha adempimenti registrati si archivia invece di
 * sparire (`remove_deadline`, `remove_deadline_type`).
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
    /**
     * La scadenza successiva si conta dalla scadenza precedente, non dal
     * giorno in cui si è adempiuto. Vale per RCA e bollo: la polizza
     * rinnovata in anticipo, o pagata nei giorni di tolleranza, scade
     * comunque all'anniversario. Per revisione, tagliando ed estintori resta
     * falso: si conta da quando il lavoro è stato fatto.
     */
    renewFromDue: boolean("renew_from_due").notNull().default(false),
    /**
     * Con `renew_from_due`: entro quanti giorni dalla scadenza un rinnovo
     * tardivo conserva l'anniversario (RCA: 15, art. 1901 c.c.). Oltre, il
     * nuovo periodo parte dal pagamento. Nullo = calendario fisso, non si
     * riparte mai dal pagamento (bollo).
     */
    renewGraceDays: integer("renew_grace_days"),
    alertDays: integer("alert_days").notNull().default(30),
    alertKm: integer("alert_km"),
    /** superata, il mezzo/attrezzatura non è utilizzabile (revisione, RCA, elettrodi scaduti…) */
    blocking: boolean("blocking").notNull().default(false),
    /** per chiuderla serve allegare un documento (certificato, ricevuta) */
    documentRequired: boolean("document_required").notNull().default(false),
    /** è la tassa automobilistica: non nasce per i mezzi con `bollo_exempt` */
    isVehicleTax: boolean("is_vehicle_tax").notNull().default(false),
    /**
     * L'equipaggio può registrarne l'adempimento (la sanificazione
     * periodica, fatta dai volontari). Gli altri adempimenti li registrano
     * i responsabili.
     */
    completedByCrew: boolean("completed_by_crew").notNull().default(false),
    /** eliminato dall'associazione ma con storico da conservare (vedi `remove_deadline_type`) */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("deadline_types", t),
    /* un codice archiviato si può riusare: eliminare e ricreare non deve fallire */
    uniqueIndex("deadline_types_tenant_code_uq")
      .on(t.tenantId, t.code)
      .where(sql`${t.archivedAt} is null`),
    check(
      "deadline_types_interval_ck",
      sql`not (${t.intervalMonths} is not null and ${t.intervalDays} is not null)`,
    ),
    /* periodicità positive, preavvisi e tolleranza non negativi: uno 0
       scritto per sbaglio farebbe scadere l'adempimento il giorno stesso */
    check(
      "deadline_types_values_ck",
      sql`${t.intervalMonths} > 0 and ${t.intervalDays} > 0 and ${t.intervalKm} > 0
          and ${t.alertDays} >= 0 and ${t.alertKm} >= 0 and ${t.renewGraceDays} >= 0`,
    ),
    /* la prossima scadenza di un adempimento dell'equipaggio la calcola il
       database senza rinnovo dalla scadenza: le due cose non vanno insieme */
    check("deadline_types_crew_renew_ck", sql`not (${t.completedByCrew} and ${t.renewFromDue})`),
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
 *
 * La regola non serve solo alla nascita: le scadenze che non hanno un
 * valore proprio lo ereditano da qui in ogni momento (vista
 * `deadlines_effective`), quindi correggere una regola corregge tutte le
 * scadenze che non sono state toccate a mano.
 */
export const deadlineRules = fleetcareSchema.table(
  "deadline_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    deadlineTypeId: uuid("deadline_type_id").notNull(),
    vehicleCategory: vehicleCategory("vehicle_category"),
    equipmentTypeId: uuid("equipment_type_id"),
    intervalMonths: integer("interval_months"),
    intervalDays: integer("interval_days"),
    intervalKm: integer("interval_km"),
    alertDays: integer("alert_days"),
    alertKm: integer("alert_km"),
    blocking: boolean("blocking"),
    /**
     * La regola vale solo per questi tipi di proprietà (null = tutte). È la
     * risposta a «di chi è»: con `{owned}` il collaudo nasce solo per le
     * bombole dell'associazione, non per quelle a scambio del fornitore né
     * per il DAE in comodato dall'AST; allo stesso modo RCA e bollo possono
     * non nascere per un mezzo a noleggio. Ogni associazione decide la sua.
     */
    ownershipKinds: ownershipKind("ownership_kinds").array(),
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
    /* come sul tipo; un valore nullo passa (eredita) */
    check(
      "deadline_rules_values_ck",
      sql`${t.intervalMonths} > 0 and ${t.intervalDays} > 0 and ${t.intervalKm} > 0
          and ${t.alertDays} >= 0 and ${t.alertKm} >= 0`,
    ),
    tenantFk(
      "deadline_rules_deadline_type_id_fk",
      t.tenantId,
      t.deadlineTypeId,
      deadlineTypes,
      "cascade",
    ),
    tenantFk(
      "deadline_rules_equipment_type_id_fk",
      t.tenantId,
      t.equipmentTypeId,
      equipmentTypes,
      "cascade",
    ),
  ],
);

/**
 * La scadenza corrente di un mezzo o di un'attrezzatura (esattamente uno
 * dei due).
 *
 * Periodicità, preavviso e blocco **ereditano**: un campo nullo vale
 * quanto la regola (per la categoria del mezzo o il tipo dell'attrezzatura)
 * e, se anche la regola tace, quanto il tipo di scadenza. Un valore scritto
 * qui è una correzione a mano (il tagliando di quel Ducato è a 40.000 km,
 * non a 30.000) e vince. I valori effettivi si leggono dalla vista
 * `deadlines_effective`; la stessa catena in TypeScript è
 * `effectiveDeadline` in `domain/deadlines`.
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
    deadlineTypeId: uuid("deadline_type_id").notNull(),
    vehicleId: uuid("vehicle_id"),
    equipmentId: uuid("equipment_id"),
    /** distingue due scadenze dello stesso tipo sullo stesso soggetto; '' quando non serve */
    label: text("label").notNull().default(""),
    /* correzioni a mano: null = eredita da regola e tipo */
    intervalMonths: integer("interval_months"),
    intervalDays: integer("interval_days"),
    intervalKm: integer("interval_km"),
    alertDays: integer("alert_days"),
    alertKm: integer("alert_km"),
    blocking: boolean("blocking"),
    /**
     * La scadenza vera e propria: la più lontana fra la base qui sotto e
     * la prossima scadenza dell'ultimo adempimento valido. La calcola il
     * database (trigger); l'app la scrive solo per correggerla a mano, e
     * quel valore diventa la nuova base.
     */
    dueOn: date("due_on"),
    dueKm: integer("due_km"),
    /**
     * La base: la scadenza scritta a mano o letta dal documento, prima e a
     * prescindere dagli adempimenti registrati. Serve a tornare indietro
     * giusti quando un adempimento si cancella, e fa sì che uno storico
     * vecchio caricato dopo non riporti indietro una scadenza più recente.
     */
    baseDueOn: date("base_due_on"),
    baseDueKm: integer("base_due_km"),
    /** ultimo adempimento valido: lo scrive il trigger su `deadline_completions` */
    lastDoneOn: date("last_done_on"),
    lastDoneKm: integer("last_done_km"),
    /**
     * Eliminata ma con storico: una scadenza che ha adempimenti registrati
     * non si cancella (le revisioni passate sono documentazione), si
     * archivia. Sparisce da scadenzario e semaforo e si può ripristinare.
     * Vedi `remove_deadline` nella migration 0001.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey("deadlines", t),
    index("deadlines_tenant_due_idx").on(t.tenantId, t.dueOn),
    index("deadlines_vehicle_idx").on(t.tenantId, t.vehicleId),
    index("deadlines_equipment_idx").on(t.tenantId, t.equipmentId),
    /* le archiviate non contano: eliminare e reinserire la stessa scadenza non deve fallire */
    uniqueIndex("deadlines_vehicle_uq")
      .on(t.tenantId, t.deadlineTypeId, t.vehicleId, t.label)
      .where(sql`${t.vehicleId} is not null and ${t.archivedAt} is null`),
    uniqueIndex("deadlines_equipment_uq")
      .on(t.tenantId, t.deadlineTypeId, t.equipmentId, t.label)
      .where(sql`${t.equipmentId} is not null and ${t.archivedAt} is null`),
    check(
      "deadlines_subject_ck",
      sql`(${t.vehicleId} is not null) <> (${t.equipmentId} is not null)`,
    ),
    check(
      "deadlines_interval_ck",
      sql`not (${t.intervalMonths} is not null and ${t.intervalDays} is not null)`,
    ),
    /* come sul tipo; un valore nullo passa (eredita) */
    check(
      "deadlines_values_ck",
      sql`${t.intervalMonths} > 0 and ${t.intervalDays} > 0 and ${t.intervalKm} > 0
          and ${t.alertDays} >= 0 and ${t.alertKm} >= 0`,
    ),
    tenantFk("deadlines_deadline_type_id_fk", t.tenantId, t.deadlineTypeId, deadlineTypes),
    tenantFk("deadlines_vehicle_id_fk", t.tenantId, t.vehicleId, vehicles, "cascade"),
    tenantFk("deadlines_equipment_id_fk", t.tenantId, t.equipmentId, equipment, "cascade"),
  ],
);

/**
 * Ogni volta che una scadenza è stata adempiuta: revisione passata,
 * polizza rinnovata, bollo pagato, verifica elettrica fatta, elettrodi
 * sostituiti. È anche dove sta il **costo** degli adempimenti (premio
 * RCA, costo della revisione, della verifica): il TCO del mezzo lo legge
 * da qui e dagli interventi.
 *
 * Registrare un adempimento sposta in avanti la scadenza, da sé: un
 * trigger (migration 0001) copia `next_due_on`/`next_due_km` dell'ultimo
 * adempimento non fallito su `deadlines.due_on`/`due_km`, e lo rifà se un
 * adempimento si corregge o si cancella. Così il rinnovo dell'RCA lo
 * registra l'amministrazione, e la sanificazione periodica l'equipaggio,
 * senza bisogno di poter modificare la scadenza.
 * `next_due_*` si calcola con `nextDue` o si legge dal documento.
 */
export const deadlineCompletions = fleetcareSchema.table(
  "deadline_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /* nessun cascade: cancellare una scadenza non deve portarsi via lo storico */
    deadlineId: uuid("deadline_id").notNull(),
    doneOn: date("done_on").notNull(),
    doneKm: integer("done_km"),
    outcome: completionOutcome("outcome").notNull().default("passed"),
    nextDueOn: date("next_due_on"),
    nextDueKm: integer("next_due_km"),
    /** chi l'ha fatta: centro revisioni, assistenza tecnica, compagnia */
    supplierId: uuid("supplier_id"),
    /** n. certificato / n. polizza / n. ricevuta */
    documentNumber: text("document_number"),
    costEur: numeric("cost_eur", { precision: 12, scale: 2 }),
    maintenanceJobId: uuid("maintenance_job_id"),
    /** la sanificazione che ha chiuso la scadenza «sanificazione periodica» */
    sanitizationId: uuid("sanitization_id"),
    notes: text("notes"),
    recordedById: uuid("recorded_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deadline_completions_deadline_idx").on(t.tenantId, t.deadlineId, t.doneOn),
    /* una sanificazione chiude la scadenza una volta sola */
    uniqueIndex("deadline_completions_sanitization_uq")
      .on(t.deadlineId, t.sanitizationId)
      .where(sql`${t.sanitizationId} is not null`),
    tenantFk("deadline_completions_deadline_id_fk", t.tenantId, t.deadlineId, deadlines),
    tenantFk("deadline_completions_supplier_id_fk", t.tenantId, t.supplierId, suppliers),
    tenantFk(
      "deadline_completions_maintenance_job_id_fk",
      t.tenantId,
      t.maintenanceJobId,
      maintenanceJobs,
    ),
    tenantFk("deadline_completions_recorded_by_id_fk", t.tenantId, t.recordedById, profiles),
    tenantFk(
      "deadline_completions_sanitization_id_fk",
      t.tenantId,
      t.sanitizationId,
      sanitizations,
    ),
  ],
);

/**
 * Le scadenze con i valori **effettivi**: per ogni campo la correzione a
 * mano della scadenza, altrimenti la regola della categoria del mezzo (o
 * del tipo dell'attrezzatura), altrimenti il tipo di scadenza. Mesi e
 * giorni viaggiano insieme: vince il primo livello che ne fissa uno.
 *
 * Definita nella migration 0001 (`security_invoker`: valgono le policy di
 * chi la legge). È quello che leggono scadenzario e semaforo.
 */
export const deadlinesEffective = fleetcareSchema
  .view("deadlines_effective", {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    deadlineTypeId: uuid("deadline_type_id").notNull(),
    typeCode: text("type_code").notNull(),
    typeLabel: text("type_label").notNull(),
    subject: deadlineSubject("subject").notNull(),
    vehicleId: uuid("vehicle_id"),
    equipmentId: uuid("equipment_id"),
    label: text("label").notNull(),
    dueOn: date("due_on"),
    dueKm: integer("due_km"),
    baseDueOn: date("base_due_on"),
    baseDueKm: integer("base_due_km"),
    lastDoneOn: date("last_done_on"),
    lastDoneKm: integer("last_done_km"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    intervalMonths: integer("interval_months"),
    intervalDays: integer("interval_days"),
    intervalKm: integer("interval_km"),
    alertDays: integer("alert_days").notNull(),
    alertKm: integer("alert_km"),
    blocking: boolean("blocking").notNull(),
    monthEnd: boolean("month_end").notNull(),
    renewFromDue: boolean("renew_from_due").notNull(),
    renewGraceDays: integer("renew_grace_days"),
    /** la scadenza ha almeno un valore corretto a mano */
    overridden: boolean("overridden").notNull(),
  })
  .existing();
