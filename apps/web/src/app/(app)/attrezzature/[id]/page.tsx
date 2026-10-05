import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EQUIPMENT_GROUP_LABELS } from "@fleetcare/db/domain/labels";
import { ActionButton, ActionForm } from "@/components/form";
import { Badge, ButtonLink, Card, Details, Field, PageHeader, inputClass } from "@/components/ui";
import { fmtDay, fmtDayTime, fmtEur } from "@/lib/format";
import { moveEquipment, setEquipmentStatus } from "@/server/actions/attrezzature";
import { EQUIPMENT, hasRole, run } from "@/server/db";
import {
  countEquipmentDeadlines,
  getEquipment,
  listMovements,
  listSitesForSelect,
  listVehiclesForSelect,
} from "@/server/queries/attrezzature";
import { ElectromedicalBadge, MissionBadge, StatusBadge } from "../badges";
import { PlaceSelect } from "../equipment-fields";
import { EQUIPMENT_STATUS_LABELS, OWNERSHIP_LABELS, type EquipmentStatus } from "../labels";
import { isUuid, movementText, placeLabel, placeValue } from "../parse";

export const metadata: Metadata = { title: "Scheda attrezzatura" };
export const dynamic = "force-dynamic";

const yesNo = (b: boolean) => (b ? "Sì" : "No");

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** La scheda di un'attrezzatura: dati, stato, dove sta con «Sposta», lo storico degli spostamenti. */
export default async function EquipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { creata } = await searchParams;

  const data = await run(async (tx, ctx) => {
    const item = await getEquipment(tx, id);
    if (!item) return null;
    const canWrite = hasRole(ctx, EQUIPMENT);
    return {
      item,
      movements: await listMovements(tx, id),
      deadlineCount: creata ? await countEquipmentDeadlines(tx, id) : null,
      vehicles: canWrite ? await listVehiclesForSelect(tx) : [],
      sites: canWrite ? await listSitesForSelect(tx) : [],
      canWrite,
    };
  });
  if (!data) notFound();
  const { item: e, movements, deadlineCount, sites, canWrite } = data;
  // il mezzo attuale resta in tendina anche se dismesso: altrimenti il browser
  // sceglierebbe «Nessuna collocazione» e «Sposta» toglierebbe l'attrezzatura in silenzio
  const hostDismissed = e.vehicleStatus === "decommissioned";
  const vehicles =
    e.vehicleId && !data.vehicles.some((x) => x.id === e.vehicleId)
      ? [
          {
            id: e.vehicleId,
            internalCode: `${e.vehicleCode ?? "?"} (dismesso)`,
            plate: e.vehiclePlate ?? "",
          },
          ...data.vehicles,
        ]
      : data.vehicles;

  const makeModel = [e.manufacturer, e.model].filter(Boolean).join(" ");
  const where = placeLabel({ vehicleCode: e.vehicleCode, siteName: e.siteName });
  const whereHref = e.vehicleId
    ? `/attrezzature?mezzo=${e.vehicleId}`
    : e.siteId
      ? `/attrezzature?sede=${e.siteId}`
      : null;
  const attributes = Object.entries(e.attributes ?? {});
  const otherStatuses = (Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).filter(
    (s) => s !== e.status,
  );

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/attrezzature" className="underline">
          ← Tutte le attrezzature
        </Link>
      </p>
      <PageHeader
        title={e.inventoryCode ? `${e.typeLabel} · ${e.inventoryCode}` : e.typeLabel}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              {EQUIPMENT_GROUP_LABELS[e.typeGroup]}
              {makeModel && ` · ${makeModel}`}
              {e.serialNumber && ` · matr. ${e.serialNumber}`}
            </span>
            {e.missionCritical && <MissionBadge />}
            {e.electromedical && <ElectromedicalBadge />}
          </span>
        }
        actions={
          <>
            {canWrite && (
              <ButtonLink href={`/attrezzature/${e.id}/modifica`} variant="secondary">
                Modifica
              </ButtonLink>
            )}
            <ButtonLink href={`/scadenze?attrezzatura=${e.id}`} variant="secondary">
              Scadenze di questa attrezzatura
            </ButtonLink>
          </>
        }
      />

      {deadlineCount !== null && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-900">
          Attrezzatura registrata.{" "}
          {deadlineCount === 0 ? (
            "Il catalogo non prevede scadenze per questo tipo e proprietà."
          ) : (
            <>
              {deadlineCount === 1
                ? "È nata 1 scadenza, da completare"
                : `Sono nate ${deadlineCount} scadenze, da completare`}{" "}
              con le date dei documenti:{" "}
              <Link href={`/scadenze?attrezzatura=${e.id}`} className="font-medium underline">
                vai alle scadenze
              </Link>
              .
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Stato</h2>
          <div className="mt-1">
            <StatusBadge status={e.status} />
          </div>
          {canWrite && (
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <p className="mb-3 text-sm text-zinc-500">
                {e.status === "disposed"
                  ? "Una dismessa che cambia stato torna in archivio."
                  : "Cambia lo stato con un tocco; «Dismessa» chiede conferma."}
              </p>
              <div className="flex flex-wrap gap-2">
                {otherStatuses.map((status) => (
                  <ActionButton
                    key={status}
                    action={setEquipmentStatus.bind(null, e.id, status)}
                    variant={status === "disposed" ? "danger" : "secondary"}
                    confirm={
                      status === "disposed"
                        ? "Dismettere questa attrezzatura? Esce dagli elenchi e resta in archivio con il suo storico e le sue scadenze."
                        : undefined
                    }
                    successMessage={`Ora è: ${EQUIPMENT_STATUS_LABELS[status].toLowerCase()}`}
                  >
                    {EQUIPMENT_STATUS_LABELS[status]}
                  </ActionButton>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Dove sta</h2>
          <p className="mt-1 text-lg font-semibold">
            {whereHref ? (
              <Link href={whereHref} className="underline">
                {where}
              </Link>
            ) : (
              where
            )}
            {e.vehiclePlate && (
              <span className="font-normal text-zinc-500"> · {e.vehiclePlate}</span>
            )}
            {hostDismissed && (
              <span className="ml-2 align-middle">
                <Badge tone="neutral">Mezzo dismesso</Badge>
              </span>
            )}
          </p>
          {e.positionNote && <p className="text-sm text-zinc-600">{e.positionNote}</p>}
          {canWrite && (
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <h3 className="mb-3 font-semibold">Sposta</h3>
              <ActionForm action={moveEquipment} submitLabel="Sposta" successMessage="Spostata">
                <input type="hidden" name="equipmentId" value={e.id} />
                <Field label="Nuova posizione" htmlFor="place">
                  <PlaceSelect
                    id="place"
                    name="place"
                    vehicles={vehicles}
                    sites={sites}
                    defaultValue={placeValue({ vehicleId: e.vehicleId, siteId: e.siteId })}
                  />
                </Field>
                <Field label="Motivo" htmlFor="reason">
                  <input
                    id="reason"
                    name="reason"
                    type="text"
                    maxLength={300}
                    placeholder="Il mezzo 12 va in officina"
                    className={inputClass}
                  />
                </Field>
              </ActionForm>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Identificazione">
          <Details
            items={[
              ["Tipo", e.typeLabel],
              ["Gruppo", EQUIPMENT_GROUP_LABELS[e.typeGroup]],
              ["Codice inventario", e.inventoryCode],
              ["Matricola", e.serialNumber],
              ["Marca", e.manufacturer],
              ["Modello", e.model],
              ["Elettromedicale", yesNo(e.electromedical)],
              ["Indispensabile per il mezzo", yesNo(e.missionCritical)],
            ]}
          />
        </SectionCard>
        <SectionCard title="Proprietà">
          <Details
            items={[
              ["Proprietà", OWNERSHIP_LABELS[e.ownership]],
              ["Intestatario", e.ownerName],
            ]}
          />
        </SectionCard>
        <SectionCard title="Fabbricazione, acquisto e garanzia">
          <Details
            items={[
              ["Data di fabbricazione", e.manufacturedOn ? fmtDay(e.manufacturedOn) : null],
              ["Data d'acquisto", e.purchaseDate ? fmtDay(e.purchaseDate) : null],
              ["Valore d'acquisto", fmtEur(e.purchaseValueEur)],
              ["Garanzia fino al", e.warrantyUntil ? fmtDay(e.warrantyUntil) : null],
            ]}
          />
        </SectionCard>
        <SectionCard title="Altro">
          <Details
            items={[
              ...attributes.map(([key, value]): [string, React.ReactNode] => [key, String(value)]),
              ["Registrata il", fmtDayTime(e.createdAt)],
              ["Ultima modifica", fmtDayTime(e.updatedAt)],
            ]}
          />
          {e.notes && (
            <div className="mt-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Note</div>
              <p className="text-sm whitespace-pre-line">{e.notes}</p>
            </div>
          )}
        </SectionCard>
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-3 font-semibold">Storico degli spostamenti</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nessuno spostamento registrato: sta dove è stata registrata.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <div>
                  <span className="font-medium">{movementText(m)}</span>
                  {m.reason && <span className="block text-zinc-600">{m.reason}</span>}
                </div>
                <div className="shrink-0 text-right text-zinc-600">
                  {fmtDayTime(m.movedAt)}
                  {m.movedBy && <span className="block text-xs text-zinc-500">{m.movedBy}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
