import type { Metadata } from "next";
import * as schema from "@fleetcare/db";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { hasRole, requireSession, ROLE_LABELS } from "@/server/db";
import { ModuloNuovaPersona } from "./modulo";

export const metadata: Metadata = { title: "Nuova persona" };
export const dynamic = "force-dynamic";

/** Solo la direzione aggiunge persone (policy di `profiles`). */
export default async function NewPersonPage() {
  const ctx = await requireSession();
  const roles = schema.profileRole.enumValues.map((value) => ({
    value,
    label: ROLE_LABELS[value],
  }));

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Nuova persona"
        actions={
          <ButtonLink href="/persone" variant="secondary">
            Tutte le persone
          </ButtonLink>
        }
      />
      {hasRole(ctx, ["admin"]) ? (
        <Card className="p-5">
          <ModuloNuovaPersona roles={roles} />
        </Card>
      ) : (
        <EmptyState>Solo la direzione può aggiungere persone alla rubrica.</EmptyState>
      )}
    </div>
  );
}
