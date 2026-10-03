import { describe, expect, it } from "vitest";
import {
  addMonths,
  evaluateDeadline,
  nextDue,
  planDeadlines,
  resolveRule,
  semaphore,
  type PlannableRule,
} from "../src/domain/deadlines";

describe("addMonths", () => {
  it("si ferma all'ultimo giorno del mese più corto", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // bisestile
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  });
  it("attraversa gli anni", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-10", 120)).toBe("2036-03-10");
  });
});

describe("nextDue", () => {
  it("revisione: un anno dopo, a fine mese", () => {
    expect(nextDue("2026-03-10", null, { months: 12, monthEnd: true })).toEqual({
      dueOn: "2027-03-31",
      dueKm: null,
    });
  });
  it("tagliando: tempo e km insieme", () => {
    expect(nextDue("2026-05-02", 61_250, { months: 12, km: 30_000 })).toEqual({
      dueOn: "2027-05-02",
      dueKm: 91_250,
    });
  });
  it("km senza lettura del contachilometri: niente scadenza a km", () => {
    expect(nextDue("2026-05-02", null, { km: 30_000 })).toEqual({ dueOn: null, dueKm: null });
  });
  it("sanificazione: periodicità in giorni", () => {
    expect(nextDue("2026-12-20", null, { days: 30 })).toEqual({ dueOn: "2027-01-19", dueKm: null });
  });
  it("elettrodi: nessuna periodicità, la data si legge dalla confezione", () => {
    expect(nextDue("2026-05-02", null, {})).toEqual({ dueOn: null, dueKm: null });
  });
  it("rifiuta mesi e giorni insieme", () => {
    expect(() => nextDue("2026-05-02", null, { months: 1, days: 30 })).toThrow();
  });
});

describe("evaluateDeadline", () => {
  const base = { dueKm: null, alertDays: 30, alertKm: null };

  it("il giorno della scadenza è ancora valido, il giorno dopo no", () => {
    expect(evaluateDeadline({ ...base, dueOn: "2026-10-03" }, "2026-10-03", null)).toMatchObject({
      state: "expiring",
      daysLeft: 0,
    });
    expect(evaluateDeadline({ ...base, dueOn: "2026-10-03" }, "2026-10-04", null)).toMatchObject({
      state: "expired",
      daysLeft: -1,
    });
  });

  it("preavviso: dentro è expiring, fuori è ok", () => {
    expect(evaluateDeadline({ ...base, dueOn: "2026-11-02" }, "2026-10-03", null).state).toBe(
      "expiring",
    );
    expect(evaluateDeadline({ ...base, dueOn: "2026-11-03" }, "2026-10-03", null).state).toBe("ok");
  });

  it("senza data né km la scadenza è da completare, non in regola", () => {
    expect(evaluateDeadline({ ...base, dueOn: null }, "2026-10-03", 10_000).state).toBe("missing");
  });

  it("tagliando: vale il primo raggiunto (qui i km)", () => {
    const tagliando = { dueOn: "2027-05-02", dueKm: 91_250, alertDays: 30, alertKm: 2_000 };
    expect(evaluateDeadline(tagliando, "2026-10-03", 89_500)).toMatchObject({
      state: "expiring",
      kmLeft: 1_750,
      trigger: "km",
    });
    expect(evaluateDeadline(tagliando, "2026-10-03", 91_300)).toMatchObject({
      state: "expired",
      trigger: "km",
    });
    expect(evaluateDeadline(tagliando, "2026-10-03", 60_000)).toMatchObject({
      state: "ok",
      trigger: "date",
    });
  });

  it("contachilometri non noto: si valuta solo la data", () => {
    const tagliando = { dueOn: "2027-05-02", dueKm: 91_250, alertDays: 30, alertKm: 2_000 };
    expect(evaluateDeadline(tagliando, "2026-10-03", null)).toMatchObject({
      state: "ok",
      kmLeft: null,
    });
  });
});

describe("semaphore", () => {
  it("rosso solo se una scadenza BLOCCANTE è superata", () => {
    expect(semaphore([{ state: "expired", blocking: true }])).toEqual({
      color: "red",
      blocked: true,
    });
    expect(semaphore([{ state: "expired", blocking: false }])).toEqual({
      color: "yellow",
      blocked: false,
    });
  });
  it("una data mancante è gialla", () => {
    expect(
      semaphore([
        { state: "ok", blocking: true },
        { state: "missing", blocking: true },
      ]).color,
    ).toBe("yellow");
  });
  it("tutto in regola è verde", () => {
    expect(semaphore([{ state: "ok", blocking: true }]).color).toBe("green");
    expect(semaphore([]).color).toBe("green");
  });
});

describe("resolveRule", () => {
  const revisione = {
    intervalMonths: 12,
    intervalDays: null,
    intervalKm: null,
    alertDays: 60,
    alertKm: null,
    blocking: true,
  };

  it("i campi nulli della regola ereditano dal tipo", () => {
    expect(resolveRule(revisione, {})).toEqual(revisione);
    expect(resolveRule(revisione, { intervalMonths: 24 })).toEqual({
      ...revisione,
      intervalMonths: 24,
    });
  });

  it("una regola in giorni toglie i mesi del tipo", () => {
    expect(resolveRule(revisione, { intervalDays: 30 })).toMatchObject({
      intervalMonths: null,
      intervalDays: 30,
    });
  });

  it("la regola può rendere bloccante una scadenza che di tipo non lo è", () => {
    expect(resolveRule({ ...revisione, blocking: false }, { blocking: true }).blocking).toBe(true);
  });
});

describe("planDeadlines", () => {
  const type = (over: Partial<PlannableRule["type"]> = {}): PlannableRule["type"] => ({
    intervalMonths: 12,
    intervalDays: null,
    intervalKm: null,
    alertDays: 30,
    alertKm: null,
    blocking: false,
    archived: false,
    ...over,
  });
  const rule = (over: Partial<PlannableRule>): PlannableRule => ({
    deadlineTypeId: "t",
    deadlineTypeCode: "t",
    vehicleCategory: null,
    equipmentTypeId: null,
    ownershipKinds: null,
    type: type(),
    ...over,
  });

  const vehicleRules = [
    rule({
      deadlineTypeId: "rev",
      deadlineTypeCode: "revisione",
      vehicleCategory: "emergency_ambulance",
    }),
    rule({
      deadlineTypeId: "bol",
      deadlineTypeCode: "bollo",
      vehicleCategory: "emergency_ambulance",
    }),
    rule({
      deadlineTypeId: "rev",
      deadlineTypeCode: "revisione",
      vehicleCategory: "medical_car",
      intervalMonths: 24,
    }),
  ];

  it("prende le regole della categoria, con i valori risolti", () => {
    const out = planDeadlines(
      { kind: "vehicle", category: "medical_car", bolloExempt: false },
      vehicleRules,
    );
    expect(out).toEqual([expect.objectContaining({ deadlineTypeId: "rev", intervalMonths: 24 })]);
  });

  it("un mezzo esente non riceve il bollo", () => {
    const ids = (bolloExempt: boolean) =>
      planDeadlines(
        { kind: "vehicle", category: "emergency_ambulance", bolloExempt },
        vehicleRules,
      ).map((d) => d.deadlineTypeId);
    expect(ids(false)).toEqual(["rev", "bol"]);
    expect(ids(true)).toEqual(["rev"]);
  });

  it("la proprietà decide: il collaudo nasce solo per le bombole dell'associazione", () => {
    const rules = [
      rule({ deadlineTypeId: "col", equipmentTypeId: "o2", ownershipKinds: ["owned"] }),
      rule({ deadlineTypeId: "gas", equipmentTypeId: "o2" }),
    ];
    const ids = (ownership: string) =>
      planDeadlines({ kind: "equipment", equipmentTypeId: "o2", ownership }, rules).map(
        (d) => d.deadlineTypeId,
      );
    expect(ids("owned")).toEqual(["col", "gas"]);
    expect(ids("rented")).toEqual(["gas"]);
  });

  it("un tipo eliminato (archiviato) non genera più scadenze", () => {
    const rules = [rule({ equipmentTypeId: "dae", type: type({ archived: true }) })];
    expect(
      planDeadlines({ kind: "equipment", equipmentTypeId: "dae", ownership: "owned" }, rules),
    ).toEqual([]);
  });
});
