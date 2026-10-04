/**
 * L'healthcheck del container (Dockerfile) e di Coolify: l'autocontrollo
 * dell'installazione con la connessione dell'app (utenza giusta, RLS,
 * permessi, policy). Fuori va solo l'esito e il nome dei controlli che non
 * passano; il dettaglio va nei log quando l'esito cambia.
 */
import { NextResponse } from "next/server";
import { getSql } from "@fleetcare/db/client";
import { describeSelfCheck, selfCheck } from "@fleetcare/db/ops/selfcheck";
import { env } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let lastOk: boolean | null = null;

export async function GET() {
  const result = await selfCheck(getSql(env.DATABASE_URL));
  if (result.ok !== lastOk) {
    lastOk = result.ok;
    console.log(
      `[fleetcare] autocontrollo ${result.ok ? "ok" : "NON superato"}:\n${describeSelfCheck(result)}`,
    );
  }
  return NextResponse.json(
    result.ok
      ? { ok: true }
      : { ok: false, failing: result.checks.filter((c) => !c.ok).map((c) => c.name) },
    { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
