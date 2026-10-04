/**
 * Date e numeri in italiano, sempre nel fuso di Roma. Le date del database
 * sono stringhe `YYYY-MM-DD` (colonne date) o Date (timestamp).
 *
 * Ogni toLocaleString su un numero ha `useGrouping: true` esplicito: Node e
 * i browser scelgono diversamente con il default, e la differenza fa
 * fallire l'idratazione.
 */
const FUSO = "Europe/Rome";

const giorno = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: FUSO,
});
const giornoOra = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO,
});

function toDate(value: string | Date): Date {
  // una data `YYYY-MM-DD` si legge come giorno di Roma, non come mezzanotte UTC
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
}

/** 24/09/2026 */
export function fmtDay(value: string | Date | null | undefined): string {
  return value ? giorno.format(toDate(value)) : "—";
}

/** 24/09/2026 08:14 */
export function fmtDayTime(value: string | Date | null | undefined): string {
  return value ? giornoOra.format(toDate(value)) : "—";
}

/** 12.345 km */
export function fmtKm(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${Number(value).toLocaleString("it-IT", { useGrouping: true })} km`;
}

/** 1.234,50 € */
export function fmtEur(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("it-IT", {
    useGrouping: true,
    style: "currency",
    currency: "EUR",
  });
}

/** Oggi a Roma, come `YYYY-MM-DD`: il «oggi» del motore delle scadenze. */
export function todayRome(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: FUSO,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
