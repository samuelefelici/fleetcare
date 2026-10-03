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
  /** null se la matricola della riga non è stata riconosciuta */
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

/**
 * Matricola o numero interno normalizzati: come la targa, e in più un
 * codice fatto solo di cifre perde gli zeri iniziali («005» e «5» sono lo
 * stesso mezzo: il distributore e l'associazione non li scrivono uguali).
 */
export function normalizeVehicleCode(raw: string): string {
  // la stessa regola degli indici unici di `vehicles` (migration 0000)
  return normalizePlate(raw).replace(/^0+(\d+)$/, "$1");
}

export interface VehicleForMatch {
  id: string;
  plate: string;
  internalCode: string;
  /** la matricola del distributore, se diversa dal numero interno */
  fuelVehicleCode: string | null;
}

/**
 * Riconosce il mezzo dalla matricola scritta dal distributore.
 *
 * Un mezzo con una matricola del distributore registrata
 * (`fuelVehicleCode`) si riconosce solo da quella; un mezzo senza, dal
 * numero interno. Se così i mezzi possibili sono più di uno (la matricola
 * di un mezzo è il numero interno di un altro) non indovina: restituisce
 * null e la riga resta da abbinare a mano. Solo se nessun codice
 * corrisponde prova la targa.
 */
export function resolveVehicleId(
  vehicleRefRaw: string | null,
  vehicles: ReadonlyArray<VehicleForMatch>,
): string | null {
  if (!vehicleRefRaw) return null;
  const code = normalizeVehicleCode(vehicleRefRaw);
  if (!code) return null;
  const byCode = vehicles.filter(
    (v) => normalizeVehicleCode(v.fuelVehicleCode ?? v.internalCode) === code,
  );
  if (byCode.length === 1) return byCode[0]!.id;
  if (byCode.length > 1) return null;
  const byPlate = vehicles.filter((v) => normalizePlate(v.plate) === normalizePlate(vehicleRefRaw));
  return byPlate.length === 1 ? byPlate[0]!.id : null;
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

  const sameDayish = (line: InvoiceLineForMatch, log: FuelLogForMatch) =>
    Math.abs(daysBetween(log.refueledOn, line.refueledOn)) <= tol.days;

  // 1. numero di buono: stesso buono, stesso prodotto, data vicina (i buoni
  //    si ripetono fra giorni e pompe). Fra più candidati vince il più vicino.
  for (const line of lines) {
    const receipt = normalizeReceipt(line.receiptNumber);
    if (!receipt) continue;
    const best = logs
      .filter(
        (l) =>
          !usedLogs.has(l.id) &&
          normalizeReceipt(l.receiptNumber) === receipt &&
          l.product === line.product &&
          sameDayish(line, l) &&
          (line.vehicleId === null || l.vehicleId === line.vehicleId),
      )
      .map((log) => ({ log, c: compare(line, log, tol) }))
      .sort((a, b) => byDistance(a.c.distance, b.c.distance))[0];
    if (!best) continue;
    const { log, c } = best;
    if (c.withinTolerance) assign(line, log, c, "matched", "stesso buono");
    else if (c.litersDiff === null && c.amountDiff === null)
      assign(line, log, c, "matched", "stesso buono (litri e importo non confrontabili)");
    else assign(line, log, c, "mismatch", `stesso buono, numeri diversi: ${describe(c)}`);
  }

  // candidati per mezzo + prodotto + data, ordinati dal più vicino
  const candidates = (withinTolerance: boolean) => {
    const out = new Map<string, { log: FuelLogForMatch; c: Comparison }[]>();
    for (const line of lines) {
      if (result.has(line.id) || line.vehicleId === null) continue;
      const list = logs
        .filter(
          (log) =>
            !usedLogs.has(log.id) &&
            log.vehicleId === line.vehicleId &&
            log.product === line.product &&
            sameDayish(line, log),
        )
        .map((log) => ({ log, c: compare(line, log, tol) }))
        .filter((x) => x.c.withinTolerance === withinTolerance)
        .sort((a, b) => byDistance(a.c.distance, b.c.distance));
      if (list.length) out.set(line.id, list);
    }
    return out;
  };

  // 2. abbinamento entro tolleranza: il massimo numero di coppie, preferendo
  //    le più vicine. Un greedy «prima la coppia più vicina» sbaglia quando il
  //    distributore sposta le date di un giorno e il mezzo fa pieni simili in
  //    giorni consecutivi: una riga ruba il rifornimento all'altra e restano
  //    una riga e un rifornimento orfani. Qui una riga già abbinata cede il
  //    suo rifornimento se ne ha un altro (cammino aumentante).
  const within = candidates(true);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const owner = new Map<string, string>(); // rifornimento → riga
  const tryAssign = (lineId: string, seen: Set<string>): boolean => {
    for (const { log } of within.get(lineId) ?? []) {
      if (seen.has(log.id)) continue;
      seen.add(log.id);
      const holder = owner.get(log.id);
      if (holder === undefined || tryAssign(holder, seen)) {
        owner.set(log.id, lineId);
        return true;
      }
    }
    return false;
  };
  const order = [...within.entries()].sort((a, b) =>
    byDistance(a[1][0]!.c.distance, b[1][0]!.c.distance),
  );
  for (const [lineId] of order) tryAssign(lineId, new Set());
  for (const [logId, lineId] of owner) {
    const found = within.get(lineId)!.find((x) => x.log.id === logId)!;
    assign(lineById.get(lineId)!, found.log, found.c, "matched", "stesso mezzo, data e quantità");
  }

  // 3. sullo stesso mezzo e prodotto, data vicina, ma numeri che non tornano:
  //    il candidato più vicino, da guardare a mano
  const pairs = [...candidates(false).entries()]
    .flatMap(([lineId, list]) => list.map((x) => ({ line: lineById.get(lineId)!, ...x })))
    .sort((a, b) => byDistance(a.c.distance, b.c.distance));
  for (const { line, log, c } of pairs) {
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
            ? "matricola non riconosciuta"
            : "fatturato ma nessun rifornimento registrato",
      },
  );

  return {
    lines: lineMatches,
    unbilledLogIds: logs.filter((l) => !usedLogs.has(l.id)).map((l) => l.id),
  };
}
