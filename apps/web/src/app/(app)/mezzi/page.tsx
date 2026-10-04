import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import * as schema from "@fleetcare/db";
import { VEHICLE_CATEGORY_LABELS, VEHICLE_STATUS_LABELS } from "@fleetcare/db/domain/labels";
import { run } from "@/server/db";

export const metadata: Metadata = { title: "Mezzi" };
export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const vehicles = await run((tx) =>
    tx
      .select({
        id: schema.vehicles.id,
        internalCode: schema.vehicles.internalCode,
        plate: schema.vehicles.plate,
        category: schema.vehicles.category,
        status: schema.vehicles.status,
        make: schema.vehicles.make,
        model: schema.vehicles.model,
      })
      .from(schema.vehicles)
      .orderBy(asc(schema.vehicles.internalCode)),
  );

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Mezzi</h1>
      {vehicles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
          Nessun mezzo ancora. L'inserimento arriva con il prossimo rilascio.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {vehicles.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <div className="font-semibold">
                  {v.internalCode} · {v.plate}
                </div>
                <div className="text-sm text-zinc-500">
                  {VEHICLE_CATEGORY_LABELS[v.category]}
                  {v.make || v.model ? ` · ${[v.make, v.model].filter(Boolean).join(" ")}` : ""}
                </div>
              </div>
              <span className="text-sm text-zinc-600">{VEHICLE_STATUS_LABELS[v.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
