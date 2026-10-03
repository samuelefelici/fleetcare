import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fleetcareSchema } from "./_schema";
import { attachmentEntity, notificationKind, profileRole, supplierKind } from "./enums";

/**
 * L'associazione. Oggi una sola (Croce Gialla di Camerano), ma ogni riga
 * di ogni tabella porta `tenant_id` e la RLS isola i tenant fin da subito:
 * aggiungerlo dopo, con i dati dentro, costa molto più che averlo adesso.
 */
export const tenants = fleetcareSchema.table("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // "Croce Gialla di Camerano"
  slug: text("slug").notNull().unique(),
  legalName: text("legal_name"), // denominazione completa (es. "… ODV")
  taxCode: text("tax_code"), // codice fiscale dell'ente
  vatNumber: text("vat_number"),
  /** iscrizione al Registro Unico Nazionale del Terzo Settore */
  runtsNumber: text("runts_number"),
  /** rete di appartenenza: ANPAS, CRI, Misericordie… (testo: serve a leggere, non a decidere) */
  network: text("network"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  pec: text("pec"),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Le persone dell'associazione: volontari, dipendenti, responsabili.
 *
 * I volontari segnalano dall'app sui **propri dispositivi**, quindi ognuno
 * ha la sua persona qui: chi fa una check-list, un rifornimento, una
 * sanificazione o una segnalazione è sempre una riga di questa tabella, e
 * la RLS impedisce di registrare qualcosa a nome di un altro.
 *
 * È la rubrica interna: la leggono tutti i membri dell'associazione
 * (serve a scrivere «segnalato da…»), per questo contiene solo ciò che è
 * giusto che un volontario veda degli altri. Email, telefono e password
 * stanno in `profile_accounts`, che ognuno vede solo per sé.
 *
 * Dati minimi per scelta (GDPR): patenti, abilitazioni e turni non sono
 * materia del parco mezzi.
 */
export const profiles = fleetcareSchema.table(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fullName: text("full_name").notNull(),
    role: profileRole("role").notNull(),
    badgeNumber: text("badge_number"), // n. tessera / matricola del volontario
    /** abilitato alla guida dei mezzi dell'associazione */
    isDriver: boolean("is_driver").notNull().default(false),
    siteId: uuid("site_id").references(() => sites.id),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profiles_tenant_name_idx").on(t.tenantId, t.fullName),
    uniqueIndex("profiles_tenant_badge_uq")
      .on(t.tenantId, t.badgeNumber)
      .where(sql`${t.badgeNumber} is not null`),
  ],
);

/**
 * Le credenziali e i recapiti di una persona, separati dalla rubrica:
 * ognuno vede solo i propri, la direzione li gestisce. Una persona senza
 * riga qui esiste ma non ha ancora attivato l'accesso all'app.
 *
 * Il login non legge questa tabella direttamente (non c'è ancora un
 * contesto tenant): passa da `auth_find_profile`, l'unica funzione che
 * attraversa la RLS.
 */
export const profileAccounts = fleetcareSchema.table(
  "profile_accounts",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    phone: text("phone"),
    /** nullo finché la persona non ha impostato la password (o se entra con link via email) */
    passwordHash: text("password_hash"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("profile_accounts_tenant_email_uq").on(t.tenantId, sql`lower(${t.email})`)],
);

/**
 * Le iscrizioni Web Push dei dispositivi dei volontari: è così che chi ha
 * segnalato un guasto riceve «presa in carico», «risolta». Una persona può
 * avere più dispositivi; un'iscrizione scaduta si cancella al primo invio
 * fallito.
 */
export const pushSubscriptions = fleetcareSchema.table(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("push_subscriptions_profile_idx").on(t.tenantId, t.profileId)],
);

/** Sedi e postazioni: dove stanno i mezzi e dove si tiene la scorta di materiale. */
export const sites = fleetcareSchema.table(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    isHeadquarters: boolean("is_headquarters").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sites_tenant_name_uq").on(t.tenantId, t.name)],
);

/**
 * Fornitori: officine, gommisti, allestitori, assistenza elettromedicali,
 * il distributore di carburante, la compagnia assicurativa, il centro
 * revisioni. Una tabella sola perché lo stesso soggetto può fare più cose
 * (la concessionaria fa tagliandi e revisioni) e perché ogni costo deve
 * poter dire «pagato a chi».
 */
export const suppliers = fleetcareSchema.table(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    kinds: supplierKind("kinds")
      .array()
      .notNull()
      .default(sql`'{}'`),
    vatNumber: text("vat_number"),
    taxCode: text("tax_code"),
    /** codice destinatario SdI e PEC: servono a riconoscere le fatture elettroniche in arrivo */
    sdiCode: text("sdi_code"),
    pec: text("pec"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    contactName: text("contact_name"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suppliers_tenant_name_idx").on(t.tenantId, t.name),
    uniqueIndex("suppliers_tenant_vat_uq")
      .on(t.tenantId, t.vatNumber)
      .where(sql`${t.vatNumber} is not null`),
  ],
);

/**
 * Allegati di qualunque entità: certificati di revisione e di verifica,
 * fatture, carta di circolazione, foto delle segnalazioni, manuali.
 * Il file sta su MinIO (`storage_path`), qui solo il riferimento.
 *
 * Polimorfica (`entity_type` + `entity_id`, senza foreign key) perché le
 * entità che hanno documenti sono otto e crescono: otto tabelle di
 * allegati identiche sarebbero peggio di un vincolo applicativo.
 */
export const attachments = fleetcareSchema.table(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    entityType: attachmentEntity("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    /** photo | certificate | invoice | registration | manual | other */
    kind: text("kind").notNull().default("other"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attachments_entity_idx").on(t.tenantId, t.entityType, t.entityId),
    check("attachments_size_ck", sql`${t.sizeBytes} >= 0`),
  ],
);

/** Notifiche in-app. */
export const notifications = fleetcareSchema.table(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => profiles.id),
    kind: notificationKind("kind").notNull().default("generic"),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_recipient_idx").on(t.tenantId, t.recipientId, t.readAt)],
);

/** Audit log: alimentato solo da trigger (migration 0001), mai scritto dall'app. */
export const auditLogs = fleetcareSchema.table(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    tableName: text("table_name").notNull(),
    rowId: uuid("row_id"),
    action: text("action").notNull(), // INSERT | UPDATE | DELETE
    actorId: uuid("actor_id"),
    diff: jsonb("diff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_tenant_table_idx").on(t.tenantId, t.tableName, t.createdAt)],
);

/** Numerazione per tenant e anno: SGN-2026-00001 (segnalazioni), MAN-… (interventi), SIN-… (sinistri). */
export const documentCounters = fleetcareSchema.table(
  "document_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kind: text("kind").notNull(),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [uniqueIndex("document_counters_uq").on(t.tenantId, t.kind, t.year)],
);
