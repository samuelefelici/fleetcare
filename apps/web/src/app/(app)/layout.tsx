import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/server/auth";
import { ROLE_LABELS, STAFF, UnauthorizedError, requireSession } from "@/server/db";

const NAV = [
  { href: "/mezzi", label: "Mezzi", staffOnly: false },
  { href: "/scadenze", label: "Scadenze", staffOnly: false },
  { href: "/attrezzature", label: "Attrezzature", staffOnly: false },
  { href: "/persone", label: "Persone", staffOnly: true },
  { href: "/profilo", label: "Il mio profilo", staffOnly: false },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // La sessione verificata sulla rubrica: il ruolo è quello di adesso, non
  // quello del momento dell'accesso; chi è stato disattivato viene fatto uscire.
  const user = await requireSession().catch((error: unknown) =>
    error instanceof UnauthorizedError ? null : Promise.reject(error),
  );
  if (!user) redirect("/login");
  const items = NAV.filter((n) => !n.staffOnly || STAFF.includes(user.role));

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="touch min-h-dvh md:flex">
      <aside className="border-b border-zinc-200 bg-white md:flex md:w-64 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-5 py-4">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-brand text-lg font-black text-brand-ink"
          >
            +
          </span>
          <div className="min-w-0">
            <div className="font-bold leading-tight">FleetCare</div>
            <div className="truncate text-xs text-zinc-500">{user.tenantName}</div>
          </div>
        </div>
        <nav
          aria-label="Sezioni"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0"
        >
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-zinc-700 hover:bg-zinc-100"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-3 md:mt-auto md:block md:py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-xs text-zinc-500">{ROLE_LABELS[user.role]}</div>
          </div>
          <form action={logout} className="md:mt-3">
            <button type="submit" className="text-sm text-zinc-600 underline hover:text-zinc-900">
              Esci
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
