"use client";

/**
 * Il pulsante «Elimina» della scheda: chiede conferma in un dialog dicendo
 * prima cosa succederà (cancellata se senza storico, archiviata se ha
 * adempimenti) e dopo riporta l'esito vero di `remove_deadline`, che arriva
 * nell'`id` del risultato ('deleted' | 'archived'). Un rifiuto del database
 * resta sotto il pulsante. L'azione arriva già legata all'id dalla pagina
 * (`removeDeadline.bind(null, id)`): un riferimento a una server action
 * passa da un componente server a uno client, e il modulo funziona anche
 * senza JavaScript (senza conferma, come prima).
 */
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions";
import { Button } from "@/components/button";
import { useConfirm } from "@/components/confirm-dialog";
import { Alert } from "@/components/ui";

export function EliminaScadenza({
  action,
  hasHistory,
  backHref,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  hasHistory: boolean;
  /** dove andare dopo: l'elenco delle scadenze del soggetto */
  backHref: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state?.ok) return;
    toast.success(
      state.id === "archived"
        ? "Scadenza archiviata: lo storico degli adempimenti resta"
        : "Scadenza cancellata",
    );
    router.push(backHref);
  }, [state, router, backHref]);

  const { confirm, dialog } = useConfirm();
  const label = hasHistory ? "Elimina (archivia)" : "Elimina";

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget);
        const ok = await confirm(
          hasHistory
            ? {
                title: "Archiviare la scadenza?",
                description:
                  "Ha adempimenti registrati: sparisce dallo scadenzario, lo storico resta.",
                confirmLabel: label,
              }
            : {
                title: "Cancellare la scadenza?",
                description: "Non ha storico: verrà cancellata del tutto.",
                confirmLabel: label,
              },
        );
        if (ok) startTransition(() => formAction(data));
      }}
    >
      {dialog}
      <p className="text-14 text-fg-secondary">
        {hasHistory
          ? "Ha uno storico: eliminandola viene archiviata, gli adempimenti registrati restano."
          : "Non ha storico: eliminandola viene cancellata del tutto."}
      </p>
      <Button type="submit" variant="destructive" loading={pending}>
        {label}
      </Button>
      {state && !state.ok && <Alert tone="critical">{state.error}</Alert>}
    </form>
  );
}
