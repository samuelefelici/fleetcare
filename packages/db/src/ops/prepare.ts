/**
 * Prepara il database all'avvio del container, prima che l'app risponda.
 * Se qualcosa non va esce con errore: il container non parte, e Coolify
 * tiene in piedi la versione precedente invece di pubblicarne una su un
 * database a metà.
 *
 * Con il ruolo owner (DATABASE_ADMIN_URL), uno alla volta (advisory lock:
 * due container avviati insieme non migrano in parallelo):
 *   1. applica le migration non ancora applicate (drizzle tiene il conto
 *      nello schema `drizzle`, quindi ai riavvii non rifà niente), e
 *      controlla che quelle già applicate non siano state modificate dopo:
 *      drizzle non se ne accorge e salterebbe la versione nuova in silenzio.
 *      Una migration applicata in produzione non si tocca più: le modifiche
 *      vanno in una migration nuova;
 *   2. mette in sicurezza il ruolo applicativo `fleetcare_app`: lo crea se
 *      manca (ripristino in un server nuovo), niente superutente né bypass
 *      della RLS, e la password presa da DATABASE_URL (una sola fonte, la
 *      variabile di Coolify: niente ALTER ROLE a mano, e la password di
 *      sviluppo della migration non sopravvive);
 *   3. riapplica i suoi permessi (`fleetcare.apply_app_privileges()`,
 *      migration 0001): il backup di Coolify è un `pg_dump --no-acl`, e
 *      dopo un ripristino non ci sono più né i GRANT né la revoca di TEMP;
 *   4. se c'è SEED_TENANT_SLUG, crea l'associazione e il catalogo (una
 *      volta sola: rilanciarlo non fa niente).
 * Poi, con la connessione dell'app, l'autocontrollo (selfcheck.ts).
 *
 *   node --import tsx src/ops/prepare.ts
 */
import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { seedTenant, seedTenantFromEnv } from "../seed/seed";
import { scramSha256Verifier } from "./scram";
import { describeSelfCheck, selfCheck } from "./selfcheck";

const APP_ROLE = "fleetcare_app";
const DEV_PASSWORD = "fleetcare_app";
const migrationsFolder = new URL("../../migrations", import.meta.url).pathname;

function fail(message: string): never {
  console.error(`[fleetcare] ${message}`);
  process.exit(1);
}

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;
if (!adminUrl) fail("DATABASE_ADMIN_URL mancante (ruolo owner, usato solo qui)");
if (!appUrl) fail("DATABASE_URL mancante (ruolo fleetcare_app, usato dall'app)");

const app = new URL(appUrl);
const appUser = decodeURIComponent(app.username);
const appPassword = decodeURIComponent(app.password);
if (appUser !== APP_ROLE) {
  fail(
    `DATABASE_URL usa «${appUser}»: deve usare ${APP_ROLE}. Le regole su chi vede che cosa ` +
      `valgono solo per quel ruolo; con l'utenza dell'amministratore l'app le scavalcherebbe tutte.`,
  );
}
if (!appPassword) fail("DATABASE_URL senza password per fleetcare_app");
if (process.env.NODE_ENV === "production" && appPassword === DEV_PASSWORD) {
  fail(
    "DATABASE_URL usa la password di sviluppo di fleetcare_app: in produzione serve una password vera",
  );
}
if (decodeURIComponent(new URL(adminUrl).username) === APP_ROLE) {
  fail("DATABASE_ADMIN_URL usa fleetcare_app: serve il ruolo owner del database (es. postgres)");
}

const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
  entries: { tag: string; when: number }[];
};
const local = readMigrationFiles({ migrationsFolder }).map((m, i) => ({
  tag: journal.entries[i]!.tag,
  when: m.folderMillis,
  hash: m.hash,
}));

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
try {
  await admin`select pg_advisory_lock(hashtextextended('fleetcare.prepare', 0))`;
  try {
    await migrate(drizzle(admin), { migrationsFolder });
    const applied = await admin<{ hash: string; when: string }[]>`
      select hash, created_at::text as when from drizzle.__drizzle_migrations`;
    const byWhen = new Map(applied.map((a) => [Number(a.when), a.hash]));
    const changed = local.filter((m) => byWhen.has(m.when) && byWhen.get(m.when) !== m.hash);
    const skipped = local.filter((m) => !byWhen.has(m.when));
    if (changed.length) {
      fail(
        `migration modificate dopo essere state applicate: ${changed.map((m) => m.tag).join(", ")}. ` +
          `Una migration applicata non si tocca: la modifica va in una migration nuova`,
      );
    }
    if (skipped.length) {
      fail(
        `migration mai applicate perché più vecchie dell'ultima applicata: ` +
          `${skipped.map((m) => m.tag).join(", ")}. Va rigenerata con una data nuova`,
      );
    }
    const newer = applied.length - local.length;
    console.log(
      `[fleetcare] migration: ${local.length} applicate` +
        (newer > 0 ? ` (più ${newer} di una versione più recente del codice)` : ""),
    );

    const [role] = await admin<{ exists: boolean }[]>`
      select exists (select 1 from pg_roles where rolname = ${APP_ROLE}) as exists`;
    if (!role!.exists) {
      // le policy del database ripristinato lo citano: senza, il ripristino le
      // ha perse, e l'autocontrollo qui sotto lo dirà
      console.warn(
        "[fleetcare] fleetcare_app non esisteva: lo creo. Se il database viene da un " +
          "ripristino, il ruolo andava creato PRIMA del ripristino (docs/deploy-coolify.md)",
      );
      await admin.unsafe(`create role ${APP_ROLE} login`);
    }
    const [statement] = await admin<{ sql: string }[]>`
      select format(
        'alter role %I with login nosuperuser nobypassrls nocreatedb nocreaterole noreplication password %L',
        ${APP_ROLE}::text, ${scramSha256Verifier(appPassword)}::text) as sql`;
    await admin.unsafe(statement!.sql);
    await admin`select fleetcare.apply_app_privileges()`;
    console.log(
      "[fleetcare] ruolo applicativo: password da DATABASE_URL, permessi riapplicati, " +
        "niente superutente né TEMP",
    );

    const tenant = seedTenantFromEnv(process.env);
    if (tenant) await seedTenant(admin, tenant);
  } finally {
    await admin`select pg_advisory_unlock(hashtextextended('fleetcare.prepare', 0))`;
  }
} finally {
  await admin.end();
}

const appSql = postgres(appUrl, { max: 1, onnotice: () => {} });
try {
  const result = await selfCheck(appSql);
  console.log(`[fleetcare] autocontrollo:\n${describeSelfCheck(result)}`);
  if (!result.ok) fail("autocontrollo non superato: l'app non parte");
} finally {
  await appSql.end();
}
