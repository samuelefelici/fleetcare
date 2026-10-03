/**
 * Runner migration: usa il ruolo owner (DATABASE_ADMIN_URL), mai quello app.
 * `pnpm db:migrate`
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL mancante");
  process.exit(1);
}

const client = postgres(url, { max: 1 });

try {
  await migrate(drizzle(client), { migrationsFolder: "./migrations" });
  console.log("Migration applicate");
} finally {
  await client.end();
}
