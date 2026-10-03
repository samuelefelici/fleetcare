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
}

export interface NextDue {
  dueOn: IsoDate | null;
  dueKm: number | null;
}

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(iso: IsoDate): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Data non valida: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function toUtcMs(iso: IsoDate): number {
  const { y, m, d } = parse(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Aggiunge mesi di calendario; il giorno si ferma all'ultimo del mese (31 gen + 1 mese = 28/29 feb). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { y, m, d } = parse(iso);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  return fromUtcMs(Date.UTC(ty, tm - 1, Math.min(d, daysInMonth(ty, tm))));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(iso) + days * MS_PER_DAY);
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const { y, m } = parse(iso);
  return fromUtcMs(Date.UTC(y, m - 1, daysInMonth(y, m)));
}

/** Giorni da `from` a `to` (negativo se `to` è prima). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/**
 * Prossima scadenza dopo un adempimento fatto il giorno `doneOn` a
 * `doneKm` km. Una scadenza senza periodicità (elettrodi, fine vita,
 * autorizzazione) restituisce null: la data nuova si legge dal documento.
 */
export function nextDue(
  doneOn: IsoDate,
  doneKm: number | null,
  interval: DeadlineInterval,
): NextDue {
  if (interval.months && interval.days) {
    throw new Error("Periodicità in mesi o in giorni, non entrambe");
  }
  let dueOn: IsoDate | null = null;
  if (interval.months) dueOn = addMonths(doneOn, interval.months);
  else if (interval.days) dueOn = addDays(doneOn, interval.days);
  if (dueOn && interval.monthEnd) dueOn = endOfMonth(dueOn);

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
 */
export function semaphore(
  items: ReadonlyArray<{ state: DeadlineState; blocking: boolean }>,
): SemaphoreResult {
  const blocked = items.some((i) => i.blocking && i.state === "expired");
  if (blocked) return { color: "red", blocked };
  const warn = items.some((i) => i.state !== "ok");
  return { color: warn ? "yellow" : "green", blocked };
}

export interface DeadlineTypeDefaults {
  intervalMonths: number | null;
  intervalDays: number | null;
  intervalKm: number | null;
  alertDays: number;
  alertKm: number | null;
  blocking: boolean;
}

export type DeadlineRuleOverrides = Partial<
  Pick<
    DeadlineTypeDefaults,
    "intervalMonths" | "intervalDays" | "intervalKm" | "alertDays" | "blocking"
  >
>;

/**
 * Periodicità, preavviso e blocco con cui nasce una scadenza da una regola:
 * ogni campo nullo della regola eredita dal tipo. Mesi e giorni si
 * escludono: se la regola ne fissa uno, l'altro del tipo non passa.
 */
export function resolveRule(
  type: DeadlineTypeDefaults,
  rule: DeadlineRuleOverrides,
): DeadlineTypeDefaults {
  const ruleSetsTime =
    (rule.intervalMonths ?? null) !== null || (rule.intervalDays ?? null) !== null;
  return {
    intervalMonths: ruleSetsTime ? (rule.intervalMonths ?? null) : type.intervalMonths,
    intervalDays: ruleSetsTime ? (rule.intervalDays ?? null) : type.intervalDays,
    intervalKm: rule.intervalKm ?? type.intervalKm,
    alertDays: rule.alertDays ?? type.alertDays,
    alertKm: type.alertKm,
    blocking: rule.blocking ?? type.blocking,
  };
}
