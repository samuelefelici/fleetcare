/**
 * Concorrenza, su un Postgres vero: due transazioni che registrano insieme
 * due adempimenti della stessa scadenza (l'amministrazione e il
 * responsabile mezzi, nello stesso momento). Il ricalcolo della scadenza
 * deve vedere entrambi: senza il lock sulla scadenza in
 * `sync_deadline_from_completions`, la seconda transazione scriverebbe la
 * scadenza calcolata senza il primo adempimento.
 *
 * Servono transazioni confermate, quindi il test usa un'associazione sua e
 * la cancella alla fine (e all'inizio, se un'esecuzione precedente si è
 * interrotta).
 *
 *   DATABASE_ADMIN_URL=postgres://… pnpm --filter @fleetcare/db test:db
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL mancante: questo test gira su un database vero");

const sql = postgres(url, { max: 4, onnotice: () => {} });

const TENANT = "e0000000-0000-0000-0000-0000000000c1";
const PROFILE = "e0000000-0000-0000-0000-0000000000c2";
const VEHICLE = "e0000000-0000-0000-0000-0000000000c3";
const TYPE = "e0000000-0000-0000-0000-0000000000c4";
const DEADLINE = "e0000000-0000-0000-0000-0000000000c5";

async function cleanup() {
  await sql.begin(async (tx) => {
    for (const table of [
      "deadline_completions",
      "deadlines",
      "deadline_types",
      "vehicles",
      "profiles",
      "audit_logs",
    ]) {
      await tx`delete from fleetcare.${tx(table)} where tenant_id = ${TENANT}`;
    }
    await tx`delete from fleetcare.tenants where id = ${TENANT}`;
  });
}

async function waitUntilBlocked(pid: number) {
  for (let i = 0; i < 200; i++) {
    const [row] = await sql`select wait_event_type from pg_stat_activity where pid = ${pid}`;
    if (row?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("la seconda transazione non si è mai messa in attesa");
}

beforeAll(async () => {
  await cleanup();
  await sql`insert into fleetcare.tenants (id, name, slug) values (${TENANT}, 'Concorrenza', 'concorrenza-dbtest')`;
  await sql`insert into fleetcare.profiles (id, tenant_id, full_name, role)
            values (${PROFILE}, ${TENANT}, 'Responsabile', 'fleet_manager')`;
  await sql`insert into fleetcare.vehicles (id, tenant_id, internal_code, plate, category)
            values (${VEHICLE}, ${TENANT}, 'C1', 'CC111CC', 'emergency_ambulance')`;
  await sql`insert into fleetcare.deadline_types (id, tenant_id, code, label, subject, interval_months)
            values (${TYPE}, ${TENANT}, 'revisione', 'Revisione', 'vehicle', 12)`;
  await sql`insert into fleetcare.deadlines (id, tenant_id, deadline_type_id, vehicle_id, due_on)
            values (${DEADLINE}, ${TENANT}, ${TYPE}, ${VEHICLE}, '2026-12-31')`;
});

afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe("adempimenti registrati insieme sulla stessa scadenza", () => {
  it("la scadenza tiene conto di entrambi", async () => {
    const t1 = await sql.reserve();
    const t2 = await sql.reserve();
    try {
      await t1`begin`;
      await t2`begin`;
      // il più recente lo registra la prima transazione, che resta aperta
      await t1`insert into fleetcare.deadline_completions
                 (tenant_id, deadline_id, done_on, next_due_on, recorded_by_id)
               values (${TENANT}, ${DEADLINE}, '2026-09-20', '2027-09-20', ${PROFILE})`;
      const [backend] = await t2`select pg_backend_pid() as pid`;
      const second = t2`insert into fleetcare.deadline_completions
                          (tenant_id, deadline_id, done_on, next_due_on, recorded_by_id)
                        values (${TENANT}, ${DEADLINE}, '2026-09-10', '2027-09-10', ${PROFILE})`.execute();
      await waitUntilBlocked(backend!.pid as number);
      await t1`commit`;
      await second;
      await t2`commit`;
    } finally {
      t1.release();
      t2.release();
    }
    const [deadline] = await sql`
      select due_on::text, last_done_on::text from fleetcare.deadlines where id = ${DEADLINE}`;
    expect(deadline).toEqual({ due_on: "2027-09-20", last_done_on: "2026-09-20" });
  });
});
