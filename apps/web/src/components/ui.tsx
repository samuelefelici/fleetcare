/**
 * I mattoni dell'interfaccia: pochi, uguali dappertutto. Componenti server
 * (nessun hook): si usano anche nelle pagine. Lo stile è Tailwind scritto
 * qui una volta sola.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:bg-zinc-100";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-50";
const buttonVariants = {
  primary: `${buttonBase} bg-brand text-brand-ink hover:bg-amber-400`,
  secondary: `${buttonBase} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50`,
  danger: `${buttonBase} border border-red-300 bg-white text-danger hover:bg-red-50`,
  ghost: `${buttonBase} text-zinc-700 hover:bg-zinc-100`,
} as const;
export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary"): string {
  return buttonVariants[variant];
}

/** Un link vestito da pulsante. */
export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Etichetta + controllo + eventuale aiuto, nello stesso ordine ovunque. */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-zinc-800">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white ${className}`}>{children}</div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-zinc-600">
      {children}
    </p>
  );
}

const badgeTones = {
  neutral: "bg-zinc-100 text-zinc-700",
  ok: "bg-green-100 text-green-800",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  brand: "bg-brand/20 text-brand-ink",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Il semaforo di una scadenza o di un mezzo: un pallino colorato con il testo. */
export function Semaphore({
  color,
  children,
}: {
  color: "green" | "yellow" | "red" | "grey";
  children?: ReactNode;
}) {
  const dot = {
    green: "bg-ok",
    yellow: "bg-warn",
    red: "bg-danger",
    grey: "bg-zinc-400",
  }[color];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true" className={`size-2.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/** Coppie etichetta/valore di una scheda. */
export function Details({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
          <dd className="text-sm">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
