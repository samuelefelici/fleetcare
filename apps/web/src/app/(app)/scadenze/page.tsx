import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Badge, ButtonLink, EmptyState, PageHeader, Semaphore } from "@/components/ui";
import { fmtDay, todayRome } from "@/lib/format";
import { EQUIPMENT, hasRole, run } from "@/server/db";
import { getEquipmentBrief, getVehicleBrief, listDeadlines } from "@/server/queries/scadenze";
import {
  countByState,
  defaultFiltro,
  dueText,
  evaluateRows,
  FILTRO_LABELS,
  listHref,
  matchesFiltro,
  parseStatoFiltro,
  sortByUrgency,
  STATO_FILTRI,
  stateText,
  subjectLabel,
} from "./logica";

export const metadata: Metadata = { title: "Scadenze" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const uuidOf = (raw: string | string[] | undefined): string | undefined =>
  typeof raw === "string" && z.string().uuid().safeParse(raw).success ? raw : undefined;

/**
 * Lo scadenzario: tutte le scadenze non archiviate dell'associazione (o
 * quelle di un mezzo / di un'attrezzatura), in ordine di urgenza, con i
 * conteggi per stato e i filtri. Di default si vedono quelle da seguire
 * (tutto tranne le in regola); per un singolo soggetto si vede tutto.
 */
export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const mezzo = uuidOf(sp.mezzo);
  const attrezzatura = mezzo ? undefined : uuidOf(sp.attrezzatura);
  const subject = { mezzo, attrezzatura };
  const bySubject = Boolean(mezzo || attrezzatura);

  const data = await run(async (tx, ctx) => {
    const vehicle = mezzo ? await getVehicleBrief(tx, mezzo) : null;
    const equipment = attrezzatura ? await getEquipmentBrief(tx, attrezzatura) : null;
    const rows = await listDeadlines(tx, { vehicleId: mezzo, equipmentId: attrezzatura });
    return { vehicle, equipment, rows, canWrite: hasRole(ctx, EQUIPMENT) };
  });

  const today = todayRome();
  const filtro = parseStatoFiltro(sp.stato, defaultFiltro(bySubject));
  const items = sortByUrgency(
    evaluateRows(
      data.rows.map((r) => ({
        ...r,
        odometerKm: r.vehicleId ? r.vehicleOdometerKm : null,
        subjectLabel: subjectLabel(r),
      })),
      today,
    ),
  );
  const counts = countByState(items);
  const visible = items.filter((i) => matchesFiltro(i.evaluation.state, filtro));

  const title = data.vehicle
    ? `Scadenze del mezzo ${data.vehicle.internalCode} · ${data.vehicle.plate}`
    : data.equipment
      ? `Scadenze: ${data.equipment.typeLabel}${
          data.equipment.serialNumber ? ` · matr. ${data.equipment.serialNumber}` : ""
        }`
      : "Scadenze";
  const subjectHref = data.vehicle
    ? `/mezzi/${data.vehicle.id}`
    : data.equipment
      ? `/attrezzature/${data.equipment.id}`
      : null;
  const newHref = data.vehicle
    ? `/scadenze/nuova?mezzo=${data.vehicle.id}`
    : data.equipment
      ? `/scadenze/nuova?attrezzatura=${data.equipment.id}`
      : null;

  return (
    <>
      {bySubject && (
        <p className="mb-2 text-sm">
          <Link href="/scadenze" className="underline">
            ← Tutte le scadenze
          </Link>
        </p>
      )}
      <PageHeader
        title={title}
        subtitle={
          <>
            Oggi {fmtDay(today)} · {counts.tutte} {counts.tutte === 1 ? "scadenza" : "scadenze"}
            {counts.scadute > 0 && ` · ${counts.scadute} scadute`}
            {counts.in_scadenza > 0 && ` · ${counts.in_scadenza} in scadenza`}
            {counts.da_completare > 0 && ` · ${counts.da_completare} da completare`}
            {data.equipment?.vehicleCode && (
              <>
                {" "}
                · a bordo di {data.equipment.vehicleCode} · {data.equipment.vehiclePlate}
              </>
            )}
          </>
        }
        actions={
          <>
            {subjectHref && (
              <ButtonLink href={subjectHref} variant="secondary">
                {data.vehicle ? "Scheda del mezzo" : "Scheda dell'attrezzatura"}
              </ButtonLink>
            )}
            {data.canWrite && newHref && <ButtonLink href={newHref}>Nuova scadenza</ButtonLink>}
          </>
        }
      />

      {bySubject && !data.vehicle && !data.equipment && (
        <EmptyState>
          {mezzo ? "Mezzo" : "Attrezzatura"} non trovato: forse è stato eliminato, o non è di questa
          associazione.
        </EmptyState>
      )}

      <nav aria-label="Filtra per stato" className="mb-4 flex flex-wrap gap-2">
        {STATO_FILTRI.map((f) => {
          const active = f === filtro;
          return (
            <Link
              key={f}
              href={listHref(f, subject)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                active
                  ? "border-brand bg-brand/20 font-semibold text-brand-ink"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {FILTRO_LABELS[f]}
              <span className="rounded-full bg-zinc-100 px-1.5 text-xs text-zinc-700">
                {counts[f]}
              </span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <EmptyState>
          {counts.tutte === 0
            ? "Nessuna scadenza. Le scadenze nascono con i mezzi e le attrezzature, dal catalogo dell'associazione; una fuori catalogo si aggiunge dall'elenco delle scadenze di un mezzo o di un'attrezzatura."
            : `Nessuna scadenza «${FILTRO_LABELS[filtro].toLowerCase()}».`}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {visible.map(({ row, evaluation, color }) => (
            <li key={row.id}>
              <Link
                href={`/scadenze/${row.id}`}
                className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50 sm:grid-cols-[1.2fr_1.4fr_1fr_1.1fr] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="font-semibold">{row.subjectLabel}</div>
                  {row.equipmentId && row.hostVehicleCode && (
                    <div className="text-xs text-zinc-500">
                      a bordo di {row.hostVehicleCode} · {row.hostVehiclePlate}
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-sm">
                  <span>{row.typeLabel}</span>
                  {row.label && <span className="text-zinc-500"> · {row.label}</span>}
                  {row.blocking && (
                    <span className="ml-2 align-middle">
                      <Badge tone={evaluation.state === "expired" ? "danger" : "neutral"}>
                        {row.vehicleId ? "Blocca il mezzo" : "Blocca l'attrezzatura"}
                      </Badge>
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <span className={row.dueOn || row.dueKm !== null ? "" : "text-zinc-500"}>
                    {dueText(row.dueOn ? fmtDay(row.dueOn) : null, row.dueKm)}
                  </span>
                </div>
                <div>
                  <Semaphore color={color}>{stateText(evaluation)}</Semaphore>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
