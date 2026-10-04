import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";

/** La pagina per chi non ha il ruolo: un messaggio chiaro, non un errore. */
export function Forbidden({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState>
        Non è un'operazione del tuo ruolo: i mezzi li gestiscono la direzione e il responsabile
        parco mezzi.{" "}
        <Link href="/mezzi" className="font-medium underline">
          Torna all'elenco dei mezzi
        </Link>
      </EmptyState>
    </>
  );
}
