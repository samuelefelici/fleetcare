import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";

/** La pagina per chi non ha il ruolo: un messaggio chiaro, non un errore. */
export function Forbidden({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState>
        Non è un'operazione del tuo ruolo: le attrezzature le gestiscono la direzione, il
        responsabile parco mezzi e il responsabile del materiale sanitario.{" "}
        <Link href="/attrezzature" className="font-medium underline">
          Torna all'elenco delle attrezzature
        </Link>
      </EmptyState>
    </>
  );
}
