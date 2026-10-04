/**
 * La prima utenza della direzione, all'avvio del container.
 *
 * Le persone e le utenze le crea la direzione dall'app; ma la prima
 * direzione qualcuno deve crearla. Con BOOTSTRAP_ADMIN_EMAIL,
 * BOOTSTRAP_ADMIN_PASSWORD (e BOOTSTRAP_ADMIN_NAME) nelle variabili di
 * Coolify, il container crea la persona con ruolo `admin` e la sua
 * utenza, **solo se l'associazione non ha ancora nessuna utenza**. Da lì
 * in poi le variabili non fanno niente: una password cambiata dall'app non
 * viene mai sovrascritta, e le variabili si possono togliere.
 */
import { eq, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import * as schema from "../schema";
import { hashPassword, passwordProblem } from "./password";

export interface BootstrapAdmin {
  email: string;
  password: string;
  name: string;
}

export function bootstrapAdminFromEnv(env: NodeJS.ProcessEnv): BootstrapAdmin | null {
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) return null;
  return {
    email: env.BOOTSTRAP_ADMIN_EMAIL.trim(),
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    name: env.BOOTSTRAP_ADMIN_NAME?.trim() || "Direzione",
  };
}

export type BootstrapOutcome = "created" | "already_has_accounts" | "tenant_missing";

export async function bootstrapAdmin(
  client: postgres.Sql,
  tenantSlug: string,
  admin: BootstrapAdmin,
): Promise<BootstrapOutcome> {
  const problem = passwordProblem(admin.password);
  if (problem) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${problem}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL non è un indirizzo email");
  }
  const db = drizzle(client, { schema });
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, tenantSlug))
      .for("update");
    if (!tenant) return "tenant_missing";
    const [existing] = await tx
      .select({ n: raw<number>`count(*)::int` })
      .from(schema.profileAccounts)
      .where(eq(schema.profileAccounts.tenantId, tenant.id));
    if (existing!.n > 0) return "already_has_accounts";
    const [profile] = await tx
      .insert(schema.profiles)
      .values({ tenantId: tenant.id, fullName: admin.name, role: "admin" })
      .returning({ id: schema.profiles.id });
    await tx.insert(schema.profileAccounts).values({
      profileId: profile!.id,
      tenantId: tenant.id,
      email: admin.email,
      passwordHash: hashPassword(admin.password),
    });
    return "created";
  });
}
