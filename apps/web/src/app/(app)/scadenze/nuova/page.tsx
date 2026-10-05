import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Card, EmptyState, Field, PageHeader, inputClass } from "@/components/ui";
import { EQUIPMENT, hasRole, requireSession, run } from "@/server/db";
import { getEquipmentBrief, getVehicleBrief, listDeadlineTypes } from "@/server/queries/scadenze";
import { PaginaNonAbilitata } from "../avvisi";
import { describeInterval, listHref } from "../logica";
import { ModuloNuovaScadenza } from "./modulo-nuova";

export const metadata: Metadata = { title: "Nuova scadenza" };
export const dynamic = "force-dynamic";

const uuidOf = (raw: string | string[] | undefined): string | undefined =>
  typeof raw === "string" && z.string().uuid().safeParse(raw).success ? raw : undefined;

/**
 * /scadenze/nuova?mezzo=<id> oppure ?attrezzatura=<id>: una scadenza fuori
 * catalogo per quel soggetto (direzione, responsabile mezzi, responsabile
 * materiale). Tipo, etichetta per distinguerne due dello stesso tipo, data
 * e km iniziali; periodicità e preavviso li eredita dal tipo.
 */
export default async function NewDeadlinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mezzo = uuidOf(sp.mezzo);
  const attrezzatura = mezzo ? undefined : uuidOf(sp.attrezzatura);

  const ctx = await requireSession();
  if (!hasRole(ctx, EQUIPMENT)) {
    return <PaginaNonAbilitata title="Nuova scadenza" backHref="/scadenze" />;
  }

  if (!mezzo && !attrezzatura) {
    return (
      <>
        <PageHeader title="Nuova scadenza" />
        <EmptyState>
          Una scadenza fuori catalogo si aggiunge a un mezzo o a un'attrezzatura: apri l'elenco
          delle scadenze dalla scheda di un{" "}
          <Link href="/mezzi" className="font-medium underline">
            mezzo
          </Link>{" "}
          o di un'
          <Link href="/attrezzature" className="font-medium underline">
            attrezzatura
          </Link>{" "}
          e premi «Nuova scadenza».
        </EmptyState>
      </>
    );
  }

  const data = await run(async (tx) => {
    const vehicle = mezzo ? await getVehicleBrief(tx, mezzo) : null;
    const equipment = attrezzatura ? await getEquipmentBrief(tx, attrezzatura) : null;
    if (!vehicle && !equipment) return null;
    const types = await listDeadlineTypes(tx, vehicle ? "vehicle" : "equipment");
    return { vehicle, equipment, types };
  });

  if (!data) {
    return (
      <>
        <PageHeader title="Nuova scadenza" />
        <EmptyState>
          {mezzo ? "Mezzo" : "Attrezzatura"} non trovato: forse è stato eliminato, o non è di questa
          associazione.{" "}
          <Link href="/scadenze" className="font-medium underline">
            Torna alle scadenze
          </Link>
        </EmptyState>
      </>
    );
  }

  const { vehicle, equipment, types } = data;
  const subject = vehicle
    ? `${vehicle.internalCode} · ${vehicle.plate}`
    : `${equipment!.typeLabel}${equipment!.serialNumber ? ` · matr. ${equipment!.serialNumber}` : ""}`;
  const backHref = listHref("tutte", { mezzo, attrezzatura });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={backHref} className="underline">
          ← Scadenze di {subject}
        </Link>
      </p>
      <PageHeader
        title="Nuova scadenza"
        subtitle={
          <>
            Per {vehicle ? "il mezzo" : "l'attrezzatura"} <strong>{subject}</strong>. Periodicità,
            preavviso e blocco li eredita dal tipo; data e km si possono scrivere anche dopo.
          </>
        }
      />
      <Card className="p-4 sm:p-6">
        {types.length === 0 ? (
          <EmptyState>
            Il catalogo non ha tipi di scadenza per {vehicle ? "i mezzi" : "le attrezzature"}.
          </EmptyState>
        ) : (
          <ModuloNuovaScadenza fallbackHref={backHref}>
            {vehicle ? (
              <input type="hidden" name="mezzo" value={vehicle.id} />
            ) : (
              <input type="hidden" name="attrezzatura" value={equipment!.id} />
            )}
            <Field label="Tipo di scadenza" htmlFor="nuova-tipo" required>
              <select id="nuova-tipo" name="tipo" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Scegli…
                </option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({describeInterval(t)})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Etichetta"
              htmlFor="nuova-etichetta"
              hint="Per distinguere due scadenze dello stesso tipo sullo stesso soggetto (es. «bombola di scorta»)."
            >
              <input
                id="nuova-etichetta"
                name="etichetta"
                type="text"
                maxLength={120}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Data di scadenza"
                htmlFor="nuova-data"
                hint="Quella del documento. Vuota: la scadenza nasce «da completare»."
              >
                <input id="nuova-data" name="data" type="date" className={inputClass} />
              </Field>
              {vehicle && (
                <Field label="Scadenza in km" htmlFor="nuova-km">
                  <input
                    id="nuova-km"
                    name="km"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>
              )}
            </div>
          </ModuloNuovaScadenza>
        )}
      </Card>
    </>
  );
}
