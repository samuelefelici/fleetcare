/**
 * Abbinamento fra la fattura mensile del distributore e i rifornimenti
 * registrati dall'equipaggio. Logica pura: righe in ingresso, esito per
 * riga in uscita. Chi chiama scrive l'esito su `fuel_invoice_lines`.
 *
 * Tre passate, dalla prova più forte alla più debole:
 *   1. stesso numero di buono/scontrino
 *   2. stesso mezzo, stesso prodotto, data vicina, litri e importo che tornano
 *   3. stesso mezzo e data vicina ma numeri che NON tornano → `mismatch`
 *      (c'è un rifornimento candidato: va guardato, non ignorato)
 * Le righe rimaste sono `unmatched`: fatturate ma mai registrate. I
 * rifornimenti rimasti sono registrati ma non fatturati.
 *
 * Ogni rifornimento si abbina a una riga sola, e nelle passate 2 e 3 vince
 * la coppia più vicina in assoluto, non la prima trovata: con un mezzo che
 * fa due pieni lo stesso giorno, l'ordine delle righe non deve decidere.
 */

import { daysBetween, type IsoDate } from "./deadlines";

export interface FuelLogForMatch {
  id: string;
  vehicleId: string;
  refueledOn: IsoDate;
  product: string;
  liters: number;
  /** IVA inclusa, come sullo scontrino */
  amountEur: number | null;
  receiptNumber: string | null;
}

export interface InvoiceLineForMatch {
  id: string;
  /** null se la targa della riga non è stata riconosciuta */
  vehicleId: string | null;
  refueledOn: IsoDate;
  product: string;
  liters: number | null;
  /** già riportato al lordo IVA (vedi `grossAmount`) */
  amountEur: number;
  receiptNumber: string | null;
}

export interface MatchTolerance {
  /** distanza massima fra le date, in giorni */
  days: number;
  liters: number;
  amountEur: number;
}

export const DEFAULT_TOLERANCE: MatchTolerance = { days: 1, liters: 0.5, amountEur: 0.5 };

export type LineMatchStatus = "matched" | "mismatch" | "unmatched";

export interface LineMatch {
  lineId: string;
  status: LineMatchStatus;
  fuelLogId: string | null;
  /** fattura − registrato */
  litersDiff: number | null;
  amountDiff: number | null;
  reason: string;
}

export interface ReconciliationResult {
  lines: LineMatch[];
  /** rifornimenti registrati che nessuna riga di fattura ha spiegato */
  unbilledLogIds: string[];
}

/** Targa normalizzata per il confronto: maiuscole, solo lettere e cifre. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Riconosce il mezzo dalla targa scritta dal distributore o dal codice tessera. */
export function resolveVehicleId(
  plateRaw: string | null,
  vehicles: ReadonlyArray<{ id: string; plate: string; fuelCardCode: string | null }>,
): string | null {
  if (!plateRaw) return null;
  const key = normalizePlate(plateRaw);
  if (!key) return null;
  const hit = vehicles.find(
    (v) =>
      normalizePlate(v.plate) === key ||
      (v.fuelCardCode !== null && normalizePlate(v.fuelCardCode) === key),
  );
  return hit?.id ?? null;
}

/** Importo della riga al lordo IVA, arrotondato al centesimo. */
export function grossAmount(amount: number, vatRatePct: number, includesVat: boolean): number {
  const gross = includesVat ? amount : amount * (1 + vatRatePct / 100);
  return Math.round(gross * 100) / 100;
}

function normalizeReceipt(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^0+(?=.)/, "");
  return key || null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Comparison {
  litersDiff: number | null;
  amountDiff: number | null;
  /** litri e importo, dove confrontabili, stanno nella tolleranza */
  withinTolerance: boolean;
  /** distanza per ordinare i candidati: prima la data, poi i litri, poi l'importo */
  distance: [number, number, number];
}

function compare(line: InvoiceLineForMatch, log: FuelLogForMatch, tol: MatchTolerance): Comparison {
  const litersDiff = line.liters === null ? null : round2(line.liters - log.liters);
  const amountDiff = log.amountEur === null ? null : round2(line.amountEur - log.amountEur);
  const litersOk = litersDiff === null || Math.abs(litersDiff) <= tol.liters;
  const amountOk = amountDiff === null || Math.abs(amountDiff) <= tol.amountEur;
  // senza almeno un numero confrontabile non c'è prova che sia lo stesso pieno
  const comparable = litersDiff !== null || amountDiff !== null;
  return {
    litersDiff,
    amountDiff,
    withinTolerance: comparable && litersOk && amountOk,
    distance: [
      Math.abs(daysBetween(log.refueledOn, line.refueledOn)),
      Math.abs(litersDiff ?? 0),
      Math.abs(amountDiff ?? 0),
    ],
  };
}

function byDistance(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function describe(c: Comparison): string {
  const parts: string[] = [];
  if (c.litersDiff !== null && c.litersDiff !== 0)
    parts.push(`litri ${c.litersDiff > 0 ? "+" : ""}${c.litersDiff}`);
  if (c.amountDiff !== null && c.amountDiff !== 0)
    parts.push(`importo ${c.amountDiff > 0 ? "+" : ""}${c.amountDiff.toFixed(2)} €`);
  return parts.join(", ");
}

export function reconcileFuel(
  lines: ReadonlyArray<InvoiceLineForMatch>,
  logs: ReadonlyArray<FuelLogForMatch>,
  tol: MatchTolerance = DEFAULT_TOLERANCE,
): ReconciliationResult {
  const result = new Map<string, LineMatch>();
  const usedLogs = new Set<string>();

  const assign = (
    line: InvoiceLineForMatch,
    log: FuelLogForMatch,
    c: Comparison,
    status: LineMatchStatus,
    reason: string,
  ) => {
    usedLogs.add(log.id);
    result.set(line.id, {
      lineId: line.id,
      status,
      fuelLogId: log.id,
      litersDiff: c.litersDiff,
      amountDiff: c.amountDiff,
      reason,
    });
  };

  // 1. numero di buono
  for (const line of lines) {
    const receipt = normalizeReceipt(line.receiptNumber);
    if (!receipt) continue;
    const log = logs.find(
      (l) =>
        !usedLogs.has(l.id) &&
        normalizeReceipt(l.receiptNumber) === receipt &&
        // i buoni si ripetono (numerazione per giorno o per pompa): serve anche la data
        Math.abs(daysBetween(l.refueledOn, line.refueledOn)) <= tol.days &&
        (line.vehicleId === null || l.vehicleId === line.vehicleId),
    );
    if (!log) continue;
    const c = compare(line, log, tol);
    if (c.withinTolerance) assign(line, log, c, "matched", "stesso buono");
    else assign(line, log, c, "mismatch", `stesso buono, numeri diversi: ${describe(c)}`);
  }

  // 2 e 3. mezzo + prodotto + data, la coppia più vicina per prima
  const pairs = (withinTolerance: boolean) => {
    const out: { line: InvoiceLineForMatch; log: FuelLogForMatch; c: Comparison }[] = [];
    for (const line of lines) {
      if (result.has(line.id) || line.vehicleId === null) continue;
      for (const log of logs) {
        if (
          usedLogs.has(log.id) ||
          log.vehicleId !== line.vehicleId ||
          log.product !== line.product
        )
          continue;
        if (Math.abs(daysBetween(log.refueledOn, line.refueledOn)) > tol.days) continue;
        const c = compare(line, log, tol);
        if (c.withinTolerance === withinTolerance) out.push({ line, log, c });
      }
    }
    return out.sort((a, b) => byDistance(a.c.distance, b.c.distance));
  };

  for (const { line, log, c } of pairs(true)) {
    if (result.has(line.id) || usedLogs.has(log.id)) continue;
    assign(line, log, c, "matched", "stesso mezzo, data e quantità");
  }
  for (const { line, log, c } of pairs(false)) {
    if (result.has(line.id) || usedLogs.has(log.id)) continue;
    assign(
      line,
      log,
      c,
      "mismatch",
      `stesso mezzo e data, numeri diversi: ${describe(c) || "importo non registrato"}`,
    );
  }

  // 4. quello che resta
  const lineMatches = lines.map(
    (line): LineMatch =>
      result.get(line.id) ?? {
        lineId: line.id,
        status: "unmatched",
        fuelLogId: null,
        litersDiff: null,
        amountDiff: null,
        reason:
          line.vehicleId === null
            ? "targa non riconosciuta"
            : "fatturato ma nessun rifornimento registrato",
      },
  );

  return {
    lines: lineMatches,
    unbilledLogIds: logs.filter((l) => !usedLogs.has(l.id)).map((l) => l.id),
  };
}
