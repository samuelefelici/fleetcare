import type { Metadata } from "next";
import Link from "next/link";
import {
  ButtonLink,
  EmptyState,
  Field,
  PageHeader,
  buttonClass,
  inputClass,
} from "@/components/ui";
import { EQUIPMENT, hasRole, run } from "@/server/db";
import {
  getSiteHeading,
  getTypeHeading,
  getVehicleHeading,
  listEquipment,
} from "@/server/queries/attrezzature";
import { MissionBadge, StatusBadge } from "./badges";
import { EQUIPMENT_STATUS_LABELS } from "./labels";
import { hasAnyFilter, listHref, parseListFilters, placeLabel } from "./parse";

export const metadata: Metadata = { title: "Attrezzature" };
export const dynamic = "force-dynamic";

/**
 * L'elenco delle attrezzature: senza le dismesse, salvo `?mostra=tutti`.
 * Filtri dall'indirizzo: `?mezzo=<id>` (a bordo di quel mezzo),
 * `?sede=<id>`, `?tipo=<id>`, `?stato=<stato>`.
 */
export default async function EquipmentListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseListFilters(await searchParams);
  const { rows, vehicle, site, type, canWrite } = await run(async (tx, ctx) => ({
    rows: await listEquipment(tx, filters),
    vehicle: filters.vehicleId ? await getVehicleHeading(tx, filters.vehicleId) : null,
    site: filters.siteId ? await getSiteHeading(tx, filters.siteId) : null,
    type: filters.typeId ? await getTypeHeading(tx, filters.typeId) : null,
    canWrite: hasRole(ctx, EQUIPMENT),
  }));

  const title = vehicle
    ? `Attrezzature a bordo del mezzo ${vehicle.internalCode}`
    : site
      ? `Attrezzature in sede: ${site.name}`
      : type
        ? `Attrezzature: ${type.label}`
        : "Attrezzature";
  const missing =
    (filters.vehicleId && !vehicle && "Il mezzo indicato non esiste.") ||
    (filters.siteId && !site && "La sede indicata non esiste.") ||
    (filters.typeId && !type && "Il tipo indicato non esiste.") ||
    null;
  const counted = rows.length === 1 ? "1 attrezzatura" : `${rows.length} attrezzature`;
  const newHref = vehicle
    ? `/attrezzature/nuova?mezzo=${vehicle.id}`
    : site
      ? `/attrezzature/nuova?sede=${site.id}`
      : "/attrezzature/nuova";

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          <>
            {vehicle && `${vehicle.plate} · `}
            {counted}
            {!filters.status && (
              <>
                {" · "}
                {filters.showAll ? (
                  <Link href={listHref(filters, { showAll: false })} className="underline">
                    Nascondi le dismesse
                  </Link>
                ) : (
                  <Link href={listHref(filters, { showAll: true })} className="underline">
                    Mostra anche le dismesse
                  </Link>
                )}
              </>
            )}
            {hasAnyFilter(filters) && (
              <>
                {" · "}
                <Link href="/attrezzature" className="underline">
                  Tutte le attrezzature
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <ButtonLink href="/attrezzature/tipi" variant="secondary">
              Catalogo dei tipi
            </ButtonLink>
            {canWrite && <ButtonLink href={newHref}>Nuova attrezzatura</ButtonLink>}
          </>
        }
      />

      <form method="get" action="/attrezzature" className="mb-4 flex flex-wrap items-end gap-2">
        {filters.vehicleId && <input type="hidden" name="mezzo" value={filters.vehicleId} />}
        {filters.siteId && <input type="hidden" name="sede" value={filters.siteId} />}
        {filters.typeId && <input type="hidden" name="tipo" value={filters.typeId} />}
        {filters.showAll && <input type="hidden" name="mostra" value="tutti" />}
        <div className="w-full sm:w-56">
          <Field label="Stato" htmlFor="stato">
            <select
              id="stato"
              name="stato"
              defaultValue={filters.status ?? ""}
              className={inputClass}
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Filtra
        </button>
      </form>

      {missing ? (
        <EmptyState>{missing}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>
          {hasAnyFilter(filters)
            ? "Nessuna attrezzatura con questi filtri."
            : canWrite
              ? "Nessuna attrezzatura ancora: registra la prima con «Nuova attrezzatura»."
              : "Nessuna attrezzatura registrata."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {rows.map((r) => {
            const details = [
              r.inventoryCode && `inv. ${r.inventoryCode}`,
              r.serialNumber && `matr. ${r.serialNumber}`,
              [r.manufacturer, r.model].filter(Boolean).join(" "),
            ].filter(Boolean);
            return (
              <li key={r.id}>
                <Link
                  href={`/attrezzature/${r.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {r.typeLabel}
                      {r.missionCritical && <MissionBadge />}
                    </div>
                    <div className="truncate text-sm text-zinc-500">
                      {details.length > 0 ? details.join(" · ") : "Senza codice né matricola"}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={r.status} />
                    <span className="text-sm text-zinc-600">
                      {placeLabel({ vehicleCode: r.vehicleCode, siteName: r.siteName })}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
