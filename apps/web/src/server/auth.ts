/**
 * Accesso con email e password (Auth.js v5, sessione in un cookie JWT).
 *
 * L'utenza si cerca in tutte le associazioni (`auth_find_accounts`, la
 * funzione SECURITY DEFINER della migration 0002): la stessa persona può
 * stare in due Croci. Se la password è giusta per più di una, la pagina di
 * login chiede quale, e il provider riceve anche `tenant`. La password si
 * verifica con `verifyPassword` di @fleetcare/db (scrypt).
 *
 * In sessione finiscono solo id, associazione e ruolo: le policy del
 * database li leggono da `withTenant`, a ogni transazione.
 */
import { eq, sql } from "drizzle-orm";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import * as schema from "@fleetcare/db";
import { getDb, withTenant, type ProfileRole } from "@fleetcare/db/client";
import { verifyPassword } from "@fleetcare/db/ops/password";
import { env } from "@/env";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      tenantName: string;
      role: ProfileRole;
    } & DefaultSession["user"];
  }
  interface User {
    tenantId: string;
    tenantName: string;
    role: ProfileRole;
  }
}

/** una riga di `fleetcare.auth_find_accounts` (type e non interface: `execute<T>` vuole l'index signature) */
export type LoginAccount = {
  profile_id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  role: ProfileRole;
  full_name: string;
  password_hash: string | null;
  active: boolean;
};

/** Le utenze attive per cui email e password sono giuste (di norma una; più di una = stessa persona in due associazioni). */
export async function findLoginAccounts(
  email: string,
  password: string,
  tenantSlug?: string,
): Promise<LoginAccount[]> {
  const rows = await getDb(env.DATABASE_URL).execute<LoginAccount>(
    sql`select * from fleetcare.auth_find_accounts(${email})`,
  );
  return [...rows].filter(
    (a) =>
      a.active &&
      (!tenantSlug || a.tenant_slug === tenantSlug) &&
      verifyPassword(password, a.password_hash),
  );
}

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  tenant: z.string().trim().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, tenant: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, tenant } = parsed.data;
        const matches = await findLoginAccounts(email, password, tenant || undefined);
        if (matches.length !== 1) return null;
        const account = matches[0]!;
        try {
          await withTenant(
            getDb(env.DATABASE_URL),
            { tenantId: account.tenant_id, userId: account.profile_id, role: account.role },
            (tx) =>
              tx
                .update(schema.profileAccounts)
                .set({ lastLoginAt: new Date() })
                .where(eq(schema.profileAccounts.profileId, account.profile_id)),
          );
        } catch (error) {
          console.error("[auth] ultimo accesso non registrato:", (error as Error).message);
        }
        return {
          id: account.profile_id,
          name: account.full_name,
          email,
          tenantId: account.tenant_id,
          tenantName: account.tenant_name,
          role: account.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId;
        token.tenantName = user.tenantName;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.tenantId = token.tenantId as string;
      session.user.tenantName = token.tenantName as string;
      session.user.role = token.role as ProfileRole;
      return session;
    },
  },
});
