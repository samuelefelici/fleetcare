import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { updateEquipment } from "@/server/actions/attrezzature";
import { EQUIPMENT, hasRole, requireSession, run } from "@/server/db";
import { getEquipment, listEquipmentTypes } from "@/server/queries/attrezzature";
import { EquipmentFields } from "../../equipment-fields";
import { Forbidden } from "../../forbidden";
import { isUuid, placeLabel } from "../../parse";

export const metadata: Metadata = { title: "Modifica attrezzatura" };
export const dynamic = "force-dynamic";

/** Modifica della scheda: tutti i campi del modulo di creazione, tranne la posizione (che passa da «Sposta»). */
export default async function EditEquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireSession();
  if (!hasRole(ctx, EQUIPMENT)) return <Forbidden title="Modifica attrezzatura" />;

  const data = await run(async (tx) => {
    const item = await getEquipment(tx, id);
    if (!item) return null;
    const types = await listEquipmentTypes(tx);
    // un tipo disattivato nel catalogo resta scelto nella scheda che ce l'ha
    if (!types.some((t) => t.id === item.equipmentTypeId)) {
      types.push({
        id: item.equipmentTypeId,
        label: `${item.typeLabel} (non più attivo)`,
        group: item.typeGroup,
        missionCritical: item.missionCritical,
      });
    }
    return { item, types };
  });
  if (!data) notFound();
  const { item: e, types } = data;
  const where = placeLabel({ vehicleCode: e.vehicleCode, siteName: e.siteName });

  return (
    <>
      <PageHeader
        title={`Modifica ${e.inventoryCode ? `${e.typeLabel} · ${e.inventoryCode}` : e.typeLabel}`}
        subtitle={
          <>
            Dove sta ({where}) non si cambia qui: si usa «Sposta» nella scheda.{" "}
            <Link href={`/attrezzature/${e.id}`} className="underline">
              Torna alla scheda
            </Link>
          </>
        }
      />
      <Card className="p-4 sm:p-6">
        <ActionForm
          action={updateEquipment}
          submitLabel="Salva le modifiche"
          successMessage="Attrezzatura aggiornata"
          redirectTo={`/attrezzature/${e.id}`}
        >
          <input type="hidden" name="id" value={e.id} />
          <EquipmentFields
            types={types}
            equipment={e}
            typeHint="Cambiare il tipo non rigenera le scadenze già nate"
          />
        </ActionForm>
      </Card>
    </>
  );
}
