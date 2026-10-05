import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pagina non trovata" };

/** Un indirizzo che non esiste, fuori dall'app (prima dell'accesso). */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Pagina non trovata</h1>
      <p className="mt-2 text-zinc-600">
        L'indirizzo non corrisponde a nessuna pagina di FleetCare.
      </p>
      <p className="mt-6">
        <Link href="/" className="underline">
          Vai all'app
        </Link>
      </p>
    </main>
  );
}
