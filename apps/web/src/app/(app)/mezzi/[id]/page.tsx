import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { VEHICLE_CATEGORY_LABELS, VEHICLE_STATUS_LABELS } from "@fleetcare/db/domain/labels";
import { ActionForm } from "@/components/form";
import { Badge, ButtonLink, Card, Details, Field, PageHeader, inputClass } from "@/components/ui";
import { fmtDay, fmtDayTime, fmtKm, todayRome } from "@/lib/format";
import {
  addOdometerReading,
  changeVehicleStatus,
  decommissionVehicle,
} from "@/server/actions/mezzi";
import { FLEET, hasRole, run } from "@/server/db";
import { countVehicleDeadlines, getVehicle, listOdometerReadings } from "@/server/queries/mezzi";
import {
  EN1789_LABELS,
  FUEL_TYPE_LABELS,
  ODOMETER_SOURCE_LABELS,
  OWNERSHIP_LABELS,
  VEHICLE_STATUS_TONE,
} from "../labels";
import { ACTIVE_STATUSES, nowRomeLocal } from "../parse";

export const metadata: Metadata = { title: "Scheda mezzo" };
export const dynamic = "force-dynamic";

const yesNo = (b: boolean) => (b ? "Sì" : "No");
const fmtKg = (n: number | null) =>
  n === null ? null : `${n.toLocaleString("it-IT", { useGrouping: true })} kg`;

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** La scheda di un mezzo: anagrafica, km con il modulo delle letture, stato e dismissione. */
export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { creato } = await searchParams;

  const data = await run(async (tx, ctx) => {
    const vehicle = await getVehicle(tx, id);
    if (!vehicle) return null;
    const readings = await listOdometerReadings(tx, id, 10);
    const deadlineCount = creato ? await countVehicleDeadlines(tx, id) : null;
    return { vehicle, readings, deadlineCount, canWrite: hasRole(ctx, FLEET) };
  });
  if (!data) notFound();
  const { vehicle: v, readings, deadlineCount, canWrite } = data;
  const dismissed = v.status === "decommissioned";
  const makeModel = [v.make, v.model].filter(Boolean).join(" ");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/mezzi" className="underline">
          ← Tutti i mezzi
        </Link>
      </p>
      <PageHeader
        title={`${v.internalCode} · ${v.plate}`}
        subtitle={
          <>
            {VEHICLE_CATEGORY_LABELS[v.category]}
            {makeModel && ` · ${makeModel}`}
            {v.callSign && ` · radio ${v.callSign}`}
          </>
        }
        actions={
          <>
            {canWrite && (
              <ButtonLink href={`/mezzi/${v.id}/modifica`} variant="secondary">
                Modifica
              </ButtonLink>
            )}
            <ButtonLink href={`/scadenze?mezzo=${v.id}`} variant="secondary">
              Scadenze di questo mezzo
            </ButtonLink>
            <ButtonLink href={`/attrezzature?mezzo=${v.id}`} variant="secondary">
              Attrezzature a bordo
            </ButtonLink>
          </>
        }
      />

      {deadlineCount !== null && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-900">
          Mezzo creato.{" "}
          {deadlineCount === 0 ? (
            "Il catalogo non prevede scadenze per questa categoria e proprietà."
          ) : (
            <>
              {deadlineCount === 1
                ? "È nata 1 scadenza, da completare"
                : `Sono nate ${deadlineCount} scadenze, da completare`}{" "}
              con le date dei documenti:{" "}
              <Link href={`/scadenze?mezzo=${v.id}`} className="font-medium underline">
                vai alle scadenze
              </Link>
              .
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Stato</h2>
          <div className="mt-1">
            <Badge tone={VEHICLE_STATUS_TONE[v.status]}>{VEHICLE_STATUS_LABELS[v.status]}</Badge>
          </div>
          {v.statusReason && <p className="mt-2 text-sm">{v.statusReason}</p>}
          {dismissed ? (
            <p className="mt-1 text-xs text-zinc-500">Dismesso il {fmtDay(v.decommissionedOn)}</p>
          ) : (
            v.statusChangedAt && (
              <p className="mt-1 text-xs text-zinc-500">dal {fmtDayTime(v.statusChangedAt)}</p>
            )
          )}
          {v.siteName && <p className="mt-3 text-sm text-zinc-600">Sede: {v.siteName}</p>}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Km attuali</h2>
          <p className="text-3xl font-bold">{fmtKm(v.odometerKm)}</p>
          <p className="text-xs text-zinc-500">
            {v.odometerUpdatedAt
              ? `ultima lettura ${fmtDayTime(v.odometerUpdatedAt)}`
              : `km d'ingresso${v.initialOdometerOn ? ` del ${fmtDay(v.initialOdometerOn)}` : ""}, nessuna lettura ancora`}
          </p>
          {!dismissed && (
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <h3 className="mb-3 font-semibold">Registra lettura del contachilometri</h3>
              <ActionForm
                action={addOdometerReading}
                submitLabel="Registra"
                successMessage="Lettura registrata"
              >
                <input type="hidden" name="vehicleId" value={v.id} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Km" htmlFor="km" required hint="Il numero sul contachilometri">
                    <input
                      id="km"
                      name="km"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Data e ora" htmlFor="readAt" required>
                    <input
                      id="readAt"
                      name="readAt"
                      type="datetime-local"
                      required
                      defaultValue={nowRomeLocal()}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </ActionForm>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Identificazione">
          <Details
            items={[
              ["Numero interno", v.internalCode],
              ["Sigla radio", v.callSign],
              ["Targa", v.plate],
              ["Telaio", v.vin],
              ["Categoria", VEHICLE_CATEGORY_LABELS[v.category]],
            ]}
          />
        </SectionCard>
        <SectionCard title="Veicolo">
          <Details
            items={[
              ["Marca", v.make],
              ["Modello", v.model],
              ["Versione", v.version],
              ["Alimentazione", FUEL_TYPE_LABELS[v.fuelType]],
              ["Prima immatricolazione", v.registrationDate ? fmtDay(v.registrationDate) : null],
              ["Massa complessiva", fmtKg(v.grossWeightKg)],
              ["Posti", v.seats],
              ["Posti barella", v.stretcherPositions],
              ["Posti carrozzina", v.wheelchairPositions],
            ]}
          />
        </SectionCard>
        <SectionCard title="Allestimento">
          <Details
            items={[
              ["Allestitore", v.outfitter],
              ["Classe UNI EN 1789", v.en1789Type ? EN1789_LABELS[v.en1789Type] : null],
              ["Pedana o sollevatore", yesNo(v.hasLift)],
              ["Lampeggianti e sirena", yesNo(v.hasPriorityLights)],
            ]}
          />
        </SectionCard>
        <SectionCard title="Proprietà">
          <Details
            items={[
              ["Proprietà", OWNERSHIP_LABELS[v.ownership]],
              ["Intestatario", v.ownerName],
              ["Esente dal bollo", yesNo(v.bolloExempt)],
            ]}
          />
        </SectionCard>
        <SectionCard title="Esercizio">
          <Details
            items={[
              ["Km all'ingresso in flotta", fmtKm(v.initialOdometerKm)],
              ["Letti il giorno", v.initialOdometerOn ? fmtDay(v.initialOdometerOn) : null],
              ["Matricola del distributore", v.fuelVehicleCode],
              ["Sede", v.siteName],
              ["Ultima modifica", fmtDayTime(v.updatedAt)],
            ]}
          />
          {v.notes && (
            <div className="mt-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Note</div>
              <p className="text-sm whitespace-pre-line">{v.notes}</p>
            </div>
          )}
        </SectionCard>
        {dismissed && (
          <SectionCard title="Dismissione">
            <Details
              items={[
                ["Data", fmtDay(v.decommissionedOn)],
                ["Motivo", v.decommissionReason],
              ]}
            />
          </SectionCard>
        )}
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-3 font-semibold">Ultime letture del contachilometri</h2>
        {readings.length === 0 ? (
          <p className="text-sm text-zinc-500">Nessuna lettura registrata.</p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {readings.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <div>
                  <span className="font-medium">{fmtKm(r.km)}</span>
                  <span className="text-zinc-500"> · {ODOMETER_SOURCE_LABELS[r.source]}</span>
                </div>
                <div className="text-right text-zinc-600">
                  {fmtDayTime(r.readAt)}
                  {r.recordedBy && (
                    <span className="block text-xs text-zinc-500">{r.recordedBy}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canWrite && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-1 font-semibold">Cambia stato</h2>
            <p className="mb-3 text-sm text-zinc-500">
              {dismissed
                ? "Un mezzo dismesso che cambia stato torna in flotta."
                : "Il motivo compare accanto allo stato: perché è in officina, perché è fermo."}
            </p>
            <ActionForm
              action={changeVehicleStatus}
              submitLabel="Aggiorna lo stato"
              successMessage="Stato aggiornato"
            >
              <input type="hidden" name="vehicleId" value={v.id} />
              <Field label="Stato" htmlFor="status" required>
                <select
                  id="status"
                  name="status"
                  required
                  defaultValue={dismissed ? "operational" : v.status}
                  className={inputClass}
                >
                  {ACTIVE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {VEHICLE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Motivo" htmlFor="statusReason">
                <input
                  id="statusReason"
                  name="reason"
                  type="text"
                  maxLength={500}
                  defaultValue={dismissed ? "" : (v.statusReason ?? "")}
                  className={inputClass}
                />
              </Field>
            </ActionForm>
          </Card>

          {!dismissed && (
            <Card className="p-4">
              <h2 className="mb-1 font-semibold">Dismissione</h2>
              <p className="mb-3 text-sm text-zinc-500">
                Il mezzo esce dalla flotta: resta in archivio con le sue letture e le sue scadenze.
              </p>
              <ActionForm
                action={decommissionVehicle}
                submitLabel="Dismetti il mezzo"
                submitVariant="danger"
                successMessage="Mezzo dismesso"
              >
                <input type="hidden" name="vehicleId" value={v.id} />
                <Field label="Data" htmlFor="decommissionedOn" required>
                  <input
                    id="decommissionedOn"
                    name="decommissionedOn"
                    type="date"
                    required
                    defaultValue={todayRome()}
                    className={inputClass}
                  />
                </Field>
                <Field label="Motivo" htmlFor="decommissionReason" required>
                  <input
                    id="decommissionReason"
                    name="reason"
                    type="text"
                    required
                    maxLength={500}
                    placeholder="Venduto, rottamato, restituito al comodante…"
                    className={inputClass}
                  />
                </Field>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
