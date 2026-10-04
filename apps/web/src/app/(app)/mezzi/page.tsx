import type { Metadata } from "next";
import Link from "next/link";
import { VEHICLE_CATEGORY_LABELS, VEHICLE_STATUS_LABELS } from "@fleetcare/db/domain/labels";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { fmtKm } from "@/lib/format";
import { FLEET, hasRole, run } from "@/server/db";
import { listVehicles } from "@/server/queries/mezzi";
import { VEHICLE_STATUS_TONE } from "./labels";

export const metadata: Metadata = { title: "Mezzi" };
export const dynamic = "force-dynamic";

/** L'elenco del parco: senza i dismessi, salvo `?mostra=tutti`. */
export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showAll = params.mostra === "tutti";
  const { vehicles, canWrite } = await run(async (tx, ctx) => ({
    vehicles: await listVehicles(tx, { includeDecommissioned: showAll }),
    canWrite: hasRole(ctx, FLEET),
  }));

  return (
    <>
      <PageHeader
        title="Mezzi"
        subtitle={
          <>
            {vehicles.length === 1 ? "1 mezzo" : `${vehicles.length} mezzi`}
            {" · "}
            {showAll ? (
              <Link href="/mezzi" className="underline">
                Nascondi i dismessi
              </Link>
            ) : (
              <Link href="/mezzi?mostra=tutti" className="underline">
                Mostra anche i dismessi
              </Link>
            )}
          </>
        }
        actions={canWrite && <ButtonLink href="/mezzi/nuovo">Nuovo mezzo</ButtonLink>}
      />
      {vehicles.length === 0 ? (
        <EmptyState>
          {showAll
            ? "Nessun mezzo in archivio."
            : "Nessun mezzo in flotta. I dismessi, se ci sono, si vedono con «Mostra anche i dismessi»."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {vehicles.map((v) => {
            const makeModel = [v.make, v.model].filter(Boolean).join(" ");
            return (
              <li key={v.id}>
                <Link
                  href={`/mezzi/${v.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {v.internalCode}
                      <span className="font-normal text-zinc-500"> · {v.plate}</span>
                    </div>
                    <div className="truncate text-sm text-zinc-500">
                      {VEHICLE_CATEGORY_LABELS[v.category]}
                      {makeModel && ` · ${makeModel}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={VEHICLE_STATUS_TONE[v.status]}>
                      {VEHICLE_STATUS_LABELS[v.status]}
                    </Badge>
                    <span className="text-sm text-zinc-600">{fmtKm(v.odometerKm)}</span>
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
