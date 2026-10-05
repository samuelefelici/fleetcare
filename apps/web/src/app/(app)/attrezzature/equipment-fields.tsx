/**
 * I campi di un'attrezzatura, gli stessi per creare e per modificare, e la
 * <select> della posizione (a bordo di un mezzo oppure in sede), usata
 * anche da «Sposta». Componenti server (niente hook): si rendono dentro
 * un <ActionForm>. I nomi dei campi sono le chiavi di `equipmentSchema`.
 */
import type { ReactNode } from "react";
import { EQUIPMENT_GROUP_LABELS } from "@fleetcare/db/domain/labels";
import { Field, inputClass } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, OWNERSHIP_LABELS } from "./labels";
import type { EquipmentInput } from "./parse";

type EquipmentGroup = keyof typeof EQUIPMENT_GROUP_LABELS;

export interface TypeOption {
  id: string;
  label: string;
  group: EquipmentGroup;
  missionCritical: boolean;
}

export interface VehicleOption {
  id: string;
  internalCode: string;
  plate: string;
}

export interface SiteOption {
  id: string;
  name: string;
  active: boolean;
}

/** I valori con cui riempire il modulo: la scheda in modifica, niente in creazione. */
export type EquipmentFormValues = Partial<Omit<EquipmentInput, "place">>;

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
  inputMode,
}: {
  name: string;
  label: string;
  value: string | null | undefined;
  required?: boolean;
  hint?: ReactNode;
  type?: "text" | "date";
  maxLength?: number;
  placeholder?: string;
  inputMode?: "text" | "decimal";
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
        inputMode={inputMode}
        autoComplete="off"
        className={inputClass}
      />
    </Field>
  );
}

function options(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

/** I tipi raggruppati per gruppo del catalogo, nell'ordine in cui arrivano. */
function groupTypes(types: TypeOption[]): Array<[EquipmentGroup, TypeOption[]]> {
  const groups = new Map<EquipmentGroup, TypeOption[]>();
  for (const t of types) {
    const list = groups.get(t.group);
    if (list) list.push(t);
    else groups.set(t.group, [t]);
  }
  return [...groups.entries()];
}

/** La <select> di dove sta: nessuna collocazione, un mezzo o una sede. */
export function PlaceSelect({
  id,
  name,
  vehicles,
  sites,
  defaultValue = "",
}: {
  id: string;
  name: string;
  vehicles: VehicleOption[];
  sites: SiteOption[];
  defaultValue?: string;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue} className={inputClass}>
      <option value="">Nessuna collocazione</option>
      {vehicles.length > 0 && (
        <optgroup label="A bordo del mezzo">
          {vehicles.map((v) => (
            <option key={v.id} value={`vehicle:${v.id}`}>
              {v.internalCode} · {v.plate}
            </option>
          ))}
        </optgroup>
      )}
      {sites.length > 0 && (
        <optgroup label="In sede">
          {sites.map((s) => (
            <option key={s.id} value={`site:${s.id}`}>
              {s.name}
              {s.active ? "" : " (non attiva)"}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function EquipmentFields({
  types,
  equipment,
  typeHint,
  place,
}: {
  types: TypeOption[];
  equipment?: EquipmentFormValues | null;
  /** l'avviso sotto il tipo (in modifica: cambiarlo non rigenera le scadenze) */
  typeHint?: ReactNode;
  /** il campo della posizione, solo in creazione: dopo passa da «Sposta» */
  place?: ReactNode;
}) {
  const e = equipment ?? {};
  return (
    <div className="space-y-8">
      <Section title="Identificazione">
        <Field label="Tipo" htmlFor="equipmentTypeId" required hint={typeHint}>
          <select
            id="equipmentTypeId"
            name="equipmentTypeId"
            required
            defaultValue={e.equipmentTypeId ?? ""}
            className={inputClass}
          >
            <option value="">Scegli…</option>
            {groupTypes(types).map(([group, list]) => (
              <optgroup key={group} label={EQUIPMENT_GROUP_LABELS[group]}>
                {list.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                    {t.missionCritical ? " (indispensabile)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Text
          name="inventoryCode"
          label="Codice inventario"
          value={e.inventoryCode}
          maxLength={50}
          hint="L'etichetta o il QR applicato sull'oggetto"
        />
        <Text name="manufacturer" label="Marca" value={e.manufacturer} maxLength={100} />
        <Text name="model" label="Modello" value={e.model} maxLength={100} />
        <Text
          name="serialNumber"
          label="Matricola"
          value={e.serialNumber}
          maxLength={100}
          hint="Il numero di serie del fabbricante"
        />
        <Field label="Stato" htmlFor="status" required>
          <select
            id="status"
            name="status"
            required
            defaultValue={e.status ?? "in_use"}
            className={inputClass}
          >
            {options(EQUIPMENT_STATUS_LABELS)}
          </select>
        </Field>
      </Section>

      <Section title="Posizione">
        {place}
        <Text
          name="positionNote"
          label="Nota di posizione"
          value={e.positionNote}
          maxLength={200}
          placeholder="Vano sanitario, parete sinistra"
          hint="Dove sta sul mezzo o in sede"
        />
      </Section>

      <Section title="Proprietà">
        <Field label="Proprietà" htmlFor="ownership" required>
          <select
            id="ownership"
            name="ownership"
            required
            defaultValue={e.ownership ?? "owned"}
            className={inputClass}
          >
            {options(OWNERSHIP_LABELS)}
          </select>
        </Field>
        <Text
          name="ownerName"
          label="Intestatario o proprietario"
          value={e.ownerName}
          maxLength={200}
          hint="Quando non è l'associazione (es. l'AST per un DAE in comodato)"
        />
      </Section>

      <Section title="Fabbricazione, acquisto e garanzia">
        <Text
          name="manufacturedOn"
          label="Data di fabbricazione"
          value={e.manufacturedOn}
          type="date"
          hint="Per bombole ed estintori la vita del recipiente parte da qui"
        />
        <Text name="purchaseDate" label="Data d'acquisto" value={e.purchaseDate} type="date" />
        <Text
          name="purchaseValueEur"
          label="Valore d'acquisto (€)"
          value={e.purchaseValueEur}
          inputMode="decimal"
          placeholder="1234,50"
        />
        <Text name="warrantyUntil" label="Garanzia fino al" value={e.warrantyUntil} type="date" />
      </Section>

      <Field label="Note" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          defaultValue={e.notes ?? ""}
          className={inputClass}
        />
      </Field>
    </div>
  );
}
