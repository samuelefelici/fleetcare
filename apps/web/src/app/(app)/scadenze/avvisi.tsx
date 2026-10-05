/**
 * Gli avvisi dello scadenzario per chi non ha il ruolo: un messaggio
 * chiaro al posto del modulo, non un errore. Componenti server, senza hook.
 */
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";

/** A chi spettano le scadenze: direzione, responsabile mezzi, responsabile materiale (EQUIPMENT). */
export const CHI_GESTISCE =
  "alla direzione, al responsabile parco mezzi e al responsabile del materiale";
/** A chi spettano gli adempimenti: anche all'amministrazione, per RCA e bollo (STAFF). */
export const CHI_REGISTRA = `${CHI_GESTISCE}, e all'amministrazione`;

/** Al posto di un modulo che non spetta al ruolo di chi guarda. */
export function RuoloNonAbilitato({ cosa, chi }: { cosa: string; chi: string }) {
  return <p className="text-sm text-zinc-600">{`${cosa} spetta ${chi}.`}</p>;
}

/** Una pagina intera (es. /scadenze/nuova) per chi non ha il ruolo. */
export function PaginaNonAbilitata({ title, backHref }: { title: string; backHref: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState>
        Non è un'operazione del tuo ruolo: le scadenze spettano {CHI_GESTISCE}.{" "}
        <Link href={backHref} className="font-medium underline">
          Torna alle scadenze
        </Link>
      </EmptyState>
    </>
  );
}
