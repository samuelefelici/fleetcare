/**
 * Le letture di persone e utenze. Passano tutte da una transazione di
 * `run` (withTenant): la RLS mostra la rubrica a tutti, e di
 * `profile_accounts` solo la propria riga (la direzione tutte). Quindi un
 * left join senza riga dell'utenza vuol dire «non ha l'utenza» per la
 * direzione e per sé stessi, e «non la puoi vedere» per gli altri: lo
 * distingue la pagina, con il ruolo della sessione.
 */
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import * as schema from "@fleetcare/db";
import type { TenantTx } from "@fleetcare/db/client";

const accountOfProfile = and(
  eq(schema.profileAccounts.profileId, schema.profiles.id),
  eq(schema.profileAccounts.tenantId, schema.profiles.tenantId),
);

/** La rubrica, per nome; di norma solo le persone attive. */
export async function listPeople(tx: TenantTx, includeInactive: boolean) {
  return tx
    .select({
      id: schema.profiles.id,
      fullName: schema.profiles.fullName,
      role: schema.profiles.role,
      badgeNumber: schema.profiles.badgeNumber,
      isDriver: schema.profiles.isDriver,
      active: schema.profiles.active,
      email: schema.profileAccounts.email,
    })
    .from(schema.profiles)
    .leftJoin(schema.profileAccounts, accountOfProfile)
    .where(includeInactive ? undefined : eq(schema.profiles.active, true))
    .orderBy(asc(schema.profiles.fullName), asc(schema.profiles.id));
}

export type PersonRow = Awaited<ReturnType<typeof listPeople>>[number];

/** Una persona con la sua utenza, se c'è e se la sessione la può vedere. */
export async function getPerson(tx: TenantTx, id: string) {
  const [row] = await tx
    .select({
      id: schema.profiles.id,
      fullName: schema.profiles.fullName,
      role: schema.profiles.role,
      badgeNumber: schema.profiles.badgeNumber,
      isDriver: schema.profiles.isDriver,
      active: schema.profiles.active,
      createdAt: schema.profiles.createdAt,
      hasAccount: sql<boolean>`${schema.profileAccounts.profileId} is not null`,
      email: schema.profileAccounts.email,
      phone: schema.profileAccounts.phone,
      hasPassword: sql<boolean>`${schema.profileAccounts.passwordHash} is not null`,
      lastLoginAt: schema.profileAccounts.lastLoginAt,
    })
    .from(schema.profiles)
    .leftJoin(schema.profileAccounts, accountOfProfile)
    .where(eq(schema.profiles.id, id))
    .limit(1);
  return row ?? null;
}

export type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPerson>>>;
