/**
 * Abbinamento fra la fattura mensile del distributore e i rifornimenti
 * registrati dall'equipaggio. Logica pura: righe in ingresso, esito per
 * riga in uscita. Chi chiama scrive l'esito su `fuel_invoice_lines`.
 *
 * Quattro passate, dalla prova più forte alla più debole:
 *   1. stesso numero di buono (stesso prodotto, data vicina) con numeri che
 *      tornano o che non si possono confrontare;
 *   2. stesso mezzo, prodotto e data, litri e importo entro tolleranza:
 *      l'assegnazione ottima (il massimo numero di coppie e, a parità, la
 *      distanza complessiva minima);
 *   3. stesso buono ma numeri che NON tornano → `mismatch`;
 *   4. stesso mezzo, prodotto e data ma numeri che non tornano → `mismatch`
 *      (c'è un rifornimento candidato: va guardato, non ignorato).
 * Le righe rimaste sono `unmatched`: fatturate ma mai registrate. I
 * rifornimenti rimasti sono registrati ma non fatturati.
 *
 * Ogni rifornimento si abbina a una riga sola, e il risultato non dipende
 * dall'ordine in cui arrivano righe e rifornimenti: le coppie si scelgono
 * dalla più vicina in assoluto (a parità, per id). Un `mismatch` non si
 * prende mai un rifornimento che un'altra riga abbinerebbe davvero.
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
  // la stessa regola degli indici unici di `vehicles` (tests/effective.dbtest.ts li confronta)
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
  // una matricola del distributore vuota (o di soli spazi) non è una matricola
  const ownCode = (v: VehicleForMatch) =>
    v.fuelVehicleCode && normalizeVehicleCode(v.fuelVehicleCode)
      ? v.fuelVehicleCode
      : v.internalCode;
  const byCode = vehicles.filter((v) => normalizeVehicleCode(ownCode(v)) === code);
  if (byCode.length === 1) return byCode[0]!.id;
  if (byCode.length > 1) return null;
  const byPlate = vehicles.filter((v) => normalizePlate(v.plate) === normalizePlate(vehicleRefRaw));
  return byPlate.length === 1 ? byPlate[0]!.id : null;
}

/**
 * Arrotonda al centesimo, il mezzo centesimo per eccesso. `Math.round(x * 100)`
 * da solo sbaglia: 28,75 € + 22% fa 35,075, che in virgola mobile è
 * 35,07499999… e diventerebbe 35,07. Ridotto a 12 cifre significative il
 * numero torna quello scritto.
 */
function roundCents(n: number): number {
  return Math.round(Number((n * 100).toPrecision(12))) / 100;
}

/** Importo della riga al lordo IVA, arrotondato al centesimo. */
export function grossAmount(amount: number, vatRatePct: number, includesVat: boolean): number {
  return roundCents(includesVat ? amount : amount * (1 + vatRatePct / 100));
}

function normalizeReceipt(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^0+(?=.)/, "");
  return key || null;
}

interface Comparison {
  litersDiff: number | null;
  amountDiff: number | null;
  /** litri e importo, dove confrontabili, stanno nella tolleranza */
  withinTolerance: boolean;
  /** distanza per ordinare i candidati: prima la data, poi i litri, poi l'importo */
  distance: [number, number, number];
}

function compare(line: InvoiceLineForMatch, log: FuelLogForMatch, tol: MatchTolerance): Comparison {
  const litersDiff = line.liters === null ? null : roundCents(line.liters - log.liters);
  const amountDiff = log.amountEur === null ? null : roundCents(line.amountEur - log.amountEur);
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

interface Candidate {
  line: InvoiceLineForMatch;
  log: FuelLogForMatch;
  c: Comparison;
}

/** dalla coppia più vicina; a parità decidono gli id, così l'ordine dell'input non conta */
function byCloseness(a: Candidate, b: Candidate): number {
  return (
    byDistance(a.c.distance, b.c.distance) ||
    a.line.id.localeCompare(b.line.id) ||
    a.log.id.localeCompare(b.log.id)
  );
}

/** Distanza come intero, in ordine lessicografico: giorni, poi centesimi di litro, poi centesimi di euro. */
function cost(c: Comparison): number {
  const [days, liters, amount] = c.distance;
  return days * 1_000_000 + Math.round(liters * 100) * 1_000 + Math.round(amount * 100);
}

/**
 * Le coppie da tenere fra quelle candidate: massimo numero e, a parità,
 * costo totale minimo. Matrice quadrata righe × rifornimenti in cui una
 * coppia non candidata (e il riempimento) costa NONE, più di qualunque
 * somma di coppie vere: così l'ottimo usa prima tutte le coppie possibili.
 * Righe e rifornimenti in ordine di id: il risultato non dipende
 * dall'ordine dell'input.
 */
function optimalAssignment(candidates: Candidate[]): Candidate[] {
  const lineIds = [...new Set(candidates.map((x) => x.line.id))].sort();
  const logIds = [...new Set(candidates.map((x) => x.log.id))].sort();
  const n = Math.max(lineIds.length, logIds.length);
  const NONE = 1e12;
  const pair = new Map(candidates.map((x) => [`${x.line.id}|${x.log.id}`, x]));
  const a = (i: number, j: number): number => {
    const x =
      i < lineIds.length && j < logIds.length ? pair.get(`${lineIds[i]}|${logIds[j]}`) : undefined;
    return x ? cost(x.c) : NONE;
  };

  // Kuhn–Munkres con potenziali (indici da 1, colonna 0 di servizio)
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0); // p[j] = riga assegnata alla colonna j
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = a(i0 - 1, j - 1) - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }

  const out: Candidate[] = [];
  for (let j = 1; j <= n; j++) {
    const i = p[j]!;
    if (i === 0 || i > lineIds.length || j > logIds.length) continue;
    const x = pair.get(`${lineIds[i - 1]}|${logIds[j - 1]}`);
    if (x) out.push(x);
  }
  return out;
}

export function reconcileFuel(
  lines: ReadonlyArray<InvoiceLineForMatch>,
  logs: ReadonlyArray<FuelLogForMatch>,
  tol: MatchTolerance = DEFAULT_TOLERANCE,
): ReconciliationResult {
  const result = new Map<string, LineMatch>();
  const usedLogs = new Set<string>();

  const assign = ({ line, log, c }: Candidate, status: LineMatchStatus, reason: string) => {
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
  const free = (x: Candidate) => !result.has(x.line.id) && !usedLogs.has(x.log.id);
  const nearDate = (line: InvoiceLineForMatch, log: FuelLogForMatch) =>
    Math.abs(daysBetween(log.refueledOn, line.refueledOn)) <= tol.days;

  // tutte le coppie possibili, una volta sola
  const byReceipt: Candidate[] = [];
  const byVehicle: Candidate[] = [];
  for (const line of lines) {
    const receipt = normalizeReceipt(line.receiptNumber);
    for (const log of logs) {
      if (log.product !== line.product || !nearDate(line, log)) continue;
      const sameVehicle = line.vehicleId !== null && log.vehicleId === line.vehicleId;
      const sameReceipt =
        receipt !== null &&
        normalizeReceipt(log.receiptNumber) === receipt &&
        (line.vehicleId === null || sameVehicle);
      if (!sameReceipt && !sameVehicle) continue;
      const candidate = { line, log, c: compare(line, log, tol) };
      if (sameReceipt) byReceipt.push(candidate);
      if (sameVehicle) byVehicle.push(candidate);
    }
  }
  byReceipt.sort(byCloseness);
  byVehicle.sort(byCloseness);

  const notComparable = (x: Candidate) => x.c.litersDiff === null && x.c.amountDiff === null;

  // 1. stesso buono, numeri che tornano (o che non si possono confrontare):
  //    assegnazione ottima per buono e prodotto, come la passata 2. I numeri
  //    dei buoni si ripetono: con due righe e due pieni dello stesso buono
  //    in giorni vicini, la coppia più vicina presa per prima può lasciare
  //    orfani una riga e un pieno che si potevano abbinare.
  const receiptGroups = new Map<string, Candidate[]>();
  for (const x of byReceipt) {
    if (!x.c.withinTolerance && !notComparable(x)) continue;
    const key = `${normalizeReceipt(x.line.receiptNumber)}|${x.line.product}`;
    const list = receiptGroups.get(key) ?? [];
    list.push(x);
    receiptGroups.set(key, list);
  }
  for (const key of [...receiptGroups.keys()].sort()) {
    for (const x of optimalAssignment(receiptGroups.get(key)!)) {
      assign(
        x,
        "matched",
        x.c.withinTolerance ? "stesso buono" : "stesso buono (litri e importo non confrontabili)",
      );
    }
  }

  // 2. stesso mezzo entro tolleranza: assegnazione OTTIMA per mezzo e
  //    prodotto — il massimo numero di coppie e, a parità, la distanza
  //    complessiva minima (algoritmo ungherese). Ogni scelta greedy ha un
  //    controesempio: con le date del distributore spostate di un giorno e
  //    pieni simili in giorni consecutivi, una riga ruba il rifornimento
  //    all'altra e restano orfani; il rimedio greedy sposta invece una riga
  //    esatta su un pieno peggiore. I gruppi sono piccoli (una ventina di
  //    pieni al mese per mezzo): O(n³) non costa niente.
  const groups = new Map<string, Candidate[]>();
  for (const x of byVehicle) {
    if (!x.c.withinTolerance || !free(x)) continue;
    const key = `${x.line.vehicleId}|${x.line.product}`;
    const list = groups.get(key) ?? [];
    list.push(x);
    groups.set(key, list);
  }
  for (const key of [...groups.keys()].sort()) {
    for (const x of optimalAssignment(groups.get(key)!)) {
      assign(x, "matched", "stesso mezzo, data e quantità");
    }
  }

  // 3. stesso buono, numeri diversi
  for (const x of byReceipt) {
    if (!free(x)) continue;
    assign(x, "mismatch", `stesso buono, numeri diversi: ${describe(x.c)}`);
  }

  // 4. stesso mezzo e data, numeri diversi: il candidato più vicino
  for (const x of byVehicle) {
    if (!free(x)) continue;
    assign(
      x,
      "mismatch",
      `stesso mezzo e data, numeri diversi: ${describe(x.c) || "importo non registrato"}`,
    );
  }

  // quello che resta
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
