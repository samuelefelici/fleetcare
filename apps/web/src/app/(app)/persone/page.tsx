import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { hasRole, ROLE_LABELS, run } from "@/server/db";
import { listPeople } from "@/server/queries/persone";

export const metadata: Metadata = { title: "Persone" };
export const dynamic = "force-dynamic";

/**
 * La rubrica dell'associazione: la leggono tutti. L'email compare solo
 * dove la sessione la può vedere (la propria; tutte per la direzione).
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ mostra?: string }>;
}) {
  const { mostra } = await searchParams;
  const showAll = mostra === "tutti";
  const { people, ctx } = await run(async (tx, ctx) => ({
    people: await listPeople(tx, showAll),
    ctx,
  }));
  const isAdmin = hasRole(ctx, ["admin"]);
  const inactive = people.filter((p) => !p.active).length;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <>
      <PageHeader
        title="Persone"
        subtitle={
          showAll
            ? `${count(people.length, "persona", "persone")} in rubrica, ${count(inactive, "disattivata", "disattivate")}`
            : count(people.length, "persona attiva", "persone attive")
        }
        actions={
          <>
            <ButtonLink href="/profilo" variant="secondary">
              Il mio profilo
            </ButtonLink>
            {isAdmin && <ButtonLink href="/persone/nuova">Nuova persona</ButtonLink>}
          </>
        }
      />

      <p className="mb-3 text-sm">
        {showAll ? (
          <Link href="/persone" className="text-zinc-700 underline hover:text-zinc-900">
            Nascondi le persone disattivate
          </Link>
        ) : (
          <Link
            href="/persone?mostra=tutti"
            className="text-zinc-700 underline hover:text-zinc-900"
          >
            Mostra anche le persone disattivate
          </Link>
        )}
      </p>

      {people.length === 0 ? (
        <EmptyState>Nessuna persona in rubrica.</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                href={`/persone/${p.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${p.active ? "" : "text-zinc-500"}`}>
                      {p.fullName}
                    </span>
                    {p.id === ctx.userId && <Badge tone="brand">tu</Badge>}
                    {!p.active && <Badge tone="danger">Disattivata</Badge>}
                  </div>
                  <div className="text-sm text-zinc-500">
                    {ROLE_LABELS[p.role]}
                    {p.badgeNumber ? ` · tessera ${p.badgeNumber}` : ""}
                    {` · autista: ${p.isDriver ? "sì" : "no"}`}
                  </div>
                </div>
                {p.email && <span className="truncate text-sm text-zinc-600">{p.email}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
