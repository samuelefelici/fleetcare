"use client";

/**
 * Il modulo di creazione. Dopo il salvataggio si va alla scheda del mezzo
 * nuovo: la destinazione dipende dall'id restituito, cioè da una funzione,
 * e una funzione non passa da un componente server a uno client. Per
 * questo il modulo sta qui, e la pagina gli passa i campi come figli.
 */
import { useCallback, type ReactNode } from "react";
import { ActionForm } from "@/components/form";
import { createVehicle } from "@/server/actions/mezzi";

export function CreateVehicleForm({ children }: { children: ReactNode }) {
  const redirectTo = useCallback(
    (id: string | undefined) => (id ? `/mezzi/${id}?creato=1` : "/mezzi"),
    [],
  );
  return (
    <ActionForm
      action={createVehicle}
      submitLabel="Crea il mezzo"
      successMessage="Mezzo creato"
      redirectTo={redirectTo}
    >
      {children}
    </ActionForm>
  );
}
