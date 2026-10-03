import { describe, expect, it } from "vitest";
import {
  grossAmount,
  normalizePlate,
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

describe("targhe", () => {
  it("normalizza spazi, trattini e minuscole", () => {
    expect(normalizePlate(" fx-123 ab ")).toBe("FX123AB");
  });
  it("riconosce il mezzo dalla targa o dal codice tessera", () => {
    const vehicles = [
      { id: "amb1", plate: "FX123AB", fuelCardCode: null },
      { id: "pul1", plate: "GA456CD", fuelCardCode: "TESS-0007" },
    ];
    expect(resolveVehicleId("FX 123 AB", vehicles)).toBe("amb1");
    expect(resolveVehicleId("tess 0007", vehicles)).toBe("pul1");
    expect(resolveVehicleId("ZZ999ZZ", vehicles)).toBeNull();
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

  it("targa non riconosciuta", () => {
    const r = reconcileFuel([line("L1", { vehicleId: null })], [log("F1")]);
    expect(r.lines[0]?.reason).toBe("targa non riconosciuta");
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
    const logs = [
      log("F1", { liters: 20, amountEur: 35 }),
      log("F2", { liters: 45.3, amountEur: 79.28 }),
    ];
    const lines = [
      line("L1", { liters: 45.3, amountEur: 79.28 }),
      line("L2", { liters: 20, amountEur: 35 }),
    ];
    const r = reconcileFuel(lines, logs);
    expect(r.lines.map((l) => [l.lineId, l.fuelLogId, l.status])).toEqual([
      ["L1", "F2", "matched"],
      ["L2", "F1", "matched"],
    ]);
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
