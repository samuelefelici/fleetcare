import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { fmtKm } from "@/lib/format";
import { updateVehicle } from "@/server/actions/mezzi";
import { FLEET, hasRole, requireSession, run } from "@/server/db";
import { getVehicle, listSites } from "@/server/queries/mezzi";
import { Forbidden } from "../../forbidden";
import { VehicleFields } from "../../vehicle-fields";

export const metadata: Metadata = { title: "Modifica mezzo" };
export const dynamic = "force-dynamic";

/** Modifica dell'anagrafica (direzione e responsabile mezzi): tutti i campi, tranne il km attuale. */
export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const ctx = await requireSession();
  if (!hasRole(ctx, FLEET)) return <Forbidden title="Modifica mezzo" />;

  const data = await run(async (tx) => {
    const vehicle = await getVehicle(tx, id);
    if (!vehicle) return null;
    return { vehicle, sites: await listSites(tx) };
  });
  if (!data) notFound();
  const { vehicle: v, sites } = data;

  return (
    <>
      <PageHeader
        title={`Modifica ${v.internalCode} · ${v.plate}`}
        subtitle={
          <>
            I km attuali ({fmtKm(v.odometerKm)}) non si cambiano qui: si registra una lettura nella
            scheda.{" "}
            <Link href={`/mezzi/${v.id}`} className="underline">
              Torna alla scheda
            </Link>
          </>
        }
      />
      <Card className="p-4 sm:p-6">
        <ActionForm
          action={updateVehicle}
          submitLabel="Salva le modifiche"
          successMessage="Mezzo aggiornato"
          redirectTo={`/mezzi/${v.id}`}
        >
          <input type="hidden" name="id" value={v.id} />
          <VehicleFields vehicle={v} sites={sites} />
        </ActionForm>
      </Card>
    </>
  );
}
