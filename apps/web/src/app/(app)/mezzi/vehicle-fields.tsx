/**
 * I campi dell'anagrafica di un mezzo, gli stessi per creare e per
 * modificare. Componente server (niente hook): si rende dentro un
 * <ActionForm>. I nomi dei campi sono le chiavi di `vehicleSchema`.
 */
import type { ReactNode } from "react";
import { VEHICLE_CATEGORY_LABELS } from "@fleetcare/db/domain/labels";
import { Field, inputClass } from "@/components/ui";
import { EN1789_LABELS, FUEL_TYPE_LABELS, OWNERSHIP_LABELS } from "./labels";
import type { VehicleInput } from "./parse";

export interface SiteOption {
  id: string;
  name: string;
  active: boolean;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 text-base font-semibold">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Text({
  name,
  label,
  value,
  required,
  hint,
  type = "text",
  maxLength,
  placeholder,
  className = "",
}: {
  name: string;
  label: string;
  value: string | null | undefined;
  required?: boolean;
  hint?: ReactNode;
  type?: "text" | "date";
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field label={label} htmlFor={name} required={required} hint={hint}>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={value ?? ""}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputClass} ${className}`}
      />
    </Field>
  );
}

function Num({
  name,
  label,
  value,
  max,
  hint,
}: {
  name: string;
  label: string;
  value: number | null | undefined;
  max: number;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        defaultValue={value ?? ""}
        className={inputClass}
      />
    </Field>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="size-5 min-h-0! shrink-0 accent-brand"
      />
      {label}
    </label>
  );
}

function options(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

export function VehicleFields({
  vehicle,
  sites,
}: {
  vehicle?: Partial<VehicleInput> | null;
  sites: SiteOption[];
}) {
  const v = vehicle ?? {};
  return (
    <div className="space-y-8">
      <Section title="Identificazione">
        <Text
          name="internalCode"
          label="Numero interno"
          value={v.internalCode}
          required
          maxLength={30}
          hint="Quello scritto sulla fiancata"
        />
        <Text
          name="plate"
          label="Targa"
          value={v.plate}
          required
          maxLength={20}
          placeholder="AB123CD"
          className="uppercase"
          hint="Si salva in maiuscolo, solo lettere e cifre"
        />
        <Field label="Categoria" htmlFor="category" required>
          <select
            id="category"
            name="category"
            required
            defaultValue={v.category ?? ""}
            className={inputClass}
          >
            <option value="">Scegli…</option>
            {options(VEHICLE_CATEGORY_LABELS)}
          </select>
        </Field>
        <Text
          name="callSign"
          label="Sigla radio"
          value={v.callSign}
          maxLength={50}
          hint="Il nominativo con cui la centrale 118 chiama il mezzo"
        />
        <Text name="vin" label="Telaio" value={v.vin} maxLength={30} />
      </Section>

      <Section title="Veicolo">
        <Text name="make" label="Marca" value={v.make} maxLength={80} placeholder="Fiat" />
        <Text name="model" label="Modello" value={v.model} maxLength={80} placeholder="Ducato" />
        <Text name="version" label="Versione" value={v.version} maxLength={120} />
        <Field label="Alimentazione" htmlFor="fuelType" required>
          <select
            id="fuelType"
            name="fuelType"
            required
            defaultValue={v.fuelType ?? "diesel"}
            className={inputClass}
          >
            {options(FUEL_TYPE_LABELS)}
          </select>
        </Field>
        <Text
          name="registrationDate"
          label="Prima immatricolazione"
          value={v.registrationDate}
          type="date"
        />
        <Num
          name="grossWeightKg"
          label="Massa complessiva (kg)"
          value={v.grossWeightKg}
          max={99_999}
          hint="Oltre 3.500 kg servono la patente C1 e la revisione annuale"
        />
        <Num
          name="seats"
          label="Posti"
          value={v.seats}
          max={99}
          hint="Omologati, conducente compreso"
        />
        <Num name="stretcherPositions" label="Posti barella" value={v.stretcherPositions} max={9} />
        <Num
          name="wheelchairPositions"
          label="Posti carrozzina"
          value={v.wheelchairPositions}
          max={9}
        />
      </Section>

      <Section title="Allestimento">
        <Text name="outfitter" label="Allestitore" value={v.outfitter} maxLength={120} />
        <Field label="Classe UNI EN 1789" htmlFor="en1789Type" hint="Quando è dichiarata">
          <select
            id="en1789Type"
            name="en1789Type"
            defaultValue={v.en1789Type ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {options(EN1789_LABELS)}
          </select>
        </Field>
        <Check
          name="hasLift"
          label="Pedana o sollevatore per carrozzine"
          checked={v.hasLift ?? false}
        />
        <Check
          name="hasPriorityLights"
          label="Lampeggianti e sirena"
          checked={v.hasPriorityLights ?? false}
        />
      </Section>

      <Section title="Proprietà">
        <Field label="Proprietà" htmlFor="ownership" required>
          <select
            id="ownership"
            name="ownership"
            required
            defaultValue={v.ownership ?? "owned"}
            className={inputClass}
          >
            {options(OWNERSHIP_LABELS)}
          </select>
        </Field>
        <Text
          name="ownerName"
          label="Intestatario"
          value={v.ownerName}
          maxLength={200}
          hint="Quando non è l'associazione (es. il Comune, per un comodato)"
        />
        <Check name="bolloExempt" label="Esente dal bollo" checked={v.bolloExempt ?? false} />
      </Section>

      <Section title="Esercizio">
        <Num
          name="initialOdometerKm"
          label="Km all'ingresso in flotta"
          value={v.initialOdometerKm ?? 0}
          max={9_999_999}
          hint="Si possono correggere, ma non sopra una lettura già registrata"
        />
        <Text
          name="initialOdometerOn"
          label="Letti il giorno"
          value={v.initialOdometerOn}
          type="date"
          hint="Con la data, anche la prima lettura si controlla per i salti impossibili"
        />
        <Text
          name="fuelVehicleCode"
          label="Matricola del distributore"
          value={v.fuelVehicleCode}
          maxLength={30}
          hint="Solo se il distributore non usa il numero interno"
        />
        <Field label="Sede" htmlFor="siteId">
          <select id="siteId" name="siteId" defaultValue={v.siteId ?? ""} className={inputClass}>
            <option value="">—</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.active ? "" : " (non attiva)"}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Field label="Note" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          defaultValue={v.notes ?? ""}
          className={inputClass}
        />
      </Field>
    </div>
  );
}
