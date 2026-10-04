/**
 * `pnpm db:seed`: crea l'associazione e il catalogo iniziale (vedi seed.ts).
 * Rilanciarlo è sicuro: il catalogo si scrive una volta sola. Senza
 * SEED_TENANT_SLUG crea la Croce Gialla di Camerano, il primo caso.
 */
import postgres from "postgres";
import { seedTenant, seedTenantFromEnv } from "./seed";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL mancante");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
try {
  await seedTenant(
    client,
    seedTenantFromEnv(process.env) ?? {
      slug: "croce-gialla-camerano",
      name: "Croce Gialla di Camerano",
      network: "ANPAS",
      city: "Camerano",
      province: "AN",
    },
  );
} finally {
  await client.end();
}
