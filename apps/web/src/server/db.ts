/**
 * Accesso al database dalle pagine e dalle server action: sempre con la
 * sessione, sempre dentro `withTenant`, così ogni query passa dalle policy
 * del database con l'associazione, la persona e il ruolo di chi è entrato.
 */
import "server-only";
import { getDb, withTenant, type ProfileRole, type TenantTx } from "@fleetcare/db/client";
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

export const ROLE_LABELS: Record<ProfileRole, string> = {
  crew: "Equipaggio",
  fleet_manager: "Responsabile mezzi",
  equipment_manager: "Responsabile materiale",
  admin_finance: "Amministrazione",
  admin: "Direzione",
};

export function getAppDb() {
  return getDb(env.DATABASE_URL);
}

export async function requireSession(): Promise<SessionCtx> {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError("Accesso richiesto");
  const { id, tenantId, tenantName, role, name } = session.user;
  return { userId: id, tenantId, tenantName, role, name: name ?? "" };
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
