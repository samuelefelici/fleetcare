"use client";

/**
 * Un modulo che chiama una server action e mostra l'esito: l'errore sopra
 * il pulsante, il successo come toast e, se c'è `redirectTo`, la
 * navigazione. L'azione ha la firma di `useActionState`:
 *   (precedente: ActionResult | null, dati: FormData) => Promise<ActionResult>
 *
 * L'invio passa da `onSubmit` e non dal solo `action`: React 19 svuota il
 * modulo appena l'azione finisce, anche quando l'esito è un errore, e un
 * modulo di venti campi da riscrivere per una targa sbagliata non va bene.
 * Così i campi restano com'erano finché l'azione non riesce; al successo
 * senza navigazione il modulo si svuota da solo. Senza JavaScript vale
 * ancora `action` (senza conferma, come prima con `window.confirm`).
 *
 * La conferma è un dialog (`confirm-dialog.tsx`): si chiede con `confirm`,
 * e un pulsante distruttivo la chiede sempre, anche senza testo.
 */
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions";
import { Button } from "./button";
import { useConfirm } from "./confirm-dialog";
import { confirmFor, type ConfirmOptions } from "./confirm-text";
import { Alert, isDestructive, type ButtonVariant } from "./ui";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** il testo di un pulsante, se è testo: diventa quello del pulsante di conferma */
const textOf = (node: ReactNode): string | undefined =>
  typeof node === "string" ? node : undefined;

export function ActionForm({
  action,
  children,
  submitLabel = "Salva",
  submitVariant = "primary",
  successMessage = "Salvato",
  redirectTo,
  confirm,
  className = "space-y-4",
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
  submitVariant?: ButtonVariant;
  successMessage?: string | null;
  /** dove andare dopo il successo; `(id) => url` se l'azione restituisce un id */
  redirectTo?: string | ((id: string | undefined) => string);
  /**
   * una domanda prima di inviare, per le azioni che pesano (dismettere un
   * mezzo): «Domanda? Spiegazione.» oppure le opzioni del dialog
   */
  confirm?: string | ConfirmOptions;
  className?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(action, null);
  const { confirm: ask, dialog } = useConfirm();
  const question = confirmFor({
    confirm,
    destructive: isDestructive(submitVariant),
    label: submitLabel,
  });

  useEffect(() => {
    if (!state?.ok) return;
    if (successMessage) toast.success(successMessage);
    if (redirectTo) {
      router.push(typeof redirectTo === "function" ? redirectTo(state.id) : redirectTo);
    } else {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, successMessage, redirectTo, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        // i dati si leggono subito: durante il dialog il modulo resta com'è
        const data = new FormData(e.currentTarget);
        if (question && !(await ask(question))) return;
        startTransition(() => formAction(data));
      }}
      className={className}
    >
      {children}
      {state && !state.ok && <Alert tone="critical">{state.error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant={submitVariant} loading={pending}>
          {submitLabel}
        </Button>
      </div>
      {dialog}
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
  confirm?: string | ConfirmOptions;
  children: ReactNode;
  variant?: ButtonVariant;
  successMessage?: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async () => action(), null);
  const { confirm: ask, dialog } = useConfirm();
  const question = confirmFor({
    confirm,
    destructive: isDestructive(variant),
    label: textOf(children),
  });

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (successMessage) toast.success(successMessage);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } else {
      // un errore resta di più: va letto
      toast.error(state.error, { duration: 8000 });
    }
  }, [state, successMessage, redirectTo, router]);

  return (
    <form
      action={formAction}
      onSubmit={async (e) => {
        if (!question) return;
        e.preventDefault();
        if (pending) return;
        if (await ask(question)) startTransition(() => formAction());
      }}
    >
      <Button type="submit" variant={variant} loading={pending}>
        {children}
      </Button>
      {dialog}
    </form>
  );
}
