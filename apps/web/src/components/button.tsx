"use client";

/**
 * Il pulsante. Le varianti sono quelle di `buttonClass` (ui.tsx); in più
 * c'è lo stato di caricamento: lo spinner prende il posto del testo
 * senza cambiare la larghezza, e il pulsante resta focusabile ma non si
 * può premere di nuovo (`aria-disabled`, il clic viene annullato). Con
 * `disabled` vero il browser toglierebbe il focus a chi l'ha appena
 * premuto da tastiera.
 *
 * Di default è `type="button"`: un pulsante dentro un modulo invia solo
 * se lo si chiede con `type="submit"`.
 */
import type { ComponentProps } from "react";
import { Spinner } from "./icons";
import { buttonClass, cx, type ButtonVariant } from "./ui";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  /** in attesa dell'esito: spinner, niente secondo clic */
  loading?: boolean;
  /** cosa sente il lettore di schermo durante l'attesa */
  loadingLabel?: string;
};

export function Button({
  variant = "primary",
  loading = false,
  loadingLabel = "Un momento…",
  type = "button",
  className,
  children,
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-disabled={loading || props["aria-disabled"] || undefined}
      data-loading={loading || undefined}
      onClick={(e) => {
        // anche l'invio con Invio da un campo passa da qui: il browser
        // simula il clic sul pulsante di invio
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cx(buttonClass(variant), "relative", className)}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
      <span className={cx("inline-flex items-center gap-2", loading && "opacity-0")}>
        {children}
      </span>
      {loading && <span className="sr-only">{loadingLabel}</span>}
    </button>
  );
}
