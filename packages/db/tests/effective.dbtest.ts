/**
 * Parità fra il database e il motore TypeScript, su un Postgres vero.
 *
 * Alcune regole esistono in due copie, perché servono sia al database (che
 * le impone) sia all'app (che le mostra e le pianifica):
 *  - la vista `deadlines_effective` e `effectiveDeadline`: la catena
 *    scadenza → regola → tipo;
 *  - `compute_next_due` e `nextDue`: la prossima scadenza dopo un
 *    adempimento (senza rinnovo dalla scadenza, che il database non usa);
 *  - gli indici unici di `vehicles` e `normalizeVehicleCode` /
 *    `normalizePlate`: quando due codici sono lo stesso mezzo.
 * Se una copia cambia da sola, questo test fallisce.
 *
 *   DATABASE_ADMIN_URL=postgres://… pnpm --filter @fleetcare/db test:db
 *
 * Gira su un database migrato, in una transazione chiusa da ROLLBACK.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  effectiveDeadline,
  nextDue,
  type DeadlineOverrides,
  type DeadlineTypeDefaults,
} from "../src/domain/deadlines";
import { normalizePlate, normalizeVehicleCode } from "../src/domain/fuel-reconciliation";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL mancante: questo test gira su un database vero");

const sql = postgres(url, { max: 1, onnotice: () => {} });
let tx: postgres.ReservedSql;

beforeAll(async () => {
  tx = await sql.reserve();
  await tx`begin`;
});

afterAll(async () => {
  await tx`rollback`;
  tx.release();
  await sql.end();
});

// ---------- casi generati in modo deterministico ----------

type Rng = () => number;

function rng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pick<T>(r: Rng, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!;
}

type Level = { [K in keyof DeadlineTypeDefaults]: DeadlineTypeDefaults[K] | null };

const TIMES: ReadonlyArray<readonly [number | null, number | null]> = [
  [12, null],
  [1, null],
  [24, null],
  [null, 30],
  [null, 7],
  [null, 365],
];

/** Un livello (tipo, regola o scadenza): ogni campo è nullo con probabilità `pNull`. */
function level(r: Rng, pNull: number): Level {
  const blank = () => r() < pNull;
  const [intervalMonths, intervalDays] = blank() ? [null, null] : pick(r, TIMES);
  return {
    intervalMonths,
    intervalDays,
    intervalKm: blank() ? null : pick(r, [5000, 30000, 100000]),
    alertDays: blank() ? null : pick(r, [0, 15, 30, 60]),
    alertKm: blank() ? null : pick(r, [0, 1000, 2000]),
    blocking: blank() ? null : r() < 0.5,
  };
}

interface Case {
  subject: "vehicle" | "equipment";
  type: DeadlineTypeDefaults;
  monthEnd: boolean;
  /** la regola per la categoria del mezzo o il tipo dell'attrezzatura */
  rule: Level | null;
  /** una regola per un'altra categoria o un altro tipo: non deve contare */
  decoy: Level | null;
  deadline: Level;
}

function makeCases(count: number): Case[] {
  const r = rng(20261003);
  return Array.from({ length: count }, () => {
    const t = level(r, 0.3);
    return {
      subject: r() < 0.6 ? "vehicle" : "equipment",
      type: { ...t, alertDays: t.alertDays ?? 30, blocking: t.blocking ?? false },
      monthEnd: r() < 0.3,
      rule: r() < 0.6 ? level(r, 0.5) : null,
      decoy: r() < 0.3 ? level(r, 0.2) : null,
      deadline: level(r, 0.7),
    };
  });
}

const CASES = makeCases(400);
const DONE_ON = ["2024-01-31", "2024-02-29", "2025-11-30", "2026-03-15", "2026-12-31"];

const TENANT = "e0000000-0000-0000-0000-000000000001";
const CODES_TENANT = "e0000000-0000-0000-0000-000000000002";

function toOverrides(l: Level | null): DeadlineOverrides | null {
  return l && { ...l };
}

describe("scadenze: database e TypeScript calcolano gli stessi valori", () => {
  const ids: string[] = [];

  beforeAll(async () => {
    await tx`insert into fleetcare.tenants (id, name, slug) values (${TENANT}, 'Parità', 'parita-dbtest')`;
    const [vehicle] = await tx`
      insert into fleetcare.vehicles (tenant_id, internal_code, plate, category)
      values (${TENANT}, 'P1', 'PP111PP', 'emergency_ambulance') returning id`;
    const [kind] = await tx`
      insert into fleetcare.equipment_types (tenant_id, code, label, "group")
      values (${TENANT}, 'dae', 'DAE', 'electromedical') returning id`;
    const [otherKind] = await tx`
      insert into fleetcare.equipment_types (tenant_id, code, label, "group")
      values (${TENANT}, 'aspiratore', 'Aspiratore', 'electromedical') returning id`;
    const [item] = await tx`
      insert into fleetcare.equipment (tenant_id, equipment_type_id, vehicle_id, serial_number)
      values (${TENANT}, ${kind!.id}, ${vehicle!.id}, 'SN-P1') returning id`;

    for (const [i, c] of CASES.entries()) {
      const [type] = await tx`
        insert into fleetcare.deadline_types
          (tenant_id, code, label, subject, interval_months, interval_days, interval_km,
           alert_days, alert_km, blocking, month_end)
        values (${TENANT}, ${"t" + i}, ${"Tipo " + i}, ${c.subject},
                ${c.type.intervalMonths}, ${c.type.intervalDays}, ${c.type.intervalKm},
                ${c.type.alertDays}, ${c.type.alertKm}, ${c.type.blocking}, ${c.monthEnd})
        returning id`;
      const rules: Array<[Level, string | null, string | null]> = [];
      if (c.rule) {
        rules.push(
          c.subject === "vehicle"
            ? [c.rule, "emergency_ambulance", null]
            : [c.rule, null, kind!.id as string],
        );
      }
      if (c.decoy) {
        rules.push(
          c.subject === "vehicle"
            ? [c.decoy, "medical_car", null]
            : [c.decoy, null, otherKind!.id as string],
        );
      }
      for (const [l, category, equipmentType] of rules) {
        await tx`
          insert into fleetcare.deadline_rules
            (tenant_id, deadline_type_id, vehicle_category, equipment_type_id,
             interval_months, interval_days, interval_km, alert_days, alert_km, blocking)
          values (${TENANT}, ${type!.id}, ${category}, ${equipmentType},
                  ${l.intervalMonths}, ${l.intervalDays}, ${l.intervalKm},
                  ${l.alertDays}, ${l.alertKm}, ${l.blocking})`;
      }
      const d = c.deadline;
      const [deadline] = await tx`
        insert into fleetcare.deadlines
          (tenant_id, deadline_type_id, vehicle_id, equipment_id,
           interval_months, interval_days, interval_km, alert_days, alert_km, blocking)
        values (${TENANT}, ${type!.id},
                ${c.subject === "vehicle" ? vehicle!.id : null},
                ${c.subject === "equipment" ? item!.id : null},
                ${d.intervalMonths}, ${d.intervalDays}, ${d.intervalKm},
                ${d.alertDays}, ${d.alertKm}, ${d.blocking})
        returning id`;
      ids.push(deadline!.id as string);
    }
  });

  it("i casi coprono le combinazioni che contano", () => {
    const count = (f: (c: Case) => boolean) => CASES.filter(f).length;
    // la scadenza fissa i giorni mentre la regola fissa i mesi (e viceversa)
    expect(
      count((c) => c.rule?.intervalMonths != null && c.deadline.intervalDays != null),
    ).toBeGreaterThan(3);
    expect(
      count((c) => c.rule?.intervalDays != null && c.deadline.intervalMonths != null),
    ).toBeGreaterThan(3);
    // la regola fissa solo i km: il tempo resta quello del tipo
    expect(
      count(
        (c) =>
          c.rule != null &&
          c.rule.intervalMonths == null &&
          c.rule.intervalDays == null &&
          c.rule.intervalKm != null &&
          (c.type.intervalMonths != null || c.type.intervalDays != null),
      ),
    ).toBeGreaterThan(3);
    // solo la regola di un'altra categoria o tipo
    expect(count((c) => c.rule == null && c.decoy != null)).toBeGreaterThan(10);
    expect(count((c) => c.subject === "equipment" && c.rule != null)).toBeGreaterThan(10);
    expect(count((c) => c.monthEnd && c.type.intervalMonths != null)).toBeGreaterThan(10);
  });

  it("deadlines_effective = effectiveDeadline", async () => {
    const rows = await tx`
      select id, interval_months, interval_days, interval_km, alert_days, alert_km, blocking
        from fleetcare.deadlines_effective
       where tenant_id = ${TENANT}`;
    const byId = new Map(rows.map((row) => [row.id as string, row]));
    const mismatches = CASES.flatMap((c, i) => {
      const row = byId.get(ids[i]!)!;
      const db: DeadlineTypeDefaults = {
        intervalMonths: row.interval_months,
        intervalDays: row.interval_days,
        intervalKm: row.interval_km,
        alertDays: row.alert_days,
        alertKm: row.alert_km,
        blocking: row.blocking,
      };
      const ts = effectiveDeadline(c.type, toOverrides(c.rule), toOverrides(c.deadline)!);
      return JSON.stringify(db) === JSON.stringify(ts) ? [] : [{ case: i, ...c, db, ts }];
    });
    expect(mismatches).toEqual([]);
  });

  it("compute_next_due = nextDue (mesi o giorni, fine mese)", async () => {
    const rows = await tx`
      select d.id, x.done::text as done, fleetcare.compute_next_due(d.id, x.done)::text as next
        from fleetcare.deadlines d
        cross join unnest(${DONE_ON}::date[]) as x (done)
       where d.tenant_id = ${TENANT}`;
    expect(rows.length).toBe(CASES.length * DONE_ON.length);
    const index = new Map(ids.map((id, i) => [id, i]));
    const mismatches = rows.flatMap((row) => {
      const i = index.get(row.id as string)!;
      const c = CASES[i]!;
      const e = effectiveDeadline(c.type, toOverrides(c.rule), toOverrides(c.deadline)!);
      const ts = nextDue(row.done as string, null, {
        months: e.intervalMonths,
        days: e.intervalDays,
        monthEnd: c.monthEnd,
      }).dueOn;
      return ts === row.next ? [] : [{ case: i, done: row.done, db: row.next, ts }];
    });
    expect(mismatches).toEqual([]);
  });
});

describe("codici dei mezzi: gli indici unici e la normalizzazione TypeScript coincidono", () => {
  type Outcome = "ok" | "duplicate" | "empty";

  beforeAll(async () => {
    await tx`insert into fleetcare.tenants (id, name, slug) values (${CODES_TENANT}, 'Codici', 'codici-dbtest')`;
  });

  /** Inserisce i mezzi uno dopo l'altro e dice come il database ha accolto ciascuno. */
  async function insertAll(values: readonly string[], row: (v: string, i: number) => string[]) {
    const out: Outcome[] = [];
    for (const [i, v] of values.entries()) {
      const [internalCode, plate, fuelCode] = row(v, i);
      await tx`savepoint codice`;
      try {
        await tx`
          insert into fleetcare.vehicles (tenant_id, internal_code, plate, category, fuel_vehicle_code)
          values (${CODES_TENANT}, ${internalCode!}, ${plate!}, 'service_car', ${fuelCode ?? null})`;
        await tx`release savepoint codice`;
        out.push("ok");
      } catch (error) {
        await tx`rollback to savepoint codice`;
        const code = (error as { code?: string }).code;
        if (code === "23505") out.push("duplicate");
        else if (code === "23514") out.push("empty");
        else throw error;
      }
    }
    return out;
  }

  /** Lo stesso esito, previsto dalla funzione TypeScript. */
  function expected(values: readonly string[], normalize: (v: string) => string): Outcome[] {
    const seen = new Set<string>();
    return values.map((v) => {
      const n = normalize(v);
      if (n === "") return "empty";
      if (seen.has(n)) return "duplicate";
      seen.add(n);
      return "ok";
    });
  }

  const CODES = [
    "0042",
    "42",
    "042",
    "A-07",
    "a07",
    "A 7",
    "7",
    "007",
    "0",
    "00",
    "000",
    "1000",
    "0100",
    "100",
    "AB.12.CD",
    "ab12cd",
    " 12 ",
    "12",
    " - ",
    "x",
    "X-",
  ];

  it("matricola del distributore", async () => {
    const got = await insertAll(CODES, (v, i) => [`M${i}`, `MM${i}MM`, v]);
    expect(got).toEqual(expected(CODES, normalizeVehicleCode));
  });

  it("numero interno", async () => {
    const got = await insertAll(CODES, (v, i) => [v, `NN${i}NN`]);
    expect(got).toEqual(expected(CODES, normalizeVehicleCode));
  });

  it("targa (gli zeri iniziali contano)", async () => {
    const PLATES = [
      "AA111AA",
      "aa 111 aa",
      "AA-111-AA",
      "0AA111AA",
      "AB123CD",
      "ab.123.cd",
      "007",
      "7",
      " - ",
    ];
    const got = await insertAll(PLATES, (v, i) => [`T${i}`, v]);
    expect(got).toEqual(expected(PLATES, normalizePlate));
  });
});
