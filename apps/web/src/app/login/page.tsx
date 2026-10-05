import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { loginAction } from "./actions";
import { decodeChoices } from "./choices";

export const metadata: Metadata = { title: "Accedi" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; scegli?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const params = await searchParams;
  const choices = decodeChoices(params.scegli);

  return (
    <main className="touch flex min-h-dvh items-center justify-center bg-zinc-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-xl bg-brand text-xl font-black text-brand-ink"
          >
            +
          </span>
          <div>
            <h1 className="text-xl font-bold">FleetCare</h1>
            <p className="text-sm text-zinc-500">Il parco mezzi dell'associazione</p>
          </div>
        </div>

        {params.error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
            {params.error === "disattivata"
              ? "La tua utenza è stata disattivata: chiedi alla direzione."
              : "Email o password non giuste. Riprova."}
          </p>
        )}
        {choices.length > 1 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-warn">
            Sei in più di un'associazione: scegli quale, e rimetti la password.
          </p>
        )}

        <form action={loginAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={params.email ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          {choices.length > 1 && (
            <div>
              <label htmlFor="tenant" className="mb-1 block text-sm font-medium">
                Associazione
              </label>
              <select
                id="tenant"
                name="tenant"
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
              >
                {choices.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-amber-400"
          >
            Entra
          </button>
        </form>
      </div>
    </main>
  );
}
