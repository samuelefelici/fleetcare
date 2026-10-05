"use client";

/**
 * Il modulo della scadenza nuova. Dopo il salvataggio si va alla scheda
 * della scadenza appena creata: la destinazione dipende dall'id
 * restituito, cioè da una funzione, e una funzione non passa da un
 * componente server a uno client. Per questo il modulo sta qui, e la
 * pagina gli passa i campi come figli.
 */
import { useCallback, type ReactNode } from "react";
import { ActionForm } from "@/components/form";
import { createDeadline } from "@/server/actions/scadenze";

export function ModuloNuovaScadenza({
  children,
  fallbackHref,
}: {
  children: ReactNode;
  /** dove andare se l'id non arriva: l'elenco delle scadenze del soggetto */
  fallbackHref: string;
}) {
  const redirectTo = useCallback(
    (id: string | undefined) => (id ? `/scadenze/${id}` : fallbackHref),
    [fallbackHref],
  );
  return (
    <ActionForm
      action={createDeadline}
      submitLabel="Crea la scadenza"
      successMessage="Scadenza creata"
      redirectTo={redirectTo}
    >
      {children}
    </ActionForm>
  );
}
