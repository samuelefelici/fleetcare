import type { Metadata } from "next";
import Link from "next/link";
import { Card, Field, PageHeader } from "@/components/ui";
import { EQUIPMENT, hasRole, requireSession, run } from "@/server/db";
import {
  listEquipmentTypes,
  listSitesForSelect,
  listVehiclesForSelect,
} from "@/server/queries/attrezzature";
import { EquipmentFields, PlaceSelect } from "../equipment-fields";
import { Forbidden } from "../forbidden";
import { isUuid, placeValue } from "../parse";
import { CreateEquipmentForm } from "./create-form";

export const metadata: Metadata = { title: "Nuova attrezzatura" };
export const dynamic = "force-dynamic";

/**
 * Nuova attrezzatura (direzione, responsabile mezzi, responsabile del
 * materiale): alla creazione nascono anche le scadenze del suo tipo.
 * `?mezzo=<id>` o `?sede=<id>` preselezionano la posizione (dall'elenco
 * di un mezzo).
 */
export default async function NewEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireSession();
  if (!hasRole(ctx, EQUIPMENT)) return <Forbidden title="Nuova attrezzatura" />;
  const params = await searchParams;
  const { types, vehicles, sites } = await run(async (tx) => ({
    types: await listEquipmentTypes(tx),
    vehicles: await listVehiclesForSelect(tx),
    sites: await listSitesForSelect(tx),
  }));
  const presetVehicle =
    typeof params.mezzo === "string" && isUuid(params.mezzo) ? params.mezzo : null;
  const presetSite = typeof params.sede === "string" && isUuid(params.sede) ? params.sede : null;
  const preset = placeValue({
    vehicleId: presetVehicle,
    siteId: presetVehicle ? null : presetSite,
  });

  return (
    <>
      <PageHeader
        title="Nuova attrezzatura"
        subtitle={
          <>
            Con l'attrezzatura nascono le scadenze previste dal catalogo per il suo tipo, da
            completare con le date dei documenti.{" "}
            <Link href="/attrezzature" className="underline">
              Torna all'elenco
            </Link>
          </>
        }
      />
      <Card className="p-4 sm:p-6">
        <CreateEquipmentForm>
          <EquipmentFields
            types={types}
            place={
              <Field
                label="Dove sta"
                htmlFor="place"
                hint={
                  vehicles.length === 0 && sites.length === 0
                    ? "Non c'è ancora né un mezzo né una sede: si può indicare dopo, con «Sposta»."
                    : "A bordo di un mezzo oppure in una sede; dopo si cambia con «Sposta»."
                }
              >
                <PlaceSelect
                  id="place"
                  name="place"
                  vehicles={vehicles}
                  sites={sites}
                  defaultValue={preset}
                />
              </Field>
            }
          />
        </CreateEquipmentForm>
      </Card>
    </>
  );
}
