/**
 * Motore delle scadenze, logica pura: date in ingresso, stato in uscita.
 * Nessun accesso al DB, nessun `Date` locale.
 *
 * Le date sono stringhe ISO `YYYY-MM-DD`, come le restituisce Drizzle per
 * le colonne `date`. Lavorare sul giorno di calendario, e non su un
 * istante, toglie alla radice l'errore classico del «scade domani» che
 * diventa «scade oggi» perché il server è in UTC e l'utente a Roma. Il
 * «oggi» lo decide chi chiama, nel fuso dell'associazione.
 */

export type IsoDate = string;

export interface DeadlineInterval {
  months?: number | null;
  days?: number | null;
  km?: number | null;
  /** la scadenza cade l'ultimo giorno del mese (revisione: «entro il mese») */
  monthEnd?: boolean;
  /** si conta dalla scadenza precedente e non dal giorno dell'adempimento (RCA, bollo) */
  renewFromDue?: boolean;
}

export interface NextDue {
  dueOn: IsoDate | null;
  dueKm: number | null;
}

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  return m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1]!;
}

/**
 * Una data di calendario vera, fra il 1900 e il 9999. Il 30 febbraio o il
 * 31 aprile non diventano in silenzio il 2 marzo o il 1° maggio: sono un
 * errore di chi ha scritto la data, e si rifiutano.
 */
function parse(iso: IsoDate): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Data non valida: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new Error(`Data non valida: ${iso}`);
  }
  return { y, m, d };
}

function utc(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function toUtcMs(iso: IsoDate): number {
  const { y, m, d } = parse(iso);
  return utc(y, m, d);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Aggiunge mesi di calendario; il giorno si ferma all'ultimo del mese (31 gen + 1 mese = 28/29 feb). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { y, m, d } = parse(iso);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  return fromUtcMs(utc(ty, tm, Math.min(d, daysInMonth(ty, tm))));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(iso) + days * MS_PER_DAY);
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const { y, m } = parse(iso);
  return fromUtcMs(utc(y, m, daysInMonth(y, m)));
}

/** Giorni da `from` a `to` (negativo se `to` è prima). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

function addInterval(from: IsoDate, interval: DeadlineInterval): IsoDate | null {
  let due: IsoDate | null = null;
  if (interval.months) due = addMonths(from, interval.months);
  else if (interval.days) due = addDays(from, interval.days);
  if (due && interval.monthEnd) due = endOfMonth(due);
  return due;
}

/**
 * Prossima scadenza dopo un adempimento fatto il giorno `doneOn` a
 * `doneKm` km. Una scadenza senza periodicità (elettrodi, fine vita,
 * autorizzazione) restituisce null: la data nuova si legge dal documento.
 *
 * Con `renewFromDue` (RCA, bollo) si conta dalla scadenza precedente
 * `previousDueOn`: la polizza rinnovata in anticipo o nei giorni di
 * tolleranza scade comunque all'anniversario. Se però l'anniversario così
 * calcolato è già passato (un mezzo rimasto fermo e scoperto per mesi), il
 * nuovo periodo parte dall'adempimento.
 */
export function nextDue(
  doneOn: IsoDate,
  doneKm: number | null,
  interval: DeadlineInterval,
  previousDueOn: IsoDate | null = null,
): NextDue {
  if (interval.months && interval.days) {
    throw new Error("Periodicità in mesi o in giorni, non entrambe");
  }
  parse(doneOn);
  let dueOn = addInterval(doneOn, interval);
  if (dueOn && interval.renewFromDue && previousDueOn) {
    const fromDue = addInterval(previousDueOn, interval);
    if (fromDue && daysBetween(doneOn, fromDue) > 0) dueOn = fromDue;
  }
  const dueKm = interval.km && doneKm !== null ? doneKm + interval.km : null;
  return { dueOn, dueKm };
}

/**
 * - `missing`  la scadenza esiste ma non ha né data né km: dato da completare
 * - `expired`  superata (il giorno stesso della scadenza è ancora valido)
 * - `expiring` dentro il preavviso
 * - `ok`
 */
export type DeadlineState = "ok" | "expiring" | "expired" | "missing";

export interface DeadlineInput {
  dueOn: IsoDate | null;
  dueKm: number | null;
  alertDays: number;
  /** preavviso in km; nullo = si avvisa solo quando i km sono raggiunti */
  alertKm: number | null;
}

export interface DeadlineEvaluation {
  state: DeadlineState;
  /** giorni alla scadenza: negativo se superata */
  daysLeft: number | null;
  /** km alla scadenza: negativo se superata */
  kmLeft: number | null;
  /** quale delle due dimensioni ha deciso lo stato */
  trigger: "date" | "km" | null;
}

const SEVERITY: Record<DeadlineState, number> = { ok: 0, expiring: 1, missing: 1, expired: 2 };

/**
 * Stato di una scadenza oggi. Con data e km insieme (il tagliando: 12 mesi
 * o 30.000 km) vale **il primo raggiunto**: lo stato è il peggiore dei due.
 * Se il contachilometri non è noto, la dimensione km non si valuta.
 */
export function evaluateDeadline(
  deadline: DeadlineInput,
  today: IsoDate,
  odometerKm: number | null,
): DeadlineEvaluation {
  const byDate =
    deadline.dueOn === null
      ? null
      : (() => {
          const daysLeft = daysBetween(today, deadline.dueOn);
          const state: DeadlineState =
            daysLeft < 0 ? "expired" : daysLeft <= deadline.alertDays ? "expiring" : "ok";
          return { state, daysLeft };
        })();

  const byKm =
    deadline.dueKm === null || odometerKm === null
      ? null
      : (() => {
          const kmLeft = deadline.dueKm - odometerKm;
          const state: DeadlineState =
            kmLeft < 0 ? "expired" : kmLeft <= (deadline.alertKm ?? 0) ? "expiring" : "ok";
          return { state, kmLeft };
        })();

  const daysLeft = byDate?.daysLeft ?? null;
  const kmLeft = byKm?.kmLeft ?? null;

  if (!byDate && !byKm) {
    return { state: "missing", daysLeft, kmLeft, trigger: null };
  }
  if (byDate && (!byKm || SEVERITY[byDate.state] >= SEVERITY[byKm.state])) {
    return { state: byDate.state, daysLeft, kmLeft, trigger: "date" };
  }
  return { state: byKm!.state, daysLeft, kmLeft, trigger: "km" };
}

export type Semaphore = "green" | "yellow" | "red";

export interface SemaphoreResult {
  color: Semaphore;
  /** almeno una scadenza bloccante superata: il mezzo/attrezzatura non deve essere usato */
  blocked: boolean;
}

/**
 * Semaforo di un mezzo (o di un'attrezzatura) dalle sue scadenze:
 * - rosso  se una scadenza bloccante è superata
 * - giallo se qualcosa è superato (non bloccante), in preavviso o senza data
 * - verde  altrimenti
 *
 * Una scadenza senza data è gialla, non verde: «non sappiamo» non è «in regola».
 * Le scadenze archiviate non si passano: sono eliminate.
 */
export function semaphore(
  items: ReadonlyArray<{ state: DeadlineState; blocking: boolean }>,
): SemaphoreResult {
  const blocked = items.some((i) => i.blocking && i.state === "expired");
  if (blocked) return { color: "red", blocked };
  const warn = items.some((i) => i.state !== "ok");
  return { color: warn ? "yellow" : "green", blocked };
}

// ------------------------------------------------------------------
// Valori effettivi: scadenza → regola → tipo
// ------------------------------------------------------------------

export interface DeadlineTypeDefaults {
  intervalMonths: number | null;
  intervalDays: number | null;
  intervalKm: number | null;
  alertDays: number;
  alertKm: number | null;
  blocking: boolean;
}

/** I valori di un livello (regola o scadenza): nullo o assente = eredita. */
export type DeadlineOverrides = {
  [K in keyof DeadlineTypeDefaults]?: DeadlineTypeDefaults[K] | null;
};

/**
 * Sovrappone un livello ai valori sotto: ogni campo nullo eredita. Mesi e
 * giorni si escludono: se il livello ne fissa uno, l'altro di sotto non
 * passa.
 */
export function resolveRule(
  base: DeadlineTypeDefaults,
  over: DeadlineOverrides,
): DeadlineTypeDefaults {
  const setsTime = (over.intervalMonths ?? null) !== null || (over.intervalDays ?? null) !== null;
  return {
    intervalMonths: setsTime ? (over.intervalMonths ?? null) : base.intervalMonths,
    intervalDays: setsTime ? (over.intervalDays ?? null) : base.intervalDays,
    intervalKm: over.intervalKm ?? base.intervalKm,
    alertDays: over.alertDays ?? base.alertDays,
    alertKm: over.alertKm ?? base.alertKm,
    blocking: over.blocking ?? base.blocking,
  };
}

/**
 * I valori effettivi di una scadenza: la correzione a mano, altrimenti la
 * regola, altrimenti il tipo. È la stessa catena della vista SQL
 * `deadlines_effective` (tests/deadlines.test.sql verifica che coincidano).
 */
export function effectiveDeadline(
  type: DeadlineTypeDefaults,
  rule: DeadlineOverrides | null,
  deadline: DeadlineOverrides,
): DeadlineTypeDefaults {
  return resolveRule(resolveRule(type, rule ?? {}), deadline);
}

// ------------------------------------------------------------------
// Quali scadenze nascono per un mezzo o un'attrezzatura nuovi
// ------------------------------------------------------------------

/** Una regola come la legge chi deve far nascere le scadenze di un nuovo mezzo o attrezzatura. */
export interface PlannableRule extends DeadlineOverrides {
  deadlineTypeId: string;
  vehicleCategory: string | null;
  equipmentTypeId: string | null;
  /** null = qualunque proprietà */
  ownershipKinds: string[] | null;
  /** il tipo di scadenza; archiviato = eliminato dall'associazione */
  type: DeadlineTypeDefaults & { archived: boolean; isVehicleTax: boolean };
}

export type PlanSubject =
  | { kind: "vehicle"; category: string; ownership: string; bolloExempt: boolean }
  | { kind: "equipment"; equipmentTypeId: string; ownership: string };

export interface PlannedDeadline {
  deadlineTypeId: string;
  /** i valori che la scadenza avrà ereditando: si mostrano, non si scrivono */
  effective: DeadlineTypeDefaults;
}

/**
 * Le scadenze che nascono per un mezzo o un'attrezzatura appena creati:
 * le regole della sua categoria (o del suo tipo).
 *
 * - un tipo di scadenza archiviato non genera più niente;
 * - una regola con `ownershipKinds` vale solo per quelle proprietà (la
 *   bombola a scambio del fornitore non ha il collaudo a carico nostro, il
 *   mezzo a noleggio non ha il nostro bollo);
 * - un mezzo esente non riceve la tassa automobilistica.
 *
 * Le scadenze si scrivono con i soli riferimenti (tipo e soggetto): i
 * valori li ereditano. Le date non si inventano: nascono «da completare»,
 * la prima data la scrive chi ha in mano il documento.
 */
export function planDeadlines(
  subject: PlanSubject,
  rules: ReadonlyArray<PlannableRule>,
): PlannedDeadline[] {
  return rules
    .filter((r) => !r.type.archived)
    .filter((r) => r.ownershipKinds === null || r.ownershipKinds.includes(subject.ownership))
    .filter((r) =>
      subject.kind === "vehicle"
        ? r.vehicleCategory === subject.category && !(subject.bolloExempt && r.type.isVehicleTax)
        : r.equipmentTypeId === subject.equipmentTypeId,
    )
    .map((r) => ({ deadlineTypeId: r.deadlineTypeId, effective: resolveRule(r.type, r) }));
}
