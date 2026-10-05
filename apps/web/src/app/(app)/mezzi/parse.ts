/**
 * La logica pura della sezione mezzi: gli schemi Zod dei moduli, la
 * normalizzazione della targa, le date e ore di Roma. Niente database,
 * niente sessione: si prova con Vitest (tests/mezzi.test.ts).
 *
 * I moduli arrivano come FormData: ogni campo è una stringa, un campo
 * facoltativo lasciato vuoto è "" e una casella non spuntata manca del
 * tutto. Gli schemi partono da lì: vuoto → null, "on" → true.
 */
import { z } from "zod";
import { en1789Type, fuelType, ownershipKind, vehicleCategory } from "@fleetcare/db";

/** I campi di un FormData come oggetto di stringhe: i file si ignorano. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * La targa si salva in maiuscolo con sole lettere e cifre: «fx-123 ab» →
 * «FX123AB», la stessa forma dell'indice unico del database e del
 * riconoscimento delle fatture carburante.
 */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ------------------------------------------------------------------
// Date e ore di Roma
// ------------------------------------------------------------------

const ROME = "Europe/Rome";
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Una data di calendario vera (niente 30 febbraio), fra il 1900 e il 2999. */
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

function romeParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour"),
    mi: get("minute"),
    s: get("second"),
  };
}

/** Lo scarto di Roma rispetto a UTC in quell'istante, in millisecondi (1 h d'inverno, 2 h d'estate). */
function romeOffsetMs(at: Date): number {
  const p = romeParts(at);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * «2026-10-04T15:30» è una data e ora vera? Giorno di calendario e ore,
 * minuti, secondi nei loro intervalli: Date.UTC non si lamenta di un
 * «30 febbraio» o di «25:70», li fa traboccare al giorno dopo.
 */
export function isValidLocalDateTime(local: string): boolean {
  const m = LOCAL_DATETIME.exec(local);
  if (!m) return false;
  return (
    isCalendarDay(`${m[1]}-${m[2]}-${m[3]}`) &&
    Number(m[4]) < 24 &&
    Number(m[5]) < 60 &&
    Number(m[6] ?? 0) < 60
  );
}

/** «2026-10-04T15:30» (un input datetime-local) letto come ora di Roma → l'istante. */
export function romeToDate(local: string): Date {
  const m = LOCAL_DATETIME.exec(local);
  if (!m || !isValidLocalDateTime(local)) throw new Error(`Data e ora non valide: ${local}`);
  const wall = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  );
  // prima stima con lo scarto di quell'ora letta come UTC, poi si ricalcola
  // sull'istante trovato: così il giorno del cambio dell'ora torna giusto
  let ms = wall - romeOffsetMs(new Date(wall));
  ms = wall - romeOffsetMs(new Date(ms));
  return new Date(ms);
}

/** Adesso a Roma nel formato di un input datetime-local: «2026-10-04T15:30». */
export function nowRomeLocal(now: Date = new Date()): string {
  const p = romeParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

// ------------------------------------------------------------------
// I mattoni degli schemi
// ------------------------------------------------------------------

const blank = (v: string | undefined): boolean => (v ?? "").trim() === "";
const hasAlnum = (v: string): boolean => /[A-Za-z0-9]/.test(v);

/** Un campo facoltativo: vuoto o assente → null, altrimenti il testo ripulito. */
const optional = z
  .string()
  .optional()
  .transform((v) => (blank(v) ? null : v!.trim()));

const requiredText = (max: number) =>
  z
    .string({ required_error: "obbligatorio" })
    .trim()
    .min(1, "obbligatorio")
    .max(max, `al massimo ${max} caratteri`);

const optionalText = (max: number) =>
  optional.pipe(z.string().max(max, `al massimo ${max} caratteri`).nullable());

/** Un codice (numero interno, targa, matricola): serve almeno una lettera o una cifra, come chiede il database. */
const codeText = (max: number) =>
  requiredText(max).refine(hasAlnum, "serve almeno una lettera o una cifra");

const optionalCode = (max: number) =>
  optional.pipe(
    z
      .string()
      .max(max, `al massimo ${max} caratteri`)
      .refine(hasAlnum, "serve almeno una lettera o una cifra")
      .nullable(),
  );

const intField = (min: number, max: number) =>
  z.coerce
    .number({ invalid_type_error: "deve essere un numero" })
    .int("deve essere un numero intero")
    .min(min, `non può essere sotto ${min}`)
    .max(max, `non può superare ${max}`);

const optionalInt = (max: number) => optional.pipe(intField(0, max).nullable());

const requiredInt = (max: number) =>
  z.string({ required_error: "obbligatorio" }).trim().min(1, "obbligatorio").pipe(intField(0, max));

const dayField = z.string().refine(isCalendarDay, "data non valida");
const optionalDay = optional.pipe(dayField.nullable());
const requiredDay = z
  .string({ required_error: "obbligatorio" })
  .trim()
  .min(1, "obbligatorio")
  .pipe(dayField);

/** Una casella di spunta: presente e «on» → true, assente → false. */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

const enumField = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, {
    errorMap: (_issue, ctx) => ({
      message: ctx.data === "" || ctx.data === undefined ? "obbligatorio" : "valore non valido",
    }),
  });

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  optional.pipe(z.enum(values, { errorMap: () => ({ message: "valore non valido" }) }).nullable());

const uuidField = (what: string) =>
  z.string({ required_error: `${what} non indicato` }).uuid(`${what} non valido`);

// ------------------------------------------------------------------
// Gli schemi dei moduli
// ------------------------------------------------------------------

/** Il modulo di creazione e di modifica di un mezzo: le chiavi sono le colonne di `vehicles`. */
export const vehicleSchema = z.object({
  // identificazione
  internalCode: codeText(30),
  plate: codeText(20).transform(normalizePlate),
  category: enumField(vehicleCategory.enumValues),
  callSign: optionalText(50),
  vin: optionalText(30),
  // veicolo base
  make: optionalText(80),
  model: optionalText(80),
  version: optionalText(120),
  fuelType: enumField(fuelType.enumValues),
  registrationDate: optionalDay,
  grossWeightKg: optionalInt(99_999),
  seats: optionalInt(99),
  stretcherPositions: optionalInt(9),
  wheelchairPositions: optionalInt(9),
  // allestimento
  outfitter: optionalText(120),
  en1789Type: optionalEnum(en1789Type.enumValues),
  hasLift: checkbox,
  hasPriorityLights: checkbox,
  // proprietà
  ownership: enumField(ownershipKind.enumValues),
  ownerName: optionalText(200),
  bolloExempt: checkbox,
  // esercizio
  initialOdometerKm: optionalInt(9_999_999).transform((v) => v ?? 0),
  initialOdometerOn: optionalDay,
  fuelVehicleCode: optionalCode(30),
  siteId: optional.pipe(z.string().uuid("sede non valida").nullable()),
  notes: optionalText(2000),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

/** La modifica: gli stessi campi più l'id del mezzo. */
export const vehicleEditSchema = vehicleSchema.extend({ id: uuidField("mezzo") });

/** Una lettura del contachilometri: km e quando; l'ora è quella di Roma. */
export const odometerReadingSchema = z.object({
  vehicleId: uuidField("mezzo"),
  km: requiredInt(9_999_999),
  readAt: z
    .string({ required_error: "obbligatorio" })
    .refine(isValidLocalDateTime, "data e ora non valide")
    .transform(romeToDate),
});

export type OdometerReadingInput = z.infer<typeof odometerReadingSchema>;

/** Gli stati che si scelgono a mano; «dismesso» ha il suo modulo, con data e motivo. */
export const ACTIVE_STATUSES = ["operational", "reserve", "maintenance", "grounded"] as const;

export const statusChangeSchema = z.object({
  vehicleId: uuidField("mezzo"),
  status: enumField(ACTIVE_STATUSES),
  reason: optionalText(500),
});

export const decommissionSchema = z.object({
  vehicleId: uuidField("mezzo"),
  decommissionedOn: requiredDay,
  reason: requiredText(500),
});
