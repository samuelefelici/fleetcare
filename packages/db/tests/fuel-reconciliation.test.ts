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

  it("una matricola del distributore vuota non nasconde il numero interno", () => {
    const conVuota = [{ id: "a", plate: "AA111AA", internalCode: "9", fuelVehicleCode: "  -  " }];
    expect(resolveVehicleId("9", conVuota)).toBe("a");
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
  it("il mezzo centesimo va per eccesso, anche quando la virgola mobile dice …4999", () => {
    expect(grossAmount(28.75, 22, false)).toBe(35.08); // 35,075
    expect(grossAmount(1.005, 22, true)).toBe(1.01);
    expect(grossAmount(10, 10, false)).toBe(11);
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

  it("buono ripetuto in giorni vicini, due righe e due pieni: si abbinano tutti", () => {
    // A (11/9) può andare con X (10/9) o Y (11/9); B (12/9) solo con Y. Prendere
    // per prima la coppia più vicina (A-Y, stesso giorno) lascerebbe B e X orfani.
    const lines = [
      line("A", { vehicleId: null, receiptNumber: "5", refueledOn: "2026-09-11" }),
      line("B", { vehicleId: null, receiptNumber: "5", refueledOn: "2026-09-12" }),
    ];
    const logs = [
      log("X", { receiptNumber: "5", refueledOn: "2026-09-10" }),
      log("Y", { receiptNumber: "5", refueledOn: "2026-09-11" }),
    ];
    const r = reconcileFuel(lines, logs);
    expect(r.lines.map((l) => [l.lineId, l.status, l.fuelLogId])).toEqual([
      ["A", "matched", "X"],
      ["B", "matched", "Y"],
    ]);
    expect(r.unbilledLogIds).toEqual([]);
  });

  it("stesso buono senza litri né importo da confrontare: abbinata, con il motivo detto", () => {
    const r = reconcileFuel(
      [line("L", { receiptNumber: "9", liters: null })],
      [log("F", { receiptNumber: "9", amountEur: null })],
    );
    expect(r.lines[0]).toMatchObject({ status: "matched", fuelLogId: "F" });
    expect(r.lines[0]?.reason).toBe("stesso buono (litri e importo non confrontabili)");
  });

  it("stesso buono ma mezzo diverso: non è lo stesso rifornimento", () => {
    const r = reconcileFuel(
      [line("L", { receiptNumber: "7", vehicleId: "amb1" })],
      [log("F", { receiptNumber: "7", vehicleId: "amb2" })],
    );
    expect(r.lines[0]?.status).toBe("unmatched");
  });

  it("stesso buono ma prodotto diverso: non è lo stesso rifornimento", () => {
    const r = reconcileFuel(
      [line("L", { receiptNumber: "7", product: "adblue", vehicleId: null })],
      [log("F", { receiptNumber: "7" })],
    );
    expect(r.lines[0]?.status).toBe("unmatched");
  });

  it("il risultato non dipende dall'ordine di righe e rifornimenti", () => {
    const logs = [
      log("F1", { liters: 20, amountEur: 35 }),
      log("F2", { liters: 20.3, amountEur: 35.3 }),
      log("F3", { liters: 20.1, amountEur: 35.1, refueledOn: "2026-09-11" }),
    ];
    const lines = [
      line("L1", { liters: 20.1, amountEur: 35.1 }),
      line("L2", { liters: 20.2, amountEur: 35.2 }),
      line("L3", { liters: 20, amountEur: 35, refueledOn: "2026-09-11" }),
    ];
    const key = (r: ReturnType<typeof reconcileFuel>) =>
      JSON.stringify(r.lines.map((l) => [l.lineId, l.fuelLogId]).sort());
    const a = key(reconcileFuel(lines, logs));
    const b = key(reconcileFuel([...lines].reverse(), [...logs].reverse()));
    expect(b).toBe(a);
  });

  it("assegnazione ottima: su 40 casi coincide con la forza bruta (coppie, poi distanza)", () => {
    // generatore deterministico: niente casualità nei test
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const days = ["2026-09-10", "2026-09-11", "2026-09-12"];
    const cost = (l: InvoiceLineForMatch, f: FuelLogForMatch) => {
      const d = Math.abs(days.indexOf(l.refueledOn) - days.indexOf(f.refueledOn));
      const lit = Math.abs((l.liters ?? 0) - f.liters);
      const amt = Math.abs(l.amountEur - (f.amountEur ?? 0));
      return d <= 1 && lit <= 0.5 + 1e-9 && amt <= 0.5 + 1e-9
        ? d * 1_000_000 + Math.round(lit * 100) * 1_000 + Math.round(amt * 100)
        : null;
    };
    // l'ottimo vero: per ogni permutazione dei rifornimenti, quante coppie e che costo
    const brute = (lines: InvoiceLineForMatch[], logs: FuelLogForMatch[]) => {
      let best = { pairs: -1, total: Infinity };
      const rec = (i: number, used: Set<number>, pairs: number, total: number) => {
        if (i === lines.length) {
          if (pairs > best.pairs || (pairs === best.pairs && total < best.total))
            best = { pairs, total };
          return;
        }
        rec(i + 1, used, pairs, total); // riga senza abbinamento
        logs.forEach((f, j) => {
          const c = used.has(j) ? null : cost(lines[i]!, f);
          if (c === null) return;
          used.add(j);
          rec(i + 1, used, pairs + 1, total + c);
          used.delete(j);
        });
      };
      rec(0, new Set(), 0, 0);
      return best;
    };
    for (let k = 0; k < 40; k++) {
      const mk = (prefix: string, n: number) =>
        Array.from({ length: n }, (_, i) => {
          const liters = 30 + Math.round(rnd() * 80) / 100; // 30,00–30,80
          return {
            id: `${prefix}${i}`,
            refueledOn: days[Math.floor(rnd() * 3)]!,
            liters,
            amountEur: Math.round(liters * 175) / 100,
          };
        });
      const lines = mk("L", 4).map((x) => line(x.id, x));
      const logs = mk("F", 4).map((x) => log(x.id, x));
      const expected = brute(lines, logs);
      const r = reconcileFuel(lines, logs);
      const matched = r.lines.filter((l) => l.status === "matched");
      const total = matched.reduce(
        (sum, l) =>
          sum +
          cost(
            lines.find((x) => x.id === l.lineId)!,
            logs.find((f) => f.id === l.fuelLogId)!,
          )!,
        0,
      );
      expect([k, matched.length, total]).toEqual([k, expected.pairs, expected.total]);
    }
  });

  it("assegnazione ottima: una riga esatta non perde il suo pieno se l'altra ha un'alternativa libera", () => {
    const logs = [
      log("X", { liters: 30, amountEur: 50 }),
      log("Y", { liters: 30.4, amountEur: 50.4 }),
      log("Z", { liters: 30.3, amountEur: 50.3 }),
    ];
    const lines = [
      line("L1", { liters: 30, amountEur: 50 }),
      line("L2", { liters: 30.3, amountEur: 50.3 }),
    ];
    const r = reconcileFuel(lines, logs);
    expect(Object.fromEntries(r.lines.map((l) => [l.lineId, l.fuelLogId]))).toEqual({
      L1: "X",
      L2: "Z",
    });
  });

  it("un buono che non torna non si prende il rifornimento che un'altra riga abbina davvero", () => {
    const logs = [log("F", { receiptNumber: "3", liters: 40, amountEur: 70 })];
    const lines = [
      line("Lbuono", { receiptNumber: "3", liters: 55, amountEur: 96 }),
      line("Lgiusta", { liters: 40, amountEur: 70 }),
    ];
    const r = reconcileFuel(lines, logs);
    expect(Object.fromEntries(r.lines.map((l) => [l.lineId, [l.fuelLogId, l.status]]))).toEqual({
      Lbuono: [null, "unmatched"],
      Lgiusta: ["F", "matched"],
    });
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
