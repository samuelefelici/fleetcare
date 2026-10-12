/**
 * La pagina di accesso. Da 1024 px in su: il modulo a sinistra, largo
 * clamp(400px, 34vw, 520px), e la hero a destra, che sfuma nel grafite.
 * Sotto i 1024 px: il modulo a tutto schermo e la hero come banda alta
 * 28vh sopra. Il modulo è reso dal server e funziona prima del JavaScript.
 *
 * Logica, campi e azione sono quelli di prima: cambia solo la presentazione.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IconCross } from "@/components/icons";
import { todayRome } from "@/lib/format";
import { auth } from "@/server/auth";
import pkg from "../../../package.json";
import { loginAction } from "./actions";
import { decodeChoices } from "./choices";
import { LoginHero } from "./hero";
import { LoginForm } from "./login-form";
import { loginError } from "./validazione";

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
    <main className="touch grid min-h-dvh lg:grid-cols-[clamp(400px,34vw,520px)_minmax(0,1fr)]">
      <section className="griglia-tecnica z-10 flex min-h-[72dvh] flex-col bg-surface px-6 pt-8 pb-6 sm:px-10 lg:min-h-dvh lg:pt-10">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent text-on-accent"
          >
            <IconCross className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="title-display text-32 leading-none">FleetCare</p>
            <p className="mt-1 text-13 text-fg-secondary">
              Gestione parco mezzi per l&apos;emergenza sanitaria
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="mb-6 text-24 font-semibold">Accedi</h1>
            <LoginForm
              action={loginAction}
              email={params.email ?? ""}
              choices={choices}
              error={loginError(params.error)}
            />
          </div>
        </div>

        <footer className="text-12 text-fg-secondary tabular">
          FleetCare {pkg.version} · {todayRome().slice(0, 4)}
        </footer>
      </section>
      <div className="order-first lg:order-none">
        <LoginHero />
      </div>
    </main>
  );
}
