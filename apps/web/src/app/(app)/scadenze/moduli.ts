/**
 * Gli schemi Zod dei moduli dello scadenzario. I moduli arrivano come
 * FormData: ogni campo è una stringa e un campo facoltativo lasciato vuoto
 * è "". Gli schemi partono da lì: vuoto → null, i numeri si convertono, le
 * date devono essere giorni di calendario veri. I nomi dei campi sono in
 * italiano perché `zodMessage` li mette davanti al messaggio.
 */
import { z } from "zod";
import { COMPLETION_OUTCOMES, isCalendarDay, parseEuro } from "./logica";

const blank = (v: string | undefined): boolean => (v ?? "").trim() === "";

/** Un campo facoltativo: vuoto o assente → null, altrimenti il testo ripulito. */
const optional = z
  .string()
  .optional()
  .transform((v) => (blank(v) ? null : v!.trim()));

const optionalText = (max: number) =>
  optional.pipe(z.string().max(max, `al massimo ${max} caratteri`).nullable());

const intField = (min: number, max: number) =>
  z.coerce
    .number({ invalid_type_error: "deve essere un numero" })
    .int("deve essere un numero intero")
    .min(min, `non può essere sotto ${min}`)
    .max(max, `non può superare ${max}`);

/** Un intero facoltativo: vuoto = null (nullable salta la coercizione, che di null farebbe 0). */
const optionalInt = (min: number, max: number) => optional.pipe(intField(min, max).nullable());

const dayField = z.string().refine(isCalendarDay, "data non valida");
const optionalDay = optional.pipe(dayField.nullable());
const requiredDay = z
  .string({ required_error: "obbligatoria" })
  .trim()
  .min(1, "obbligatoria")
  .pipe(dayField);

const uuidField = (what: string) =>
  z.string({ required_error: `${what} non indicato` }).uuid(`${what} non valido`);
const optionalUuid = (what: string) =>
  optional.pipe(z.string().uuid(`${what} non valido`).nullable());

const enumField = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, {
    errorMap: (_issue, ctx) => ({
      message: ctx.data === "" || ctx.data === undefined ? "obbligatorio" : "valore non valido",
    }),
  });

/** Un importo in euro come lo scrive un italiano («123,45»); vuoto = null. */
const optionalEuro = optional.pipe(
  z
    .string()
    .transform((raw, ctx) => {
      const out = parseEuro(raw);
      if (out === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "importo non valido (es. 123,45)" });
        return z.NEVER;
      }
      return out;
    })
    .nullable(),
);

const KM_MAX = 9_999_999;

/** (a) «Imposta la scadenza»: data e/o km (la nuova base) e le note. */
export const setDueSchema = z.object({
  id: uuidField("scadenza"),
  data: optionalDay,
  km: optionalInt(0, KM_MAX),
  note: optionalText(2000),
});
export type SetDueInput = z.infer<typeof setDueSchema>;

/** (b) «Registra adempimento»: la data non può essere nel futuro (lo rifiuta anche il database). */
export function completionSchema(today: string) {
  return (
    z
      .object({
        id: uuidField("scadenza"),
        data: requiredDay,
        km: optionalInt(0, KM_MAX),
        esito: enumField(COMPLETION_OUTCOMES),
        prossima_data: optionalDay,
        prossima_km: optionalInt(0, KM_MAX),
        costo: optionalEuro,
        fornitore: optionalUuid("fornitore"),
        documento: optionalText(200),
        note: optionalText(2000),
      })
      .refine((v) => v.data <= today, {
        path: ["data"],
        message: "un adempimento non può avere una data futura",
      })
      // senza una prossima scadenza il database lascia tutto com'era: la
      // scadenza resterebbe scaduta con un adempimento «fatto» nello storico
      .refine((v) => v.esito === "failed" || v.prossima_data !== null || v.prossima_km !== null, {
        path: ["prossima_data"],
        message: "serve la prossima scadenza (data o km): si legge dal documento",
      })
      .refine((v) => v.prossima_data === null || v.prossima_data >= v.data, {
        path: ["prossima_data"],
        message: "non può precedere la data dell'adempimento",
      })
      .refine((v) => v.prossima_km === null || v.km === null || v.prossima_km >= v.km, {
        path: ["prossima_km"],
        message: "non possono essere meno dei km dell'adempimento",
      })
  );
}
export type CompletionInput = z.infer<ReturnType<typeof completionSchema>>;

/** La scelta a tre vie del blocco: vuoto = eredita, «si» / «no» = corretto a mano. */
const blockingChoice = optional
  .pipe(z.enum(["si", "no"], { errorMap: () => ({ message: "valore non valido" }) }).nullable())
  .transform((v) => (v === null ? null : v === "si"));

/** (d) correzione a mano: ogni campo vuoto eredita da regola e tipo. */
export const overrideSchema = z
  .object({
    id: uuidField("scadenza"),
    mesi: optionalInt(1, 1200),
    giorni: optionalInt(1, 36_500),
    km_periodo: optionalInt(1, KM_MAX),
    preavviso_giorni: optionalInt(0, 3650),
    preavviso_km: optionalInt(0, KM_MAX),
    blocco: blockingChoice,
  })
  .refine((v) => !(v.mesi !== null && v.giorni !== null), {
    path: ["mesi"],
    message: "periodicità in mesi oppure in giorni, non entrambe",
  });
export type OverrideInput = z.infer<typeof overrideSchema>;

/** /scadenze/nuova: una scadenza fuori catalogo per un mezzo oppure un'attrezzatura. */
export const newDeadlineSchema = z
  .object({
    mezzo: optionalUuid("mezzo"),
    attrezzatura: optionalUuid("attrezzatura"),
    tipo: uuidField("tipo di scadenza"),
    etichetta: optionalText(120).transform((v) => v ?? ""),
    data: optionalDay,
    km: optionalInt(0, KM_MAX),
  })
  .refine((v) => (v.mezzo !== null) !== (v.attrezzatura !== null), {
    path: ["mezzo"],
    message: "serve un mezzo oppure un'attrezzatura",
  });
export type NewDeadlineInput = z.infer<typeof newDeadlineSchema>;

export const removeSchema = z.object({ id: uuidField("scadenza") });
