"use client";

/**
 * Il pulsante «Elimina» della scheda: chiede conferma dicendo prima cosa
 * succederà (cancellata se senza storico, archiviata se ha adempimenti) e
 * dopo riporta l'esito vero di `remove_deadline`, che arriva nell'`id`
 * del risultato ('deleted' | 'archived'). Un rifiuto del database resta
 * sotto il pulsante. L'azione arriva già legata all'id dalla pagina
 * (`removeDeadline.bind(null, id)`): un riferimento a una server action
 * passa da un componente server a uno client, e il modulo funziona anche
 * senza JavaScript.
 */
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions";
import { buttonClass } from "@/components/ui";

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

  const confirmText = hasHistory
    ? "Questa scadenza ha adempimenti registrati: verrà archiviata (sparisce dallo scadenzario, lo storico resta). Continuare?"
    : "Questa scadenza non ha storico: verrà cancellata del tutto. Continuare?";

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <p className="text-sm text-zinc-600">
        {hasHistory
          ? "Ha uno storico: eliminandola viene archiviata, gli adempimenti registrati restano."
          : "Non ha storico: eliminandola viene cancellata del tutto."}
      </p>
      <button type="submit" disabled={pending} className={buttonClass("danger")}>
        {pending ? "Un momento…" : hasHistory ? "Elimina (archivia)" : "Elimina"}
      </button>
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
