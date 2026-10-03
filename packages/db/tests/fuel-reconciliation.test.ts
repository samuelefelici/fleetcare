import { describe, expect, it } from "vitest";
import {
  grossAmount,
  normalizePlate,
  normalizeVehicleCode,
  reconcileFuel,
  resolveVehicleId,
  type FuelLogForMatch,
  type InvoiceLineForMatch,
} from "../src/domain/fuel-reconciliation";

const log = (id: string, over: Partial<FuelLogForMatch> = {}): FuelLogForMatch => ({
  id,
  vehicleId: "amb1",
  refueledOn: "2026-09-10",
  product: "diesel",
  liters: 45.3,
  amountEur: 79.28,
  receiptNumber: null,
  ...over,
});

const line = (id: string, over: Partial<InvoiceLineForMatch> = {}): InvoiceLineForMatch => ({
  id,
  vehicleId: "amb1",
  refueledOn: "2026-09-10",
  product: "diesel",
  liters: 45.3,
  amountEur: 79.28,
  receiptNumber: null,
  ...over,
});

describe("riconoscimento del mezzo dalla matricola", () => {
  const vehicles = [
    { id: "amb1", plate: "FX123AB", internalCode: "05", fuelVehicleCode: null },
    { id: "amb2", plate: "FX456AB", internalCode: "12", fuelVehicleCode: null },
    { id: "pul1", plate: "GA456CD", internalCode: "20", fuelVehicleCode: "M-0012" },
  ];

  it("normalizza spazi, trattini, minuscole e zeri iniziali dei codici numerici", () => {
    expect(normalizePlate(" fx-123 ab ")).toBe("FX123AB");
    expect(normalizeVehicleCode("005")).toBe("5");
    expect(normalizeVehicleCode("000")).toBe("0");
    expect(normalizeVehicleCode("0")).toBe("0");
    expect(normalizeVehicleCode("m-0012")).toBe("M0012");
    expect(normalizeVehicleCode("0A7")).toBe("0A7");
  });

  it("un mezzo con matricola del distributore si riconosce da quella", () => {
    expect(resolveVehicleId("M 0012", vehicles)).toBe("pul1");
  });

  it("…e non più dal suo numero interno, che il distributore non usa", () => {
    expect(resolveVehicleId("20", vehicles)).toBeNull();
  });

  it("senza matricola del distributore vale il numero interno, zeri compresi", () => {
    expect(resolveVehicleId("5", vehicles)).toBe("amb1");
    expect(resolveVehicleId("0005", vehicles)).toBe("amb1");
    expect(resolveVehicleId("12", vehicles)).toBe("amb2");
  });

  it("la targa solo quando nessun codice corrisponde", () => {
    expect(resolveVehicleId("fx 456 ab", vehicles)).toBe("amb2");
  });

  it("la matricola di un mezzo uguale al numero interno di un altro: non indovina", () => {
    const conflitto = [
      { id: "a", plate: "AA111AA", internalCode: "30", fuelVehicleCode: "7" },
      { id: "b", plate: "BB222BB", internalCode: "007", fuelVehicleCode: null },
    ];
    expect(resolveVehicleId("7", conflitto)).toBeNull();
  });

  it("due mezzi con lo stesso numero interno normalizzato: non indovina", () => {
    const doppi = [
      { id: "a", plate: "AA111AA", internalCode: "7", fuelVehicleCode: null },
      { id: "b", plate: "BB222BB", internalCode: "007", fuelVehicleCode: null },
    ];
    expect(resolveVehicleId("7", doppi)).toBeNull();
  });

  it("matricola sconosciuta o vuota", () => {
    expect(resolveVehicleId("99", vehicles)).toBeNull();
    expect(resolveVehicleId("", vehicles)).toBeNull();
    expect(resolveVehicleId(null, vehicles)).toBeNull();
  });
});

describe("grossAmount", () => {
  it("riporta al lordo le righe imponibili", () => {
    expect(grossAmount(64.98, 22, false)).toBe(79.28);
    expect(grossAmount(79.28, 22, true)).toBe(79.28);
  });
});

describe("reconcileFuel", () => {
  it("abbina per mezzo, data e quantità", () => {
    const r = reconcileFuel([line("L1")], [log("F1")]);
    expect(r.lines[0]).toMatchObject({ status: "matched", fuelLogId: "F1", litersDiff: 0 });
    expect(r.unbilledLogIds).toEqual([]);
  });

  it("tollera un giorno di scarto (rifornimento a mezzanotte, data contabile del distributore)", () => {
    const r = reconcileFuel([line("L1", { refueledOn: "2026-09-11" })], [log("F1")]);
    expect(r.lines[0]?.status).toBe("matched");
  });

  it("stesso buono ma importo diverso: mismatch, non abbinamento", () => {
    const r = reconcileFuel(
      [line("L1", { receiptNumber: "000412", amountEur: 89.28 })],
      [log("F1", { receiptNumber: "412" })],
    );
    expect(r.lines[0]).toMatchObject({ status: "mismatch", fuelLogId: "F1", amountDiff: 10 });
    expect(r.lines[0]?.reason).toContain("stesso buono");
  });

  it("lo stesso numero di buono in un altro mese non è lo stesso buono", () => {
    const r = reconcileFuel(
      [line("L1", { receiptNumber: "412", refueledOn: "2026-09-10" })],
      [log("F1", { receiptNumber: "412", refueledOn: "2026-08-10", liters: 30, amountEur: 50 })],
    );
    expect(r.lines[0]?.status).toBe("unmatched");
    expect(r.unbilledLogIds).toEqual(["F1"]);
  });

  it("fatturato ma mai registrato", () => {
    const r = reconcileFuel([line("L1")], []);
    expect(r.lines[0]).toMatchObject({ status: "unmatched", fuelLogId: null });
    expect(r.lines[0]?.reason).toBe("fatturato ma nessun rifornimento registrato");
  });

  it("matricola non riconosciuta", () => {
    const r = reconcileFuel([line("L1", { vehicleId: null })], [log("F1")]);
    expect(r.lines[0]?.reason).toBe("matricola non riconosciuta");
    expect(r.unbilledLogIds).toEqual(["F1"]);
  });

  it("registrato ma non fatturato", () => {
    const r = reconcileFuel([], [log("F1")]);
    expect(r.unbilledLogIds).toEqual(["F1"]);
  });

  it("litri fuori tolleranza sullo stesso mezzo e giorno: mismatch col candidato", () => {
    const r = reconcileFuel([line("L1", { liters: 55.3, amountEur: 96.78 })], [log("F1")]);
    expect(r.lines[0]).toMatchObject({ status: "mismatch", fuelLogId: "F1", litersDiff: 10 });
  });

  it("due pieni lo stesso giorno: vince la coppia più vicina, non l'ordine delle righe", () => {
    // in ordine, la prima riga (20,4 L) è entro tolleranza da entrambi i
    // pieni: un abbinamento «al primo trovato» le darebbe F1 (20,0 L) e
    // lascerebbe a L2 (20,0 L esatti) il pieno sbagliato
    const logs = [
      log("F1", { liters: 20, amountEur: 35 }),
      log("F2", { liters: 20.4, amountEur: 35.4 }),
    ];
    const lines = [
      line("L1", { liters: 20.4, amountEur: 35.4 }),
      line("L2", { liters: 20, amountEur: 35 }),
    ];
    const r = reconcileFuel(lines, logs);
    expect(r.lines.map((l) => [l.lineId, l.fuelLogId, l.litersDiff])).toEqual([
      ["L1", "F2", 0],
      ["L2", "F1", 0],
    ]);
  });

  it("una riga, due pieni entro tolleranza: vince il più vicino, non il primo in elenco", () => {
    const r = reconcileFuel(
      [line("L", { liters: 20, amountEur: 35 })],
      [
        log("lontano", { liters: 20.4, amountEur: 35.4 }),
        log("vicino", { liters: 20, amountEur: 35 }),
      ],
    );
    expect(r.lines[0]?.fuelLogId).toBe("vicino");
    expect(r.unbilledLogIds).toEqual(["lontano"]);
  });

  it("date del distributore spostate di un giorno: si abbinano tutte, nessuna orfana", () => {
    // pieni simili il 10 e l'11; il distributore li data 11 e 12
    const logs = [
      log("F10", { refueledOn: "2026-09-10" }),
      log("F11", { refueledOn: "2026-09-11" }),
    ];
    const lines = [
      line("L11", { refueledOn: "2026-09-11" }),
      line("L12", { refueledOn: "2026-09-12" }),
    ];
    const r = reconcileFuel(lines, logs);
    expect(r.lines.every((l) => l.status === "matched")).toBe(true);
    expect(r.unbilledLogIds).toEqual([]);
    expect(Object.fromEntries(r.lines.map((l) => [l.lineId, l.fuelLogId]))).toEqual({
      L11: "F10",
      L12: "F11",
    });
  });

  it("stesso buono su gasolio e AdBlue: ognuno col suo prodotto", () => {
    const logs = [
      log("D", { receiptNumber: "88" }),
      log("A", { receiptNumber: "88", product: "adblue", liters: 10, amountEur: 9 }),
    ];
    const lines = [
      line("LA", { receiptNumber: "88", product: "adblue", liters: 10, amountEur: 9 }),
      line("LD", { receiptNumber: "88" }),
    ];
    const r = reconcileFuel(lines, logs);
    expect(Object.fromEntries(r.lines.map((l) => [l.lineId, [l.fuelLogId, l.status]]))).toEqual({
      LA: ["A", "matched"],
      LD: ["D", "matched"],
    });
  });

  it("buono ripetuto in due giorni vicini: vince quello della stessa data", () => {
    const logs = [
      log("ieri", { receiptNumber: "5", refueledOn: "2026-09-09" }),
      log("oggi", { receiptNumber: "5", refueledOn: "2026-09-10" }),
    ];
    const r = reconcileFuel([line("L", { receiptNumber: "5", refueledOn: "2026-09-10" })], logs);
    expect(r.lines[0]?.fuelLogId).toBe("oggi");
  });

  it("stesso buono senza litri né importo da confrontare: abbinata, con il motivo detto", () => {
    const r = reconcileFuel(
      [line("L", { receiptNumber: "9", liters: null })],
      [log("F", { receiptNumber: "9", amountEur: null })],
    );
    expect(r.lines[0]).toMatchObject({ status: "matched", fuelLogId: "F" });
    expect(r.lines[0]?.reason).toBe("stesso buono (litri e importo non confrontabili)");
  });

  it("un rifornimento si abbina a una riga sola", () => {
    const r = reconcileFuel([line("L1"), line("L2")], [log("F1")]);
    expect(r.lines.filter((l) => l.fuelLogId === "F1")).toHaveLength(1);
    expect(r.lines.find((l) => l.lineId === "L2")?.status).toBe("unmatched");
  });

  it("AdBlue e gasolio dello stesso mezzo non si confondono", () => {
    const r = reconcileFuel(
      [line("L1", { product: "adblue", liters: 10, amountEur: 9 })],
      [log("F1"), log("F2", { product: "adblue", liters: 10, amountEur: 9 })],
    );
    expect(r.lines[0]).toMatchObject({ status: "matched", fuelLogId: "F2" });
    expect(r.unbilledLogIds).toEqual(["F1"]);
  });
});
