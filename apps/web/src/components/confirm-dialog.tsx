"use client";

/**
 * La conferma prima di un'azione che pesa, al posto di `window.confirm`.
 *
 * È un `<dialog>` nativo aperto con `showModal()`: il browser porta il
 * dialog sopra tutto, rende inerte il resto della pagina (il focus non
 * esce) e lo chiude con Esc. Qui si aggiungono il focus iniziale su
 * «Annulla» (la scelta che non fa danni), il clic sullo sfondo come
 * annulla, il ritorno del focus al pulsante che l'ha aperto e una guardia
 * contro il doppio clic: il secondo clic (o tocco) di chi ha premuto due
 * volte il pulsante che apre il dialog cadrebbe sul dialog appena aperto,
 * magari proprio sulla conferma. Per 400 ms dall'apertura, e per ogni clic
 * che è il secondo di una serie, il dialog ignora i clic del puntatore; la
 * tastiera (clic con `detail` 0) passa sempre.
 *
 * Si usa col hook: `const { confirm, dialog } = useConfirm()`, poi
 * `if (await confirm({ title: "…" })) …` e `{dialog}` nel JSX.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { Button } from "./button";
import type { ConfirmOptions } from "./confirm-text";

export type { ConfirmOptions } from "./confirm-text";

/** Il contenuto del dialog: titolo, spiegazione, i due pulsanti. */
export function ConfirmPanel({
  title,
  description,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  tone = "destructive",
  titleId,
  descriptionId,
  cancelRef,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  titleId?: string;
  descriptionId?: string;
  cancelRef?: RefObject<HTMLButtonElement | null>;
  onConfirm?: (e: MouseEvent<HTMLButtonElement>) => void;
  onCancel?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      <div className="space-y-2 p-5">
        <h2 id={titleId} className="text-16 font-semibold text-fg">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="text-14 text-fg-secondary">
            {description}
          </p>
        )}
      </div>
      {/* al telefono uno sopra l'altro, «Annulla» per primo: stesso ordine a video e col Tab */}
      <div className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </>
  );
}

export function ConfirmDialog({
  open,
  onResult,
  ...options
}: ConfirmOptions & {
  open: boolean;
  /** `true` se conferma, `false` se annulla (pulsante, Esc o clic sullo sfondo) */
  onResult: (confirmed: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const pressedOnBackdrop = useRef(false);
  const openedAt = useRef(0);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      openedAt.current = performance.now();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /** un clic del puntatore arrivato con il dialog appena aperto, o secondo di una serie */
  const tooSoon = (e: MouseEvent) =>
    e.detail !== 0 && (e.detail > 1 || performance.now() - openedAt.current < 400);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={options.description ? descriptionId : undefined}
      // chiuso da Esc (o dal browser): è un annulla; chiuso da qui dopo un
      // esito, `open` è già falso e non si risponde due volte
      onClose={() => {
        if (open) onResult(false);
        if (opener.current?.isConnected) opener.current.focus();
      }}
      // il clic sullo sfondo arriva al dialog stesso, quello sul contenuto no;
      // conta solo se anche la pressione è partita dallo sfondo (chi seleziona
      // il testo e rilascia fuori non sta annullando)
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const onBackdrop = pressedOnBackdrop.current && e.target === e.currentTarget;
        pressedOnBackdrop.current = false;
        if (onBackdrop && !tooSoon(e)) onResult(false);
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-line-strong bg-raised p-0 text-fg opacity-100 shadow-2xl transition-[opacity,translate,display,overlay] transition-discrete duration-150 ease-standard backdrop:bg-canvas/80 not-open:translate-y-1 not-open:opacity-0 motion-reduce:transition-none starting:open:translate-y-1 starting:open:opacity-0"
    >
      <ConfirmPanel
        {...options}
        titleId={titleId}
        descriptionId={descriptionId}
        cancelRef={cancelRef}
        onConfirm={(e) => {
          if (!tooSoon(e)) onResult(true);
        }}
        onCancel={() => onResult(false)}
      />
    </dialog>
  );
}

/**
 * `confirm(opzioni)` apre il dialog e risolve a `true`/`false`; `dialog` va
 * messo nel JSX del componente. Le opzioni restano dopo la chiusura, così
 * il testo non sparisce mentre il dialog svanisce.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const onResult = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  return { confirm, dialog: <ConfirmDialog {...options} open={open} onResult={onResult} /> };
}
