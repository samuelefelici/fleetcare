"use client";

/**
 * Il modulo di creazione. Dopo il salvataggio si va alla scheda
 * dell'attrezzatura nuova: la destinazione dipende dall'id restituito,
 * cioè da una funzione, e una funzione non passa da un componente server
 * a uno client. Per questo il modulo sta qui, e la pagina gli passa i
 * campi come figli.
 */
import { useCallback, type ReactNode } from "react";
import { ActionForm } from "@/components/form";
import { createEquipment } from "@/server/actions/attrezzature";

export function CreateEquipmentForm({ children }: { children: ReactNode }) {
  const redirectTo = useCallback(
    (id: string | undefined) => (id ? `/attrezzature/${id}?creata=1` : "/attrezzature"),
    [],
  );
  return (
    <ActionForm
      action={createEquipment}
      submitLabel="Registra l'attrezzatura"
      successMessage="Attrezzatura registrata"
      redirectTo={redirectTo}
    >
      {children}
    </ActionForm>
  );
}
