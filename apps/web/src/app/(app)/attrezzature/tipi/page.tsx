import type { Metadata } from "next";
import Link from "next/link";
import { EQUIPMENT_GROUP_LABELS } from "@fleetcare/db/domain/labels";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { run } from "@/server/db";
import { listEquipmentTypesWithCounts } from "@/server/queries/attrezzature";
import { ElectromedicalBadge, MissionBadge } from "../badges";

export const metadata: Metadata = { title: "Catalogo dei tipi" };
export const dynamic = "force-dynamic";

type Group = keyof typeof EQUIPMENT_GROUP_LABELS;
type TypeRow = Awaited<ReturnType<typeof listEquipmentTypesWithCounts>>[number];

/** Il catalogo dei tipi di attrezzatura, in sola lettura, con quante attrezzature ne esistono. */
export default async function EquipmentTypesPage() {
  const types = await run((tx) => listEquipmentTypesWithCounts(tx));

  const groups = new Map<Group, TypeRow[]>();
  for (const t of types) {
    const list = groups.get(t.group);
    if (list) list.push(t);
    else groups.set(t.group, [t]);
  }
  const inArchive = types.reduce((n, t) => n + t.inArchive, 0);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/attrezzature" className="underline">
          ← Tutte le attrezzature
        </Link>
      </p>
      <PageHeader
        title="Catalogo dei tipi"
        subtitle={`${types.length} tipi · ${inArchive === 1 ? "1 attrezzatura" : `${inArchive} attrezzature`} in archivio, senza le dismesse. Le scadenze che un tipo porta con sé stanno nelle regole dello scadenzario.`}
      />
      {types.length === 0 ? (
        <EmptyState>Il catalogo è vuoto.</EmptyState>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([group, list]) => (
            <section key={group}>
              <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                {EQUIPMENT_GROUP_LABELS[group]}
              </h2>
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        {t.label}
                        {t.missionCritical && <MissionBadge />}
                        {t.electromedical && <ElectromedicalBadge />}
                        {!t.active && <Badge tone="warn">non attivo</Badge>}
                      </div>
                      <div className="text-sm text-zinc-500">{t.code}</div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      {t.inArchive > 0 ? (
                        <Link href={`/attrezzature?tipo=${t.id}`} className="font-medium underline">
                          {t.inArchive === 1 ? "1 attrezzatura" : `${t.inArchive} attrezzature`}
                        </Link>
                      ) : (
                        <span className="text-zinc-500">Nessuna</span>
                      )}
                      {t.disposed > 0 && (
                        <span className="block text-xs text-zinc-500">
                          {t.disposed === 1 ? "1 dismessa" : `${t.disposed} dismesse`}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
