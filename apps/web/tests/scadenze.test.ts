/**
 * La logica pura dello scadenzario: l'ordine per urgenza, i conteggi, i
 * filtri, le frasi, la precompilazione della prossima scadenza, gli schemi
 * dei moduli (vuoto → null, numeri, date, importi) e le frasi per gli
 * errori propri del database.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  compareUrgency,
  countByState,
  defaultFiltro,
  describeAlert,
  describeInterval,
  dueText,
  evaluateRows,
  formValues,
  isCalendarDay,
  listHref,
  matchesFiltro,
  overriddenFields,
  parseEuro,
  parseStatoFiltro,
  prefillNextDue,
  sortByUrgency,
  specialDbMessage,
  stateText,
  subjectHref,
  subjectLabel,
  subjectListHref,
  type DeadlineRowInput,
} from "@/app/(app)/scadenze/logica";
import {
  completionSchema,
  newDeadlineSchema,
  overrideSchema,
  removeSchema,
  setDueSchema,
} from "@/app/(app)/scadenze/moduli";

const UUID = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const UUID2 = "7a1b2c3d-4e5f-4a60-9b8c-1d2e3f4a5b6c";
const TODAY = "2026-10-05";

/** Il primo problema, nella forma «campo: messaggio» di zodMessage. */
function issue(result: z.SafeParseReturnType<unknown, unknown>): string {
  if (result.success) return "";
  const first = result.error.issues[0]!;
  return `${first.path.join(".")}: ${first.message}`;
}

/** Una riga dell'elenco con i valori di default: in regola, non bloccante, senza km. */
function row(over: Partial<DeadlineRowInput> & { id: string }): DeadlineRowInput & { id: string } {
  return {
    dueOn: null,
    dueKm: null,
    alertDays: 30,
    alertKm: null,
    blocking: false,
    odometerKm: null,
    subjectLabel: "12 · FX123AB",
    typeLabel: "Revisione",
    ...over,
  };
}

describe("evaluateRows e sortByUrgency", () => {
  it("prima le scadute (bloccanti davanti, poi le più in ritardo), poi in scadenza, da completare, in regola", () => {
    const rows = [
      row({ id: "ok", dueOn: "2027-06-01" }),
      row({ id: "missing" }),
      row({ id: "expiring-10", dueOn: "2026-10-15" }),
      row({ id: "expired-5", dueOn: "2026-09-30" }),
      row({ id: "expiring-2", dueOn: "2026-10-07" }),
      row({ id: "expired-blocking-1", dueOn: "2026-10-04", blocking: true }),
      row({ id: "expired-20", dueOn: "2026-09-15" }),
      row({ id: "missing-blocking", blocking: true }),
    ];
    const sorted = sortByUrgency(evaluateRows(rows, TODAY)).map((i) => i.row.id);
    expect(sorted).toEqual([
      "expired-blocking-1",
      "expired-20",
      "expired-5",
      "expiring-2",
      "expiring-10",
      "missing-blocking",
      "missing",
      "ok",
    ]);
  });

  it("le scadenze a km si valutano con i km del mezzo: superata, in preavviso, in regola", () => {
    const items = evaluateRows(
      [
        row({ id: "km-over", dueKm: 120_000, odometerKm: 120_350, alertKm: 2000 }),
        row({ id: "km-soon", dueKm: 121_000, odometerKm: 120_350, alertKm: 2000 }),
        row({ id: "km-ok", dueKm: 150_000, odometerKm: 120_350, alertKm: 2000 }),
        row({ id: "km-unknown", dueKm: 100, odometerKm: null }),
      ],
      TODAY,
    );
    const byId = Object.fromEntries(items.map((i) => [i.row.id, i]));
    expect(byId["km-over"]!.evaluation.state).toBe("expired");
    expect(byId["km-over"]!.evaluation.kmLeft).toBe(-350);
    expect(byId["km-soon"]!.evaluation.state).toBe("expiring");
    expect(byId["km-ok"]!.evaluation.state).toBe("ok");
    // senza contachilometri la dimensione km non si valuta: resta «da completare»
    expect(byId["km-unknown"]!.evaluation.state).toBe("missing");
  });

  it("il colore: rosso solo per una bloccante superata, giallo per tutto il resto non in regola", () => {
    const items = evaluateRows(
      [
        row({ id: "red", dueOn: "2026-01-01", blocking: true }),
        row({ id: "yellow-expired", dueOn: "2026-01-01" }),
        row({ id: "yellow-missing" }),
        row({ id: "green", dueOn: "2027-01-01" }),
      ],
      TODAY,
    );
    expect(items.map((i) => i.color)).toEqual(["red", "yellow", "yellow", "green"]);
  });

  it("a parità di urgenza, la data prima dei km, poi il soggetto", () => {
    const items = evaluateRows(
      [
        row({ id: "b", dueOn: "2027-01-01", subjectLabel: "7 · ZZ" }),
        row({ id: "a", dueOn: "2027-01-01", subjectLabel: "3 · AA" }),
        row({ id: "km", dueKm: 200_000, odometerKm: 1000 }),
      ],
      TODAY,
    );
    const sorted = [...items].sort(compareUrgency).map((i) => i.row.id);
    expect(sorted).toEqual(["a", "b", "km"]);
  });
});

describe("countByState e filtri", () => {
  const items = evaluateRows(
    [
      row({ id: "1", dueOn: "2026-01-01" }),
      row({ id: "2", dueOn: "2026-10-20" }),
      row({ id: "3" }),
      row({ id: "4", dueOn: "2027-01-01" }),
      row({ id: "5", dueOn: "2027-02-01" }),
    ],
    TODAY,
  );

  it("conta per stato, più «da seguire» (tutto tranne in regola) e «tutte»", () => {
    expect(countByState(items)).toEqual({
      aperte: 3,
      scadute: 1,
      in_scadenza: 1,
      da_completare: 1,
      in_regola: 2,
      tutte: 5,
    });
  });

  it("matchesFiltro: il default esclude le in regola, «tutte» prende tutto", () => {
    const states = items.map((i) => i.evaluation.state);
    expect(states.filter((s) => matchesFiltro(s, "aperte"))).toEqual([
      "expired",
      "expiring",
      "missing",
    ]);
    expect(states.filter((s) => matchesFiltro(s, "tutte"))).toHaveLength(5);
    expect(states.filter((s) => matchesFiltro(s, "in_regola"))).toHaveLength(2);
    expect(states.filter((s) => matchesFiltro(s, "scadute"))).toEqual(["expired"]);
  });

  it("parseStatoFiltro: un valore sconosciuto torna al default", () => {
    expect(parseStatoFiltro("scadute", "aperte")).toBe("scadute");
    expect(parseStatoFiltro("boh", "aperte")).toBe("aperte");
    expect(parseStatoFiltro(undefined, "tutte")).toBe("tutte");
    expect(defaultFiltro(false)).toBe("aperte");
    expect(defaultFiltro(true)).toBe("tutte");
  });

  it("listHref: il filtro di default non compare, il soggetto sì", () => {
    expect(listHref("aperte")).toBe("/scadenze");
    expect(listHref("scadute")).toBe("/scadenze?stato=scadute");
    expect(listHref("tutte", { mezzo: UUID })).toBe(`/scadenze?mezzo=${UUID}`);
    expect(listHref("in_regola", { attrezzatura: UUID })).toBe(
      `/scadenze?attrezzatura=${UUID}&stato=in_regola`,
    );
  });
});

describe("il soggetto", () => {
  const vehicle = {
    vehicleId: UUID,
    vehicleCode: "12",
    vehiclePlate: "FX123AB",
    equipmentId: null,
    equipmentTypeLabel: null,
    equipmentSerial: null,
    equipmentInventory: null,
  };
  const equipment = {
    vehicleId: null,
    vehicleCode: null,
    vehiclePlate: null,
    equipmentId: UUID2,
    equipmentTypeLabel: "DAE",
    equipmentSerial: "SN-1",
    equipmentInventory: "INV-9",
  };

  it("etichetta e link di un mezzo", () => {
    expect(subjectLabel(vehicle)).toBe("12 · FX123AB");
    expect(subjectHref(vehicle)).toBe(`/mezzi/${UUID}`);
    expect(subjectListHref(vehicle)).toBe(`/scadenze?mezzo=${UUID}`);
  });

  it("etichetta e link di un'attrezzatura: matricola, altrimenti inventario", () => {
    expect(subjectLabel(equipment)).toBe("DAE · matr. SN-1");
    expect(subjectLabel({ ...equipment, equipmentSerial: null })).toBe("DAE · inv. INV-9");
    expect(subjectLabel({ ...equipment, equipmentSerial: null, equipmentInventory: null })).toBe(
      "DAE · senza matricola",
    );
    expect(subjectHref(equipment)).toBe(`/attrezzature/${UUID2}`);
    expect(subjectListHref(equipment)).toBe(`/scadenze?attrezzatura=${UUID2}`);
  });
});

describe("le frasi", () => {
  it("stateText", () => {
    const [expired, soon, today, tomorrow, ok, missing, kmOver, kmSoon] = evaluateRows(
      [
        row({ id: "1", dueOn: "2026-09-23" }),
        row({ id: "2", dueOn: "2026-10-08" }),
        row({ id: "3", dueOn: "2026-10-05" }),
        row({ id: "4", dueOn: "2026-10-06" }),
        row({ id: "5", dueOn: "2027-10-05" }),
        row({ id: "6" }),
        row({ id: "7", dueKm: 1000, odometerKm: 1300 }),
        row({ id: "8", dueKm: 1500, odometerKm: 1300, alertKm: 500 }),
      ],
      TODAY,
    );
    expect(stateText(expired!.evaluation)).toBe("Scaduta da 12 giorni");
    expect(stateText(soon!.evaluation)).toBe("Scade fra 3 giorni");
    expect(stateText(today!.evaluation)).toBe("Scade oggi");
    expect(stateText(tomorrow!.evaluation)).toBe("Scade domani");
    expect(stateText(ok!.evaluation)).toBe("In regola (365 giorni)");
    expect(stateText(missing!.evaluation)).toBe("Da completare");
    expect(stateText(kmOver!.evaluation)).toBe("Superata di 300 km");
    expect(stateText(kmSoon!.evaluation)).toBe("Mancano 200 km");
  });

  it("dueText, describeInterval, describeAlert", () => {
    expect(dueText("31/01/2027", 150350)).toBe("31/01/2027 · 150.350 km");
    expect(dueText(null, null)).toBe("senza data né km");
    expect(describeInterval({ intervalMonths: 12, intervalDays: null, intervalKm: 30000 })).toBe(
      "ogni 12 mesi o 30.000 km",
    );
    expect(
      describeInterval({ intervalMonths: 12, intervalDays: null, intervalKm: null }, true),
    ).toBe("ogni 12 mesi, entro fine mese");
    expect(describeInterval({ intervalMonths: null, intervalDays: 30, intervalKm: null })).toBe(
      "ogni 30 giorni",
    );
    expect(describeInterval({ intervalMonths: null, intervalDays: null, intervalKm: null })).toBe(
      "non periodica: la data si legge dal documento",
    );
    expect(describeAlert(30, null, false)).toBe("30 giorni prima");
    expect(describeAlert(30, null, true)).toBe("30 giorni prima (per i km: al raggiungimento)");
    expect(describeAlert(1, 2000, true)).toBe("1 giorno e 2.000 km prima");
  });

  it("overriddenFields", () => {
    const none = {
      ownIntervalMonths: null,
      ownIntervalDays: null,
      ownIntervalKm: null,
      ownAlertDays: null,
      ownAlertKm: null,
      ownBlocking: null,
    };
    expect(overriddenFields(none)).toEqual([]);
    expect(overriddenFields({ ...none, ownIntervalKm: 40000, ownBlocking: false })).toEqual([
      "periodicità",
      "blocco",
    ]);
    expect(overriddenFields({ ...none, ownAlertDays: 10 })).toEqual(["preavviso"]);
  });
});

describe("prefillNextDue", () => {
  const tagliando = {
    intervalMonths: 12,
    intervalDays: null,
    intervalKm: 30000,
    monthEnd: false,
    renewFromDue: false,
    renewGraceDays: null,
  };
  const revisione = { ...tagliando, intervalKm: null, monthEnd: true };
  const rca = { ...tagliando, intervalKm: null, renewFromDue: true, renewGraceDays: 15 };
  const elettrodi = { ...tagliando, intervalMonths: null, intervalKm: null };

  it("mesi e km dal giorno dell'adempimento", () => {
    expect(prefillNextDue("2026-10-05", 120350, tagliando, null)).toEqual({
      dueOn: "2027-10-05",
      dueKm: 150350,
    });
    expect(prefillNextDue("2026-10-05", null, tagliando, null)).toEqual({
      dueOn: "2027-10-05",
      dueKm: null,
    });
  });

  it("fine mese per la revisione", () => {
    expect(prefillNextDue("2026-10-05", null, revisione, null).dueOn).toBe("2027-10-31");
  });

  it("RCA: dall'anniversario se rinnovata in anticipo o nella tolleranza, altrimenti dal pagamento", () => {
    expect(prefillNextDue("2026-09-25", null, rca, "2026-10-01").dueOn).toBe("2027-10-01");
    expect(prefillNextDue("2026-10-10", null, rca, "2026-10-01").dueOn).toBe("2027-10-01");
    expect(prefillNextDue("2026-11-20", null, rca, "2026-10-01").dueOn).toBe("2027-11-20");
    // senza una scadenza precedente si parte dal pagamento
    expect(prefillNextDue("2026-10-10", null, rca, null).dueOn).toBe("2027-10-10");
  });

  it("non periodica: niente proposta; data incompleta: niente errore", () => {
    expect(prefillNextDue("2026-10-05", null, elettrodi, null)).toEqual({
      dueOn: null,
      dueKm: null,
    });
    expect(prefillNextDue("2026-1", null, tagliando, null)).toEqual({ dueOn: null, dueKm: null });
    expect(prefillNextDue("", 100, tagliando, null)).toEqual({ dueOn: null, dueKm: null });
  });
});

describe("dati in ingresso", () => {
  it("isCalendarDay", () => {
    expect(isCalendarDay("2026-02-28")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("3000-01-01")).toBe(false);
    expect(isCalendarDay("05/10/2026")).toBe(false);
  });

  it("formValues legge i campi di testo e ignora i file", () => {
    const fd = new FormData();
    fd.append("data", "2026-10-05");
    fd.append("allegato", new File(["x"], "x.pdf"));
    expect(formValues(fd)).toEqual({ data: "2026-10-05" });
  });

  it("parseEuro: virgola italiana, punto, migliaia, euro; vuoto null; altro undefined", () => {
    expect(parseEuro("123,45")).toBe("123.45");
    expect(parseEuro("1.234,5")).toBe("1234.50");
    expect(parseEuro("1234.5")).toBe("1234.50");
    expect(parseEuro("80")).toBe("80.00");
    expect(parseEuro(" 99,90 € ")).toBe("99.90");
    expect(parseEuro("")).toBeNull();
    expect(parseEuro("abc")).toBeUndefined();
    expect(parseEuro("12,345")).toBeUndefined();
    expect(parseEuro("-5")).toBeUndefined();
  });
});

describe("setDueSchema", () => {
  it("vuoto → null; data vera; km interi", () => {
    const r = setDueSchema.safeParse({ id: UUID, data: "", km: "", note: " " });
    expect(r.success && r.data).toEqual({ id: UUID, data: null, km: null, note: null });
    const ok = setDueSchema.safeParse({ id: UUID, data: "2027-01-31", km: "150000", note: "x" });
    expect(ok.success && ok.data.km).toBe(150000);
    expect(issue(setDueSchema.safeParse({ id: UUID, data: "2027-02-30" }))).toBe(
      "data: data non valida",
    );
    expect(issue(setDueSchema.safeParse({ id: UUID, km: "12.5" }))).toBe(
      "km: deve essere un numero intero",
    );
    expect(issue(setDueSchema.safeParse({ data: "2027-01-31" }))).toBe("id: scadenza non indicato");
    expect(issue(setDueSchema.safeParse({ id: "x" }))).toBe("id: scadenza non valido");
  });
});

describe("completionSchema", () => {
  const schema = completionSchema(TODAY);
  const BASE = { id: UUID, data: "2026-10-01", esito: "passed" };

  it("il modulo minimo passa, con i facoltativi a null", () => {
    const r = schema.safeParse(BASE);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toEqual({
      id: UUID,
      data: "2026-10-01",
      km: null,
      esito: "passed",
      prossima_data: null,
      prossima_km: null,
      costo: null,
      fornitore: null,
      documento: null,
      note: null,
    });
  });

  it("tutti i campi: costo come stringa con il punto, fornitore uuid", () => {
    const r = schema.safeParse({
      ...BASE,
      km: "120350",
      esito: "conditional",
      prossima_data: "2027-10-01",
      prossima_km: "150350",
      costo: "1.234,50",
      fornitore: UUID2,
      documento: " CERT-1 ",
      note: "ok",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.costo).toBe("1234.50");
    expect(r.data.fornitore).toBe(UUID2);
    expect(r.data.documento).toBe("CERT-1");
    expect(r.data.prossima_km).toBe(150350);
  });

  it("niente date future, data obbligatoria, esito noto, importo leggibile", () => {
    expect(issue(schema.safeParse({ ...BASE, data: "2026-10-06" }))).toBe(
      "data: un adempimento non può avere una data futura",
    );
    expect(schema.safeParse({ ...BASE, data: TODAY }).success).toBe(true);
    expect(issue(schema.safeParse({ ...BASE, data: "" }))).toBe("data: obbligatoria");
    expect(issue(schema.safeParse({ id: UUID, esito: "passed" }))).toBe("data: obbligatoria");
    expect(issue(schema.safeParse({ ...BASE, esito: "boh" }))).toBe("esito: valore non valido");
    expect(issue(schema.safeParse({ ...BASE, esito: "" }))).toBe("esito: obbligatorio");
    expect(issue(schema.safeParse({ ...BASE, costo: "tanto" }))).toBe(
      "costo: importo non valido (es. 123,45)",
    );
    expect(issue(schema.safeParse({ ...BASE, fornitore: "ditta" }))).toBe(
      "fornitore: fornitore non valido",
    );
  });
});

describe("overrideSchema", () => {
  it("tutto vuoto = eredita tutto", () => {
    const r = overrideSchema.safeParse({ id: UUID, mesi: "", giorni: "", blocco: "" });
    expect(r.success && r.data).toEqual({
      id: UUID,
      mesi: null,
      giorni: null,
      km_periodo: null,
      preavviso_giorni: null,
      preavviso_km: null,
      blocco: null,
    });
  });

  it("i valori: periodicità positive, preavvisi non negativi, blocco a tre vie", () => {
    const r = overrideSchema.safeParse({
      id: UUID,
      km_periodo: "40000",
      preavviso_giorni: "0",
      blocco: "no",
    });
    expect(r.success && r.data.km_periodo).toBe(40000);
    expect(r.success && r.data.preavviso_giorni).toBe(0);
    expect(r.success && r.data.blocco).toBe(false);
    const si = overrideSchema.safeParse({ id: UUID, blocco: "si" });
    expect(si.success && si.data.blocco).toBe(true);
    expect(issue(overrideSchema.safeParse({ id: UUID, mesi: "0" }))).toBe(
      "mesi: non può essere sotto 1",
    );
    expect(issue(overrideSchema.safeParse({ id: UUID, preavviso_km: "-1" }))).toBe(
      "preavviso_km: non può essere sotto 0",
    );
    expect(issue(overrideSchema.safeParse({ id: UUID, blocco: "forse" }))).toBe(
      "blocco: valore non valido",
    );
  });

  it("mesi oppure giorni, non entrambi", () => {
    expect(issue(overrideSchema.safeParse({ id: UUID, mesi: "12", giorni: "30" }))).toBe(
      "mesi: periodicità in mesi oppure in giorni, non entrambe",
    );
  });
});

describe("newDeadlineSchema", () => {
  it("un mezzo oppure un'attrezzatura, un tipo, etichetta vuota = «»", () => {
    const r = newDeadlineSchema.safeParse({ mezzo: UUID, attrezzatura: "", tipo: UUID2 });
    expect(r.success && r.data).toEqual({
      mezzo: UUID,
      attrezzatura: null,
      tipo: UUID2,
      etichetta: "",
      data: null,
      km: null,
    });
    const e = newDeadlineSchema.safeParse({
      attrezzatura: UUID,
      tipo: UUID2,
      etichetta: " scorta ",
      data: "2027-05-31",
    });
    expect(e.success && e.data.etichetta).toBe("scorta");
    expect(e.success && e.data.data).toBe("2027-05-31");
  });

  it("rifiuta nessun soggetto, entrambi, tipo mancante", () => {
    expect(issue(newDeadlineSchema.safeParse({ tipo: UUID2 }))).toBe(
      "mezzo: serve un mezzo oppure un'attrezzatura",
    );
    expect(
      issue(newDeadlineSchema.safeParse({ mezzo: UUID, attrezzatura: UUID2, tipo: UUID2 })),
    ).toBe("mezzo: serve un mezzo oppure un'attrezzatura");
    expect(issue(newDeadlineSchema.safeParse({ mezzo: UUID, tipo: "" }))).toBe(
      "tipo: tipo di scadenza non valido",
    );
    expect(issue(newDeadlineSchema.safeParse({ mezzo: UUID }))).toBe(
      "tipo: tipo di scadenza non indicato",
    );
  });
});

describe("removeSchema", () => {
  it("vuole un uuid", () => {
    expect(removeSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(issue(removeSchema.safeParse({ id: "12" }))).toBe("id: scadenza non valido");
  });
});

describe("specialDbMessage", () => {
  it("i doppioni di scadenza hanno la loro frase, per mezzo e per attrezzatura", () => {
    expect(specialDbMessage({ code: "23505", constraint_name: "deadlines_vehicle_uq" })).toMatch(
      /^Questo mezzo ha già una scadenza/,
    );
    expect(specialDbMessage({ code: "23505", constraint_name: "deadlines_equipment_uq" })).toMatch(
      /^Questa attrezzatura ha già una scadenza/,
    );
  });

  it("remove_deadline che non trova la scadenza (P0002)", () => {
    expect(specialDbMessage({ code: "P0002" })).toBe(
      "Scadenza non trovata, o non è un'operazione del tuo ruolo",
    );
  });

  it("gli altri errori passano alla traduzione comune", () => {
    expect(
      specialDbMessage({ code: "23505", constraint_name: "suppliers_tenant_vat_uq" }),
    ).toBeNull();
    expect(specialDbMessage({ code: "P0001", message: "x" })).toBeNull();
    expect(specialDbMessage(new Error("boh"))).toBeNull();
    expect(specialDbMessage(null)).toBeNull();
  });
});
