/**
 * La logica pura della sezione attrezzature: gli schemi Zod dei moduli,
 * la posizione (a bordo di un mezzo oppure in sede) letta da una <select>,
 * i filtri dell'elenco presi dall'indirizzo, i testi dello storico.
 * Niente database, niente sessione: si prova con Vitest
 * (tests/attrezzature.test.ts).
 *
 * I moduli arrivano come FormData: ogni campo è una stringa e un campo
 * facoltativo lasciato vuoto è "". Gli schemi partono da lì: vuoto → null.
 * Le chiavi dei campi sono le colonne di `equipment`, così il primo errore
 * di Zod («purchaseValueEur: deve essere un importo») indica il campo.
 */
import { z } from "zod";
import { equipmentStatus, ownershipKind } from "@fleetcare/db";
import type { EquipmentStatus } from "./labels";
import { parseEuro } from "@/lib/euro";

export { parseEuro };

/** I campi di un FormData come oggetto di stringhe: i file si ignorano. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un id nell'indirizzo che non è un uuid non è una scheda: è un 404, non una query. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

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

// ------------------------------------------------------------------
// La posizione: a bordo di un mezzo oppure in una sede, mai in entrambi
// ------------------------------------------------------------------

export interface Place {
  vehicleId: string | null;
  siteId: string | null;
}

export const NO_PLACE: Place = { vehicleId: null, siteId: null };

/** Il valore dell'`<option>` di una posizione: «vehicle:<id>», «site:<id>», o "" per nessuna. */
export function placeValue(place: Place): string {
  if (place.vehicleId) return `vehicle:${place.vehicleId}`;
  if (place.siteId) return `site:${place.siteId}`;
  return "";
}

/** Legge il valore dell'`<option>`: vuoto → nessuna collocazione, non una posizione → null. */
export function parsePlace(raw: string): Place | null {
  const value = raw.trim();
  if (value === "") return NO_PLACE;
  const m = /^(vehicle|site):(.+)$/.exec(value);
  if (!m || !UUID.test(m[2]!)) return null;
  const id = m[2]!.toLowerCase();
  return m[1] === "vehicle" ? { vehicleId: id, siteId: null } : { vehicleId: null, siteId: id };
}

export function samePlace(a: Place, b: Place): boolean {
  return a.vehicleId === b.vehicleId && a.siteId === b.siteId;
}

// ------------------------------------------------------------------
// I mattoni degli schemi
// ------------------------------------------------------------------

const blank = (v: string | undefined): boolean => (v ?? "").trim() === "";

/** Un campo facoltativo: vuoto o assente → null, altrimenti il testo ripulito. */
const optional = z
  .string()
  .optional()
  .transform((v) => (blank(v) ? null : v!.trim()));

const optionalText = (max: number) =>
  optional.pipe(z.string().max(max, `al massimo ${max} caratteri`).nullable());

const optionalDay = optional.pipe(z.string().refine(isCalendarDay, "data non valida").nullable());

const optionalEuro = optional.pipe(
  z
    .string()
    .transform((raw, ctx) => {
      const value = parseEuro(raw);
      if (value === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "deve essere un importo" });
        return z.NEVER;
      }
      return value;
    })
    .nullable(),
);

const enumField = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, {
    errorMap: (_issue, ctx) => ({
      message: ctx.data === "" || ctx.data === undefined ? "obbligatorio" : "valore non valido",
    }),
  });

const uuidField = (what: string) =>
  z
    .string({ required_error: "obbligatorio" })
    .trim()
    .min(1, "obbligatorio")
    .uuid(`${what} non valido`);

const placeField = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    const place = parsePlace(raw ?? "");
    if (!place) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "scegli un mezzo o una sede" });
      return z.NEVER;
    }
    return place;
  });

// ------------------------------------------------------------------
// Gli schemi dei moduli
// ------------------------------------------------------------------

/** I campi comuni a «nuova» e «modifica»: le chiavi sono le colonne di `equipment`. */
const equipmentFields = {
  equipmentTypeId: uuidField("tipo"),
  inventoryCode: optionalText(50),
  manufacturer: optionalText(100),
  model: optionalText(100),
  serialNumber: optionalText(100),
  status: optional.transform((v) => v ?? "in_use").pipe(enumField(equipmentStatus.enumValues)),
  positionNote: optionalText(200),
  ownership: enumField(ownershipKind.enumValues),
  ownerName: optionalText(200),
  manufacturedOn: optionalDay,
  purchaseDate: optionalDay,
  purchaseValueEur: optionalEuro,
  warrantyUntil: optionalDay,
  notes: optionalText(2000),
};

/** Il modulo di creazione: i campi più la posizione iniziale (dopo, passa da «Sposta»). */
export const equipmentSchema = z.object({ ...equipmentFields, place: placeField });

export type EquipmentInput = z.infer<typeof equipmentSchema>;

/** La modifica: gli stessi campi, senza la posizione, più l'id. */
export const equipmentEditSchema = z.object({ id: uuidField("attrezzatura"), ...equipmentFields });

/** «Sposta»: la nuova posizione e il motivo. */
export const moveSchema = z.object({
  equipmentId: uuidField("attrezzatura"),
  place: placeField,
  reason: optionalText(300),
});

export const statusChangeSchema = z.object({
  equipmentId: uuidField("attrezzatura"),
  status: enumField(equipmentStatus.enumValues),
});

// ------------------------------------------------------------------
// I filtri dell'elenco (dall'indirizzo della pagina)
// ------------------------------------------------------------------

export interface ListFilters {
  vehicleId: string | null;
  siteId: string | null;
  typeId: string | null;
  status: EquipmentStatus | null;
  /** `?mostra=tutti`: anche le dismesse */
  showAll: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function uuidOrNull(value: string | undefined): string | null {
  return value && UUID.test(value) ? value.toLowerCase() : null;
}

const STATUSES: readonly string[] = equipmentStatus.enumValues;

/** Un parametro sbagliato non è un errore: si ignora, e la pagina mostra l'elenco intero. */
export function parseListFilters(params: SearchParams): ListFilters {
  const status = first(params.stato) ?? "";
  return {
    vehicleId: uuidOrNull(first(params.mezzo)),
    siteId: uuidOrNull(first(params.sede)),
    typeId: uuidOrNull(first(params.tipo)),
    status: STATUSES.includes(status) ? (status as EquipmentStatus) : null,
    showAll: first(params.mostra) === "tutti",
  };
}

export function hasAnyFilter(f: ListFilters): boolean {
  return Boolean(f.vehicleId || f.siteId || f.typeId || f.status || f.showAll);
}

/** L'indirizzo dell'elenco con questi filtri, eventualmente ritoccati: per i link «mostra anche le dismesse». */
export function listHref(f: ListFilters, patch: Partial<ListFilters> = {}): string {
  const m = { ...f, ...patch };
  const q = new URLSearchParams();
  if (m.vehicleId) q.set("mezzo", m.vehicleId);
  if (m.siteId) q.set("sede", m.siteId);
  if (m.typeId) q.set("tipo", m.typeId);
  if (m.status) q.set("stato", m.status);
  if (m.showAll) q.set("mostra", "tutti");
  const s = q.toString();
  return s ? `/attrezzature?${s}` : "/attrezzature";
}

// ------------------------------------------------------------------
// I testi: dove sta, gli spostamenti
// ------------------------------------------------------------------

export interface PlaceNames {
  vehicleCode: string | null;
  siteName: string | null;
}

/** «Mezzo 12», «Sede principale», «Nessuna collocazione». */
export function placeLabel(place: PlaceNames): string {
  if (place.vehicleCode) return `Mezzo ${place.vehicleCode}`;
  if (place.siteName) return place.siteName;
  return "Nessuna collocazione";
}

export interface MovementEnds {
  fromVehicleCode: string | null;
  fromSiteName: string | null;
  toVehicleCode: string | null;
  toSiteName: string | null;
}

/** «Dal mezzo 12 alla sede «Sede principale»», «Messa a bordo del mezzo 5», «Tolta dal mezzo 12». */
export function movementText(m: MovementEnds): string {
  const from = m.fromVehicleCode
    ? `dal mezzo ${m.fromVehicleCode}`
    : m.fromSiteName
      ? `dalla sede «${m.fromSiteName}»`
      : null;
  const to = m.toVehicleCode
    ? `al mezzo ${m.toVehicleCode}`
    : m.toSiteName
      ? `alla sede «${m.toSiteName}»`
      : null;
  if (from && to) return `${from.charAt(0).toUpperCase()}${from.slice(1)} ${to}`;
  if (to) {
    return m.toVehicleCode
      ? `Messa a bordo del mezzo ${m.toVehicleCode}`
      : `Messa in sede «${m.toSiteName}»`;
  }
  if (from) return `Tolta ${from}`;
  return "Spostamento senza partenza né arrivo";
}
