/**
 * Prepara il database all'avvio del container, prima che l'app risponda.
 * Se qualcosa non va esce con errore: il container non parte, e Coolify
 * tiene in piedi la versione precedente invece di pubblicarne una su un
 * database a metà.
 *
 * Con il ruolo owner (DATABASE_ADMIN_URL), uno alla volta (advisory lock:
 * due container avviati insieme non migrano in parallelo):
 *   1. controlla le migration (migrations.ts): una già applicata e poi
 *      modificata, o una che drizzle salterebbe, fermano tutto PRIMA di
 *      applicare qualunque cosa. Una migration applicata in produzione non
 *      si tocca più: le modifiche vanno in una migration nuova;
 *   2. applica le migration non ancora applicate (drizzle tiene il conto
 *      nello schema `drizzle`, quindi ai riavvii non rifà niente);
 *   3. mette in sicurezza il ruolo applicativo `fleetcare_app`: lo crea se
 *      manca (ripristino in un server nuovo), niente superutente né bypass
 *      della RLS. La password è quella scritta in DATABASE_URL: se con
 *      quella non si entra (primo avvio, o password cambiata nella
 *      variabile di Coolify) la imposta, già cifrata; se si entra, non
 *      la tocca;
 *   4. riapplica i suoi permessi (`fleetcare.apply_app_privileges()`,
 *      migration 0001): il backup di Coolify è un `pg_dump --no-acl`, e
 *      dopo un ripristino non ci sono più né i GRANT né la revoca di TEMP;
 *   5. se c'è SEED_TENANT_SLUG, crea l'associazione e il catalogo (una
 *      volta sola: rilanciarlo non fa niente), e con BOOTSTRAP_ADMIN_* la
 *      prima utenza della direzione, solo se non ce n'è ancora nessuna
 *      (bootstrap-admin.ts).
 * Poi, con la connessione dell'app, l'autocontrollo (selfcheck.ts).
 *
 * Nei messaggi d'errore non compaiono mai gli URL: contengono le password.
 *
 *   node --import tsx src/ops/prepare.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { seedTenant, seedTenantFromEnv } from "../seed/seed";
import { bootstrapAdmin, bootstrapAdminFromEnv } from "./bootstrap-admin";
import { localMigrations, migrationState } from "./migrations";
import { scramSha256Verifier } from "./scram";
import { describeSelfCheck, selfCheck } from "./selfcheck";

const APP_ROLE = "fleetcare_app";
const DEV_PASSWORD = "fleetcare_app";
const migrationsFolder = new URL("../../migrations", import.meta.url).pathname;

function fail(message: string): never {
  console.error(`[fleetcare] ${message}`);
  process.exit(1);
}

/** Utente, password e destinazione di un URL di connessione, senza mai riportare l'URL. */
function credentials(name: string, value: string | undefined, purpose: string) {
  if (!value) fail(`${name} mancante (${purpose})`);
  try {
    const url = new URL(value);
    return {
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      host: `${url.hostname}:${url.port || "5432"}`,
      database: url.pathname.replace(/^\//, "") || "(nessuno)",
    };
  } catch {
    return fail(
      `${name} non è un URL valido: postgres://utente:password@host:5432/database, ` +
        `con una password di sole lettere e cifre (o codificata)`,
    );
  }
}

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;
const admin = credentials("DATABASE_ADMIN_URL", adminUrl, "ruolo owner, usato solo qui");
const app = credentials("DATABASE_URL", appUrl, "ruolo fleetcare_app, usato dall'app");
if (app.user !== APP_ROLE) {
  fail(
    `DATABASE_URL usa «${app.user}»: deve usare ${APP_ROLE}. Le regole su chi vede che cosa ` +
      `valgono solo per quel ruolo; con l'utenza dell'amministratore l'app le scavalcherebbe tutte.`,
  );
}
if (!app.password) fail("DATABASE_URL senza password per fleetcare_app");
if (process.env.NODE_ENV === "production" && app.password === DEV_PASSWORD) {
  fail(
    "DATABASE_URL usa la password di sviluppo di fleetcare_app: in produzione serve una password vera",
  );
}
if (admin.user === APP_ROLE) {
  fail("DATABASE_ADMIN_URL usa fleetcare_app: serve il ruolo owner del database (es. postgres)");
}
// le due variabili cambiano solo per utente e password: altrimenti le
// migration finiscono in un database e l'app ne cerca un altro
if (admin.host !== app.host || admin.database !== app.database) {
  fail(
    `DATABASE_URL e DATABASE_ADMIN_URL devono puntare allo stesso database, e invece: ` +
      `admin → ${admin.host}/${admin.database}, app → ${app.host}/${app.database}. ` +
      `Copia DATABASE_ADMIN_URL e cambia solo utente e password`,
  );
}

/** L'app riesce a entrare con DATABASE_URL? (il database è già raggiungibile: lo dice la connessione owner) */
async function appCanLogin(): Promise<boolean> {
  const probe = postgres(appUrl!, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

const local = localMigrations(migrationsFolder);
const owner = postgres(adminUrl!, { max: 1, onnotice: () => {} });
try {
  await owner`select pg_advisory_lock(hashtextextended('fleetcare.prepare', 0))`;
  try {
    const before = await migrationState(owner, local);
    if (before.changed.length) {
      fail(
        `migration modificate dopo essere state applicate: ${before.changed.join(", ")}. ` +
          `Una migration applicata non si tocca: la modifica va in una migration nuova. ` +
          `Nessuna migration è stata applicata`,
      );
    }
    if (before.skipped.length) {
      fail(
        `migration mai applicate perché più vecchie dell'ultima applicata: ` +
          `${before.skipped.join(", ")}. Va rigenerata con una data nuova. ` +
          `Nessuna migration è stata applicata`,
      );
    }
    if (before.pending.length) {
      await migrate(drizzle(owner), { migrationsFolder });
    }
    const after = await migrationState(owner, local);
    if (after.changed.length || after.skipped.length || after.pending.length) {
      fail(
        "le migration non risultano applicate come previsto: controllare drizzle.__drizzle_migrations",
      );
    }
    const newer = after.applied - local.length;
    console.log(
      `[fleetcare] migration: ${local.length} applicate` +
        (before.pending.length
          ? ` (${before.pending.length} adesso: ${before.pending.join(", ")})`
          : "") +
        (newer > 0 ? ` (più ${newer} di una versione più recente del codice)` : ""),
    );

    const [role] = await owner<{ exists: boolean }[]>`
      select exists (select 1 from pg_roles where rolname = ${APP_ROLE}) as exists`;
    if (!role!.exists) {
      // le policy del database ripristinato lo citano: senza, il ripristino le
      // ha perse, e l'autocontrollo qui sotto lo dirà
      console.warn(
        "[fleetcare] fleetcare_app non esisteva: lo creo. Se il database viene da un " +
          "ripristino, il ruolo andava creato PRIMA del ripristino (docs/deploy-coolify.md)",
      );
      await owner.unsafe(`create role ${APP_ROLE} login`);
    }
    await owner.unsafe(
      `alter role ${APP_ROLE} with login nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
    );
    if (await appCanLogin()) {
      console.log("[fleetcare] ruolo applicativo: la password di DATABASE_URL è già quella in uso");
    } else {
      // primo avvio, o password cambiata nella variabile: la si imposta già
      // cifrata, così in chiaro non arriva mai al database né ai suoi log
      const [statement] = await owner<{ sql: string }[]>`
        select format('alter role %I password %L', ${APP_ROLE}::text,
                      ${scramSha256Verifier(app.password)}::text) as sql`;
      await owner.unsafe(statement!.sql);
      console.log("[fleetcare] ruolo applicativo: password impostata da DATABASE_URL");
    }
    await owner`select fleetcare.apply_app_privileges()`;
    console.log("[fleetcare] ruolo applicativo: permessi riapplicati, niente superutente né TEMP");

    const tenant = seedTenantFromEnv(process.env);
    if (tenant) {
      await seedTenant(owner, tenant);
      const admin = bootstrapAdminFromEnv(process.env);
      if (admin) {
        const outcome = await bootstrapAdmin(owner, tenant.slug, admin);
        console.log(
          outcome === "created"
            ? `[fleetcare] prima utenza della direzione creata: ${admin.email}`
            : outcome === "already_has_accounts"
              ? "[fleetcare] utenze già presenti: BOOTSTRAP_ADMIN_* ignorate (si possono togliere)"
              : "[fleetcare] BOOTSTRAP_ADMIN_*: associazione non trovata",
        );
      }
    }
  } finally {
    await owner`select pg_advisory_unlock(hashtextextended('fleetcare.prepare', 0))`;
  }
} finally {
  await owner.end();
}

const appSql = postgres(appUrl!, { max: 1, onnotice: () => {} });
try {
  const result = await selfCheck(appSql);
  console.log(`[fleetcare] autocontrollo:\n${describeSelfCheck(result)}`);
  if (!result.ok) fail("autocontrollo non superato: l'app non parte");
} finally {
  await appSql.end();
}
