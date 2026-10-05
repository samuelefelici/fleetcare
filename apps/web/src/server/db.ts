/**
 * Accesso al database dalle pagine e dalle server action: sempre con la
 * sessione, sempre dentro `withTenant`, così ogni query passa dalle policy
 * del database con l'associazione, la persona e il ruolo di chi è entrato.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import * as schema from "@fleetcare/db";
import { getDb, withTenant, type ProfileRole, type TenantTx } from "@fleetcare/db/client";
import { PROFILE_ROLE_LABELS } from "@fleetcare/db/domain/labels";
import { env } from "@/env";
import { auth } from "./auth";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export interface SessionCtx {
  tenantId: string;
  tenantName: string;
  userId: string;
  role: ProfileRole;
  name: string;
}

export const STAFF: readonly ProfileRole[] = [
  "admin",
  "fleet_manager",
  "equipment_manager",
  "admin_finance",
];
export const FLEET: readonly ProfileRole[] = ["admin", "fleet_manager"];
export const EQUIPMENT: readonly ProfileRole[] = ["admin", "fleet_manager", "equipment_manager"];

/** Le etichette dei ruoli: quelle di @fleetcare/db, un nome solo in tutta l'app. */
export const ROLE_LABELS: Record<ProfileRole, string> = PROFILE_ROLE_LABELS;

export function getAppDb() {
  return getDb(env.DATABASE_URL);
}

/**
 * La sessione di chi è entrato, verificata sulla rubrica a ogni richiesta.
 * Il token dice chi è entrato e con quale ruolo al momento dell'accesso;
 * la rubrica dice se è ancora vero: una persona disattivata viene fatta
 * uscire (/uscita cancella la sessione), un ruolo cambiato vale subito,
 * non alla scadenza del token (12 ore).
 */
export async function requireSession(): Promise<SessionCtx> {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError("Accesso richiesto");
  const { id, tenantId, tenantName, role, name } = session.user;
  const claimed: SessionCtx = { userId: id, tenantId, tenantName, role, name: name ?? "" };
  const rows = await withTenant(getAppDb(), claimed, (tx) =>
    tx
      .select({
        role: schema.profiles.role,
        active: schema.profiles.active,
        fullName: schema.profiles.fullName,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, id))
      .limit(1),
  );
  const profile = rows[0];
  if (!profile?.active) redirect("/uscita?motivo=disattivata");
  return { ...claimed, role: profile.role, name: profile.fullName };
}

export function hasRole(ctx: SessionCtx, roles: readonly ProfileRole[]): boolean {
  return roles.includes(ctx.role);
}

export function requireRole(ctx: SessionCtx, roles: readonly ProfileRole[]): void {
  if (!hasRole(ctx, roles)) throw new ForbiddenError("Non è un'operazione del tuo ruolo");
}

/** Una transazione con il contesto della sessione: tutto ciò che legge o scrive l'app passa da qui. */
export async function run<T>(fn: (tx: TenantTx, ctx: SessionCtx) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(getAppDb(), ctx, (tx) => fn(tx, ctx));
}
