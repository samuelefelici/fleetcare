/**
 * La logica pura dello scadenzario: lo stato di ogni scadenza, l'ordine
 * per urgenza, i conteggi per stato, i filtri dell'elenco, la
 * precompilazione della prossima scadenza e le frasi che l'interfaccia
 * mostra. Niente database, niente sessione: si prova con Vitest
 * (tests/scadenze.test.ts) e si usa anche nel browser (il modulo
 * dell'adempimento ricalcola la prossima scadenza mentre si scrive).
 */
import {
  evaluateDeadline,
  nextDue,
  semaphore,
  type DeadlineEvaluation,
  type DeadlineInterval,
  type DeadlineState,
  type IsoDate,
  type NextDue,
  type Semaphore,
} from "@fleetcare/db/domain/deadlines";
import { fmtKm } from "@/lib/format";

// ------------------------------------------------------------------
// Etichette
// ------------------------------------------------------------------

/**
 * I filtri dell'elenco (?stato=…). «aperte» è tutto tranne le scadenze in
 * regola: il default dello scadenzario. Per un singolo mezzo o
 * attrezzatura il default è «tutte»: chi arriva dalla scheda vuole vedere
 * l'elenco completo.
 */
export const STATO_FILTRI = [
  "aperte",
  "scadute",
  "in_scadenza",
  "da_completare",
  "in_regola",
  "tutte",
] as const;
export type StatoFiltro = (typeof STATO_FILTRI)[number];

export const FILTRO_LABELS: Record<StatoFiltro, string> = {
  aperte: "Da seguire",
  scadute: "Scadute",
  in_scadenza: "In scadenza",
  da_completare: "Da completare",
  in_regola: "In regola",
  tutte: "Tutte",
};

export const STATE_LABELS: Record<DeadlineState, string> = {
  expired: "Scaduta",
  expiring: "In scadenza",
  missing: "Da completare",
  ok: "In regola",
};

/** Lo stato del motore → il filtro che lo contiene (oltre a «aperte» e «tutte»). */
export const STATE_FILTRO: Record<DeadlineState, StatoFiltro> = {
  expired: "scadute",
  expiring: "in_scadenza",
  missing: "da_completare",
  ok: "in_regola",
};

/** Gli esiti di un adempimento (l'enum `completion_outcome` del database). */
export const COMPLETION_OUTCOMES = ["passed", "conditional", "failed"] as const;
export type CompletionOutcome = (typeof COMPLETION_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<CompletionOutcome, string> = {
  passed: "Fatto",
  conditional: "Con riserva",
  failed: "Non superato",
};

// ------------------------------------------------------------------
// Filtri
// ------------------------------------------------------------------

export function defaultFiltro(bySubject: boolean): StatoFiltro {
  return bySubject ? "tutte" : "aperte";
}

export function parseStatoFiltro(raw: unknown, fallback: StatoFiltro): StatoFiltro {
  return typeof raw === "string" && (STATO_FILTRI as readonly string[]).includes(raw)
    ? (raw as StatoFiltro)
    : fallback;
}

export function matchesFiltro(state: DeadlineState, filtro: StatoFiltro): boolean {
  if (filtro === "tutte") return true;
  if (filtro === "aperte") return state !== "ok";
  return STATE_FILTRO[state] === filtro;
}

export interface SubjectParams {
  mezzo?: string | undefined;
  attrezzatura?: string | undefined;
}

/** L'indirizzo dell'elenco con un filtro; il filtro di default non compare nell'indirizzo. */
export function listHref(filtro: StatoFiltro, subject: SubjectParams = {}): string {
  const q = new URLSearchParams();
  if (subject.mezzo) q.set("mezzo", subject.mezzo);
  else if (subject.attrezzatura) q.set("attrezzatura", subject.attrezzatura);
  if (filtro !== defaultFiltro(Boolean(subject.mezzo || subject.attrezzatura))) {
    q.set("stato", filtro);
  }
  const s = q.toString();
  return s ? `/scadenze?${s}` : "/scadenze";
}

// ------------------------------------------------------------------
// Stato e ordine
// ------------------------------------------------------------------

/** Ciò che serve a valutare e ordinare una scadenza; le pagine ci attaccano il resto. */
export interface DeadlineRowInput {
  dueOn: IsoDate | null;
  dueKm: number | null;
  alertDays: number;
  alertKm: number | null;
  blocking: boolean;
  /** i km attuali del mezzo; null per le attrezzature o se non noti */
  odometerKm: number | null;
  /** «12 · FX123AB» oppure «DAE · matr. 12345»: ordina a parità di urgenza */
  subjectLabel: string;
  typeLabel: string;
}

export interface EvaluatedDeadline<T extends DeadlineRowInput> {
  row: T;
  evaluation: DeadlineEvaluation;
  /** il colore della singola scadenza, con la regola del semaforo di flotta */
  color: Semaphore;
}

export function evaluateRows<T extends DeadlineRowInput>(
  rows: ReadonlyArray<T>,
  today: IsoDate,
): EvaluatedDeadline<T>[] {
  return rows.map((row) => {
    const evaluation = evaluateDeadline(
      { dueOn: row.dueOn, dueKm: row.dueKm, alertDays: row.alertDays, alertKm: row.alertKm },
      today,
      row.odometerKm,
    );
    const { color } = semaphore([{ state: evaluation.state, blocking: row.blocking }]);
    return { row, evaluation, color };
  });
}

const RANK: Record<DeadlineState, number> = { expired: 0, expiring: 1, missing: 2, ok: 3 };

export function urgencyRank(state: DeadlineState): number {
  return RANK[state];
}

function triggerOrder(e: DeadlineEvaluation): number {
  return e.trigger === "date" ? 0 : e.trigger === "km" ? 1 : 2;
}

function triggerValue(e: DeadlineEvaluation): number {
  if (e.trigger === "date") return e.daysLeft ?? 0;
  if (e.trigger === "km") return e.kmLeft ?? 0;
  return 0;
}

/**
 * Prima le scadute (le bloccanti davanti, poi le più in ritardo), poi
 * quelle in preavviso per giorni rimanenti, poi quelle senza data né km
 * (le bloccanti davanti), infine quelle in regola per data. A parità
 * decide la data prima dei km, poi il soggetto e il tipo.
 */
export function compareUrgency<T extends DeadlineRowInput>(
  a: EvaluatedDeadline<T>,
  b: EvaluatedDeadline<T>,
): number {
  const rank = urgencyRank(a.evaluation.state) - urgencyRank(b.evaluation.state);
  if (rank !== 0) return rank;
  const state = a.evaluation.state;
  if ((state === "expired" || state === "missing") && a.row.blocking !== b.row.blocking) {
    return a.row.blocking ? -1 : 1;
  }
  const trigger = triggerOrder(a.evaluation) - triggerOrder(b.evaluation);
  if (trigger !== 0) return trigger;
  const value = triggerValue(a.evaluation) - triggerValue(b.evaluation);
  if (value !== 0) return value;
  const subject = a.row.subjectLabel.localeCompare(b.row.subjectLabel, "it");
  if (subject !== 0) return subject;
  return a.row.typeLabel.localeCompare(b.row.typeLabel, "it");
}

export function sortByUrgency<T extends DeadlineRowInput>(
  items: ReadonlyArray<EvaluatedDeadline<T>>,
): EvaluatedDeadline<T>[] {
  return [...items].sort(compareUrgency);
}

export type Counts = Record<StatoFiltro, number>;

export function countByState(items: ReadonlyArray<{ evaluation: DeadlineEvaluation }>): Counts {
  const counts: Counts = {
    aperte: 0,
    scadute: 0,
    in_scadenza: 0,
    da_completare: 0,
    in_regola: 0,
    tutte: items.length,
  };
  for (const { evaluation } of items) {
    counts[STATE_FILTRO[evaluation.state]] += 1;
    if (evaluation.state !== "ok") counts.aperte += 1;
  }
  return counts;
}

// ------------------------------------------------------------------
// Il soggetto: un mezzo o un'attrezzatura
// ------------------------------------------------------------------

/** Le colonne del soggetto come le danno le query (nulle quelle dell'altro soggetto). */
export interface SubjectFields {
  vehicleId: string | null;
  vehicleCode: string | null;
  vehiclePlate: string | null;
  equipmentId: string | null;
  equipmentTypeLabel: string | null;
  equipmentSerial: string | null;
  equipmentInventory: string | null;
}

/** «Mezzo dismesso» / «Attrezzatura dismessa», o null se il soggetto è in flotta. */
export function subjectDismissed(s: {
  vehicleStatus?: string | null;
  equipmentStatus?: string | null;
}): string | null {
  if (s.vehicleStatus === "decommissioned") return "Mezzo dismesso";
  if (s.equipmentStatus === "disposed") return "Attrezzatura dismessa";
  return null;
}

/** «12 · FX123AB» per un mezzo; «DAE · matr. 12345» per un'attrezzatura. */
export function subjectLabel(s: SubjectFields): string {
  if (s.vehicleId) return `${s.vehicleCode ?? "?"} · ${s.vehiclePlate ?? "?"}`;
  const type = s.equipmentTypeLabel ?? "Attrezzatura";
  if (s.equipmentSerial) return `${type} · matr. ${s.equipmentSerial}`;
  if (s.equipmentInventory) return `${type} · inv. ${s.equipmentInventory}`;
  return `${type} · senza matricola`;
}

/** La scheda del soggetto. */
export function subjectHref(s: Pick<SubjectFields, "vehicleId" | "equipmentId">): string {
  return s.vehicleId ? `/mezzi/${s.vehicleId}` : `/attrezzature/${s.equipmentId}`;
}

/** L'elenco delle scadenze dello stesso soggetto. */
export function subjectListHref(s: Pick<SubjectFields, "vehicleId" | "equipmentId">): string {
  return s.vehicleId
    ? listHref("tutte", { mezzo: s.vehicleId })
    : listHref("tutte", { attrezzatura: s.equipmentId ?? undefined });
}

// ------------------------------------------------------------------
// Frasi
// ------------------------------------------------------------------

export const giorni = (n: number): string => (n === 1 ? "1 giorno" : `${n} giorni`);
export const mesi = (n: number): string => (n === 1 ? "1 mese" : `${n} mesi`);

/** «Scaduta da 12 giorni», «Scade fra 3 giorni», «Superata di 300 km», «Da completare». */
export function stateText(e: DeadlineEvaluation): string {
  switch (e.state) {
    case "missing":
      return "Da completare";
    case "expired":
      if (e.trigger === "km") return `Superata di ${fmtKm(-(e.kmLeft ?? 0))}`;
      return `Scaduta da ${giorni(-(e.daysLeft ?? 0))}`;
    case "expiring":
      if (e.trigger === "km") {
        return (e.kmLeft ?? 0) <= 0 ? "Km raggiunti" : `Mancano ${fmtKm(e.kmLeft ?? 0)}`;
      }
      if (e.daysLeft === 0) return "Scade oggi";
      if (e.daysLeft === 1) return "Scade domani";
      return `Scade fra ${giorni(e.daysLeft ?? 0)}`;
    case "ok":
      if (e.trigger === "km") return `In regola (${fmtKm(e.kmLeft ?? 0)})`;
      return `In regola (${giorni(e.daysLeft ?? 0)})`;
  }
}

/** «31/01/2027 · 150.350 km» con le date già formattate; «senza data né km» se vuota. */
export function dueText(dueOnFormatted: string | null, dueKm: number | null): string {
  const parts: string[] = [];
  if (dueOnFormatted) parts.push(dueOnFormatted);
  if (dueKm !== null) parts.push(fmtKm(dueKm));
  return parts.length === 0 ? "senza data né km" : parts.join(" · ");
}

export interface IntervalFields {
  intervalMonths: number | null;
  intervalDays: number | null;
  intervalKm: number | null;
}

/** «ogni 12 mesi o 30.000 km», «ogni 30 giorni», «ogni 12 mesi, entro fine mese», «non periodica». */
export function describeInterval(f: IntervalFields, monthEnd = false): string {
  const parts: string[] = [];
  if (f.intervalMonths) parts.push(mesi(f.intervalMonths));
  else if (f.intervalDays) parts.push(giorni(f.intervalDays));
  if (f.intervalKm) parts.push(fmtKm(f.intervalKm));
  if (parts.length === 0) return "non periodica: la data si legge dal documento";
  const base = `ogni ${parts.join(" o ")}`;
  return monthEnd && (f.intervalMonths || f.intervalDays) ? `${base}, entro fine mese` : base;
}

/** «30 giorni prima», «30 giorni e 2.000 km prima», «30 giorni prima (per i km: al raggiungimento)». */
export function describeAlert(alertDays: number, alertKm: number | null, hasKm: boolean): string {
  const base = `${giorni(alertDays)} prima`;
  if (!hasKm) return base;
  return alertKm === null
    ? `${base} (per i km: al raggiungimento)`
    : `${giorni(alertDays)} e ${fmtKm(alertKm)} prima`;
}

/** I valori propri della scadenza (le correzioni a mano), nulli quando eredita. */
export interface OwnValues {
  ownIntervalMonths: number | null;
  ownIntervalDays: number | null;
  ownIntervalKm: number | null;
  ownAlertDays: number | null;
  ownAlertKm: number | null;
  ownBlocking: boolean | null;
}

/** Quali valori sono corretti a mano: «periodicità», «preavviso», «blocco». */
export function overriddenFields(own: OwnValues): string[] {
  const out: string[] = [];
  if (
    own.ownIntervalMonths !== null ||
    own.ownIntervalDays !== null ||
    own.ownIntervalKm !== null
  ) {
    out.push("periodicità");
  }
  if (own.ownAlertDays !== null || own.ownAlertKm !== null) out.push("preavviso");
  if (own.ownBlocking !== null) out.push("blocco");
  return out;
}

// ------------------------------------------------------------------
// La prossima scadenza, precompilata
// ------------------------------------------------------------------

export interface EffectiveInterval extends IntervalFields {
  monthEnd: boolean;
  renewFromDue: boolean;
  renewGraceDays: number | null;
}

/**
 * La prossima scadenza proposta per un adempimento fatto il giorno
 * `doneOn` a `doneKm` km, dai valori effettivi della scadenza (`nextDue`
 * del motore; con `renewFromDue` si parte dalla scadenza attuale
 * `previousDueOn`). Si propone, non si impone: nel modulo resta
 * modificabile. Un dato non leggibile (data incompleta mentre si scrive)
 * dà due nulli, non un errore.
 */
export function prefillNextDue(
  doneOn: string,
  doneKm: number | null,
  effective: EffectiveInterval,
  previousDueOn: IsoDate | null,
): NextDue {
  if (!isCalendarDay(doneOn)) return { dueOn: null, dueKm: null };
  const interval: DeadlineInterval = {
    months: effective.intervalMonths,
    days: effective.intervalDays,
    km: effective.intervalKm,
    monthEnd: effective.monthEnd,
    renewFromDue: effective.renewFromDue,
    renewGraceDays: effective.renewGraceDays,
  };
  try {
    return nextDue(
      doneOn,
      doneKm,
      interval,
      previousDueOn && isCalendarDay(previousDueOn) ? previousDueOn : null,
    );
  } catch {
    return { dueOn: null, dueKm: null };
  }
}

// ------------------------------------------------------------------
// Dati in ingresso
// ------------------------------------------------------------------

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Una data di calendario vera (niente 30 febbraio), fra il 1900 e il 2999: quelle che il database accetta. */
export function isCalendarDay(iso: string): boolean {
  const m = ISO_DAY.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** I campi di un FormData come oggetto di stringhe: i file si ignorano. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * «1.234,50», «1234,5» o «1234.5» → «1234.50» (la colonna numeric vuole una
 * stringa con il punto); null se vuoto, undefined se non è un importo.
 */
export function parseEuro(raw: string): string | null | undefined {
  const s = raw.trim().replace(/\s|€/g, "");
  if (s === "") return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  return Number(normalized).toFixed(2);
}

// ------------------------------------------------------------------
// Errori del database propri dello scadenzario
// ------------------------------------------------------------------

const SPECIAL_MESSAGES: ReadonlyArray<{ code: string; constraint?: string; message: string }> = [
  {
    code: "23505",
    constraint: "deadlines_vehicle_uq",
    message:
      "Questo mezzo ha già una scadenza di questo tipo con la stessa etichetta: usa un'etichetta diversa",
  },
  {
    code: "23505",
    constraint: "deadlines_equipment_uq",
    message:
      "Questa attrezzatura ha già una scadenza di questo tipo con la stessa etichetta: usa un'etichetta diversa",
  },
  // remove_deadline: la scadenza non c'è, o la policy non la fa toccare
  { code: "P0002", message: "Scadenza non trovata, o non è un'operazione del tuo ruolo" },
];

/**
 * La frase per gli errori propri dello scadenzario (doppioni, scadenza
 * sparita) dall'errore già scartato dall'involucro di Drizzle; null se è
 * un altro errore, che traduce `dbErrorMessage`.
 */
export function specialDbMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const pg = error as { code?: unknown; constraint_name?: unknown };
  if (typeof pg.code !== "string") return null;
  for (const s of SPECIAL_MESSAGES) {
    if (s.code === pg.code && (!s.constraint || s.constraint === pg.constraint_name)) {
      return s.message;
    }
  }
  return null;
}
