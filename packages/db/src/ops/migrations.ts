/**
 * Lo stato delle migration rispetto al database, PRIMA di applicarle.
 *
 * Drizzle tiene in `drizzle.__drizzle_migrations` l'hash e la data di ogni
 * migration applicata, ma all'avvio guarda solo l'ultima riga: applica
 * tutto ciò che ha una data più recente e non si accorge né di una
 * migration già applicata e poi modificata, né di una più vecchia
 * dell'ultima applicata, che salterebbe in silenzio. Questo controllo lo fa
 * prima di `migrate()`, così una release incoerente si rifiuta senza aver
 * toccato niente.
 */
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type postgres from "postgres";

export interface LocalMigration {
  tag: string;
  when: number;
  hash: string;
}

export function localMigrations(migrationsFolder: string): LocalMigration[] {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  return readMigrationFiles({ migrationsFolder }).map((m, i) => ({
    tag: journal.entries[i]!.tag,
    when: m.folderMillis,
    hash: m.hash,
  }));
}

export interface MigrationState {
  /** righe in drizzle.__drizzle_migrations; 0 su un database nuovo */
  applied: number;
  /** locali già applicate, ma con un contenuto diverso da allora */
  changed: string[];
  /** locali mai applicate ma più vecchie dell'ultima applicata: drizzle le salterebbe */
  skipped: string[];
  /** locali che `migrate()` applicherà */
  pending: string[];
}

export async function migrationState(
  sql: postgres.Sql,
  local: readonly LocalMigration[],
): Promise<MigrationState> {
  const [table] = await sql<{ exists: boolean }[]>`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!table!.exists) {
    return { applied: 0, changed: [], skipped: [], pending: local.map((m) => m.tag) };
  }
  const rows = await sql<{ hash: string; when: string }[]>`
    select hash, created_at::text as when from drizzle.__drizzle_migrations`;
  const byWhen = new Map(rows.map((r) => [Number(r.when), r.hash]));
  const last = Math.max(0, ...rows.map((r) => Number(r.when)));
  const notApplied = local.filter((m) => !byWhen.has(m.when));
  return {
    applied: rows.length,
    changed: local
      .filter((m) => byWhen.has(m.when) && byWhen.get(m.when) !== m.hash)
      .map((m) => m.tag),
    skipped: notApplied.filter((m) => m.when <= last).map((m) => m.tag),
    pending: notApplied.filter((m) => m.when > last).map((m) => m.tag),
  };
}
