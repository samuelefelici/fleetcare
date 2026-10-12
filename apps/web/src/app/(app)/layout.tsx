import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { parseSidebar, SIDEBAR_COOKIE, type NavItem } from "@/components/shell-logic";
import { signOut } from "@/server/auth";
import { ROLE_LABELS, STAFF, UnauthorizedError, requireSession } from "@/server/db";

const NAV = [
  { href: "/mezzi", label: "Mezzi", icon: "mezzi", staffOnly: false },
  { href: "/scadenze", label: "Scadenze", icon: "scadenze", staffOnly: false },
  { href: "/attrezzature", label: "Attrezzature", icon: "attrezzature", staffOnly: false },
  { href: "/persone", label: "Persone", icon: "persone", staffOnly: true },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // La sessione verificata sulla rubrica: il ruolo è quello di adesso, non
  // quello del momento dell'accesso; chi è stato disattivato viene fatto uscire.
  const user = await requireSession().catch((error: unknown) =>
    error instanceof UnauthorizedError ? null : Promise.reject(error),
  );
  if (!user) redirect("/login");
  const items: NavItem[] = NAV.filter((n) => !n.staffOnly || STAFF.includes(user.role)).map(
    ({ href, label, icon }) => ({ href, label, icon }),
  );
  // la barra ridotta o estesa, com'era l'ultima volta (vedi shell-logic.ts)
  const sidebar = parseSidebar((await cookies()).get(SIDEBAR_COOKIE)?.value);

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      items={items}
      sidebar={sidebar}
      tenantName={user.tenantName}
      userName={user.name}
      roleLabel={ROLE_LABELS[user.role]}
      logout={logout}
    >
      {children}
    </AppShell>
  );
}
