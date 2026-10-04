import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { FLEET, hasRole, requireSession, run } from "@/server/db";
import { listSites } from "@/server/queries/mezzi";
import { Forbidden } from "../forbidden";
import { VehicleFields } from "../vehicle-fields";
import { CreateVehicleForm } from "./create-form";

export const metadata: Metadata = { title: "Nuovo mezzo" };
export const dynamic = "force-dynamic";

/** Nuovo mezzo (direzione e responsabile mezzi): alla creazione nascono anche le scadenze della sua categoria. */
export default async function NewVehiclePage() {
  const ctx = await requireSession();
  if (!hasRole(ctx, FLEET)) return <Forbidden title="Nuovo mezzo" />;
  const sites = await run((tx) => listSites(tx));

  return (
    <>
      <PageHeader
        title="Nuovo mezzo"
        subtitle={
          <>
            Con il mezzo nascono le scadenze previste dal catalogo per la sua categoria, da
            completare con le date dei documenti.{" "}
            <Link href="/mezzi" className="underline">
              Torna all'elenco
            </Link>
          </>
        }
      />
      <Card className="p-4 sm:p-6">
        <CreateVehicleForm>
          <VehicleFields sites={sites} />
        </CreateVehicleForm>
      </Card>
    </>
  );
}
