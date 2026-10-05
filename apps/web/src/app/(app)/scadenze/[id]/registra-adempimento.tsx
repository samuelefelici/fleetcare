"use client";

/**
 * Il modulo «Registra adempimento». È un componente client perché la
 * prossima scadenza proposta dipende da data e km dell'adempimento: si
 * ricalcola mentre si scrive (`prefillNextDue`, la stessa `nextDue` del
 * motore) finché l'utente non la corregge a mano. Tutto il resto lo fa
 * la server action: a nome di chi è entrato, con il database che sposta
 * la scadenza.
 */
import { useMemo, useState } from "react";
import { ActionForm } from "@/components/form";
import { Field, inputClass } from "@/components/ui";
import { recordCompletion } from "@/server/actions/scadenze";
import {
  COMPLETION_OUTCOMES,
  OUTCOME_LABELS,
  prefillNextDue,
  type EffectiveInterval,
} from "../logica";

export function RegistraAdempimento({
  deadlineId,
  today,
  isVehicle,
  odometerKm,
  previousDueOn,
  effective,
  hasKm,
  suppliers,
  documentRequired,
}: {
  deadlineId: string;
  today: string;
  /** la scadenza è di un mezzo: si chiedono i km del contachilometri */
  isVehicle: boolean;
  /** i km attuali del mezzo (null per le attrezzature) */
  odometerKm: number | null;
  /** la scadenza attuale: con `renewFromDue` il periodo nuovo parte da qui */
  previousDueOn: string | null;
  effective: EffectiveInterval;
  /** la scadenza ha una dimensione in km (periodicità o scadenza a km) */
  hasKm: boolean;
  suppliers: Array<{ id: string; name: string }>;
  documentRequired: boolean;
}) {
  const [doneOn, setDoneOn] = useState(today);
  const [doneKm, setDoneKm] = useState(odometerKm === null ? "" : String(odometerKm));
  const [nextOn, setNextOn] = useState<string | null>(null);
  const [nextKm, setNextKm] = useState<string | null>(null);

  const proposed = useMemo(() => {
    const km = doneKm.trim() === "" ? null : Number(doneKm);
    return prefillNextDue(
      doneOn,
      km !== null && Number.isFinite(km) ? km : null,
      effective,
      previousDueOn,
    );
  }, [doneOn, doneKm, effective, previousDueOn]);

  const periodic = effective.intervalMonths !== null || effective.intervalDays !== null;
  const nextOnValue = nextOn ?? proposed.dueOn ?? "";
  const nextKmValue = nextKm ?? (proposed.dueKm === null ? "" : String(proposed.dueKm));

  return (
    <ActionForm
      action={recordCompletion}
      submitLabel="Registra l'adempimento"
      successMessage="Adempimento registrato: la scadenza è aggiornata"
    >
      <input type="hidden" name="id" value={deadlineId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Data" htmlFor="adempimento-data" required hint="Non può essere nel futuro.">
          <input
            id="adempimento-data"
            name="data"
            type="date"
            required
            max={today}
            value={doneOn}
            onChange={(e) => setDoneOn(e.target.value)}
            className={inputClass}
          />
        </Field>
        {isVehicle && (
          <Field label="Km del mezzo" htmlFor="adempimento-km" hint="Proposti i km attuali.">
            <input
              id="adempimento-km"
              name="km"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={doneKm}
              onChange={(e) => setDoneKm(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field
          label="Esito"
          htmlFor="adempimento-esito"
          required
          hint="«Non superato» resta nello storico ma non sposta la scadenza."
        >
          <select
            id="adempimento-esito"
            name="esito"
            required
            defaultValue="passed"
            className={inputClass}
          >
            {COMPLETION_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Prossima scadenza (data)"
          htmlFor="adempimento-prossima-data"
          hint={
            periodic
              ? effective.renewFromDue
                ? "Proposta dall'anniversario della scadenza attuale; si può correggere con la data del documento."
                : "Proposta dalla periodicità; si può correggere con la data del documento."
              : "Scadenza non periodica: la data si legge dal documento."
          }
        >
          <input
            id="adempimento-prossima-data"
            name="prossima_data"
            type="date"
            value={nextOnValue}
            onChange={(e) => setNextOn(e.target.value)}
            className={inputClass}
          />
        </Field>
        {hasKm && (
          <Field
            label="Prossima scadenza (km)"
            htmlFor="adempimento-prossima-km"
            hint="Proposta dai km dell'adempimento più la periodicità in km."
          >
            <input
              id="adempimento-prossima-km"
              name="prossima_km"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={nextKmValue}
              onChange={(e) => setNextKm(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Costo (€)" htmlFor="adempimento-costo" hint="Es. 123,45">
          <input
            id="adempimento-costo"
            name="costo"
            type="text"
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label="Fornitore" htmlFor="adempimento-fornitore">
          <select id="adempimento-fornitore" name="fornitore" className={inputClass}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="N. documento"
          htmlFor="adempimento-documento"
          hint={
            documentRequired
              ? "Per questo tipo serve il documento: certificato, polizza, ricevuta."
              : "Certificato, polizza, ricevuta."
          }
        >
          <input
            id="adempimento-documento"
            name="documento"
            type="text"
            maxLength={200}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Note" htmlFor="adempimento-note">
        <textarea id="adempimento-note" name="note" rows={2} className={inputClass} />
      </Field>
    </ActionForm>
  );
}
