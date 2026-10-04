/**
 * L'avvio del container, su un Postgres vero: la password cifrata che
 * prepare.ts scrive per fleetcare_app è quella che Postgres stesso
 * calcolerebbe, e l'autocontrollo si accorge di ogni installazione
 * sbagliata (utenza dell'amministratore, grant o policy persi in un
 * restore, RLS spenta, tabelle temporanee permesse).
 *
 *   DATABASE_ADMIN_URL=postgres://… pnpm --filter @fleetcare/db test:db
 *
 * Ogni guasto si prova in una transazione chiusa da ROLLBACK.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { localMigrations, migrationState } from "../src/ops/migrations";
import { scramSha256Verifier } from "../src/ops/scram";
import { selfCheck } from "../src/ops/selfcheck";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL mancante: questo test gira su un database vero");

const sql = postgres(url, { max: 2, onnotice: () => {} });

afterAll(async () => {
  await sql.end();
});

/** L'autocontrollo come lo vede fleetcare_app, dopo aver guastato qualcosa (poi annullato). */
async function checkAfter(breakIt: (tx: postgres.ReservedSql) => Promise<unknown>) {
  const tx = await sql.reserve();
  try {
    await tx`begin`;
    await breakIt(tx);
    await tx`set local role fleetcare_app`;
    const result = await selfCheck(tx);
    return Object.fromEntries(result.checks.map((c) => [c.name, c.ok]));
  } finally {
    await tx`rollback`;
    tx.release();
  }
}

describe("password del ruolo applicativo", () => {
  it("il verifier SCRAM coincide con quello che calcola Postgres", async () => {
    const tx = await sql.reserve();
    try {
      await tx`begin`;
      await tx`set local password_encryption = 'scram-sha-256'`;
      await tx.unsafe(
        `create role fleetcare_scram_test password 'Una password: con @, % e spazi!'`,
      );
      const [row] = await tx<{ verifier: string }[]>`
        select rolpassword as verifier from pg_authid where rolname = 'fleetcare_scram_test'`;
      // SCRAM-SHA-256$<iterazioni>:<sale>$<StoredKey>:<ServerKey>
      const match = /^SCRAM-SHA-256\$(\d+):([^$]+)\$/.exec(row!.verifier);
      expect(match).not.toBeNull();
      const ours = scramSha256Verifier(
        "Una password: con @, % e spazi!",
        Buffer.from(match![2]!, "base64"),
        Number(match![1]),
      );
      expect(ours).toBe(row!.verifier);
    } finally {
      await tx`rollback`;
      tx.release();
    }
  });

  it("una password non ASCII si rifiuta invece di produrre un verifier che non combacia", () => {
    expect(() => scramSha256Verifier("Pàssword")).toThrow(/ASCII/);
  });
});

describe("autocontrollo dell'installazione", () => {
  it("installazione a posto: tutto ok", async () => {
    const checks = await checkAfter(async () => {});
    expect(checks).toEqual({
      database: true,
      "ruolo applicativo": true,
      "oggetti temporanei": true,
      permessi: true,
      policy: true,
      RLS: true,
    });
  });

  it("l'app collegata con l'utenza dell'amministratore", async () => {
    const tx = await sql.reserve();
    try {
      const result = await selfCheck(tx);
      expect(result.ok).toBe(false);
      expect(result.checks.find((c) => c.name === "ruolo applicativo")?.ok).toBe(false);
    } finally {
      tx.release();
    }
  });

  it("grant persi (restore con il ruolo creato dopo)", async () => {
    const checks = await checkAfter(
      (tx) => tx`revoke select on fleetcare.vehicles from fleetcare_app`,
    );
    expect(checks.permessi).toBe(false);
  });

  it("schema non accessibile", async () => {
    const checks = await checkAfter(
      (tx) => tx`revoke usage on schema fleetcare from fleetcare_app`,
    );
    expect(checks.permessi).toBe(false);
  });

  it("policy perse", async () => {
    const checks = await checkAfter(
      (tx) => tx`drop policy tenant_isolation on fleetcare.fuel_logs`,
    );
    expect(checks.policy).toBe(false);
  });

  it("RLS spenta su una tabella", async () => {
    const checks = await checkAfter(
      (tx) => tx`alter table fleetcare.deadlines disable row level security`,
    );
    expect(checks.RLS).toBe(false);
  });

  it("tabelle temporanee di nuovo permesse (restore in un database nuovo)", async () => {
    const checks = await checkAfter(async (tx) => {
      const [db] = await tx<{ name: string }[]>`select current_database() as name`;
      await tx.unsafe(`grant temporary on database "${db!.name}" to public`);
    });
    expect(checks["oggetti temporanei"]).toBe(false);
  });
});

describe("controllo delle migration prima di applicarle", () => {
  const folder = new URL("../migrations", import.meta.url).pathname;
  const local = localMigrations(folder);

  /** lo stato come lo vede prepare.ts, dopo aver manomesso il diario del database (poi annullato) */
  async function stateAfter(
    breakIt: (tx: postgres.ReservedSql) => Promise<unknown>,
    migrations = local,
  ) {
    const tx = await sql.reserve();
    try {
      await tx`begin`;
      await breakIt(tx);
      return await migrationState(tx, migrations);
    } finally {
      await tx`rollback`;
      tx.release();
    }
  }

  it("database allineato: niente da fare", async () => {
    const state = await stateAfter(async () => {});
    expect(state).toEqual({ applied: local.length, changed: [], skipped: [], pending: [] });
  });

  it("una migration già applicata e poi modificata viene riconosciuta", async () => {
    const state = await stateAfter(
      (tx) => tx`update drizzle.__drizzle_migrations set hash = 'manomessa'
                  where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`,
    );
    expect(state.changed).toEqual([local.at(-1)!.tag]);
  });

  it("una migration più vecchia dell'ultima applicata verrebbe saltata da drizzle", async () => {
    const vecchia = { tag: "0002_vecchia", when: local[0]!.when + 1, hash: "x" };
    const state = await stateAfter(async () => {}, [...local, vecchia]);
    expect(state.skipped).toEqual(["0002_vecchia"]);
    expect(state.pending).toEqual([]);
  });

  it("una migration nuova è da applicare", async () => {
    const nuova = { tag: "0002_nuova", when: local.at(-1)!.when + 1, hash: "x" };
    const state = await stateAfter(async () => {}, [...local, nuova]);
    expect(state.pending).toEqual(["0002_nuova"]);
  });

  it("database nuovo: tutto da applicare", async () => {
    const state = await stateAfter(
      (tx) => tx`alter table drizzle.__drizzle_migrations rename to nascosta`,
    );
    expect(state).toEqual({
      applied: 0,
      changed: [],
      skipped: [],
      pending: local.map((m) => m.tag),
    });
  });
});
