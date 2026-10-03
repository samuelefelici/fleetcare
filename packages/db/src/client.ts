import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type TenantTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type ProfileRole = (typeof schema.profileRole.enumValues)[number];

let _client: postgres.Sql | undefined;
let _db: Db | undefined;

/**
 * Connessione applicativa: ruolo DB NON superuser (`fleetcare_app`),
 * soggetto a RLS. Le policy leggono `app.tenant_id` / `app.user_id` /
 * `app.role` impostati per-transazione da `withTenant`.
 */
export function getDb(databaseUrl: string): Db {
  if (!_db) {
    _client = postgres(databaseUrl, {
      max: 10,
      prepare: false,
      // i giorni che le query ricavano (::date, scadenze, mesi dei report)
      // sono quelli di Roma, non quelli del server
      connection: { TimeZone: "Europe/Rome" },
    });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: ProfileRole;
}

/**
 * Apre una transazione con il contesto tenant per la RLS: ogni query
 * dentro `fn` è filtrata dalle policy. `set_config(..., true)` è locale
 * alla transazione: nessun leak fra richieste sulla stessa connessione.
 */
export async function withTenant<T>(
  db: Db,
  ctx: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.tenant_id', ${ctx.tenantId}, true),
        set_config('app.user_id', ${ctx.userId}, true),
        set_config('app.role', ${ctx.role}, true)
    `);
    return fn(tx);
  });
}

export type DocumentKind = "SGN" | "MAN" | "SIN";

/**
 * Prossimo numero documento (SGN-2026-00001, MAN-…, SIN-…), atomico per
 * associazione e anno. Passa dalla funzione del database: i contatori non
 * sono scrivibili dall'app, così nessuno può azzerarli. Le segnalazioni le
 * numera chiunque; interventi e sinistri solo i responsabili.
 */
export async function nextDocumentNumber(
  tx: TenantTx,
  kind: DocumentKind,
  year: number,
): Promise<string> {
  const rows = await tx.execute<{ number: string }>(
    sql`select fleetcare.next_document_number(${kind}, ${year}) as number`,
  );
  const number = rows[0]?.number;
  if (!number) throw new Error(`Numerazione ${kind} non riuscita`);
  return number;
}
