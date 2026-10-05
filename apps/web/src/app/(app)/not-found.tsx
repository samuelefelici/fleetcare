import type { Metadata } from "next";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Pagina non trovata" };

/** Una scheda che non c'è più (eliminata, o di un'altra associazione) o un indirizzo sbagliato. */
export default function NotFound() {
  return (
    <>
      <PageHeader title="Pagina non trovata" />
      <EmptyState>
        Forse è stata eliminata, o non è di questa associazione. Riparti da una sezione.
      </EmptyState>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href="/mezzi" variant="secondary">
          Mezzi
        </ButtonLink>
        <ButtonLink href="/scadenze" variant="secondary">
          Scadenze
        </ButtonLink>
        <ButtonLink href="/attrezzature" variant="secondary">
          Attrezzature
        </ButtonLink>
      </div>
    </>
  );
}
