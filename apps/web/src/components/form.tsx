"use client";

/**
 * Un modulo che chiama una server action e mostra l'esito: l'errore sopra
 * il pulsante, il successo come toast e, se c'è `redirectTo`, la
 * navigazione. L'azione ha la firma di `useActionState`:
 *   (precedente: ActionResult | null, dati: FormData) => Promise<ActionResult>
 */
import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions";
import { buttonClass, type ButtonVariant } from "./ui";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  submitLabel = "Salva",
  submitVariant = "primary",
  successMessage = "Salvato",
  redirectTo,
  className = "space-y-4",
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
  submitVariant?: ButtonVariant;
  successMessage?: string | null;
  /** dove andare dopo il successo; `(id) => url` se l'azione restituisce un id */
  redirectTo?: string | ((id: string | undefined) => string);
  className?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state?.ok) return;
    if (successMessage) toast.success(successMessage);
    if (redirectTo) {
      router.push(typeof redirectTo === "function" ? redirectTo(state.id) : redirectTo);
    } else {
      router.refresh();
    }
  }, [state, successMessage, redirectTo, router]);

  return (
    <form action={formAction} className={className}>
      {children}
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="submit" disabled={pending} className={buttonClass(submitVariant)}>
          {pending ? "Un momento…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Un pulsante che esegue un'azione senza campi (archivia, disattiva…), con conferma. */
export function ActionButton({
  action,
  confirm,
  children,
  variant = "secondary",
  successMessage = "Fatto",
  redirectTo,
}: {
  action: () => Promise<ActionResult>;
  confirm?: string;
  children: ReactNode;
  variant?: ButtonVariant;
  successMessage?: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async () => action(), null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (successMessage) toast.success(successMessage);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, successMessage, redirectTo, router]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <button type="submit" disabled={pending} className={buttonClass(variant)}>
        {children}
      </button>
    </form>
  );
}
