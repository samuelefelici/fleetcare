/**
 * I mattoni dell'interfaccia: pochi, uguali dappertutto. Componenti server
 * (nessun hook): si usano anche nelle pagine. Lo stile è Tailwind scritto
 * qui una volta sola, e usa solo i token di `app/tokens.css`.
 *
 * Gli stati interattivi (hover, focus, premuto) si vedono anche senza
 * mouse con `data-force="hover"` e simili: è il gancio della pagina di
 * verifica /dev/ui (le varianti sono ridefinite in `app/globals.css`).
 * Il bottone con lo stato di caricamento è in `button.tsx`, i dialog di
 * conferma in `confirm-dialog.tsx`, la tabella dati in `data-table.tsx`.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { IconCritical, IconEmpty, IconInfo, IconOk, IconWarn, STATUS_ICON } from "./icons";

/** Unisce classi, saltando quelle spente (`cond && "classe"`). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Pulsanti                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Altezza 36 px col mouse e 44 px al tocco (`pointer-coarse`), come i campi,
 * così stanno in riga con loro. Raggio 4 px, come i campi. Nessuna
 * transizione: hover e pressione cambiano subito, il movimento nell'app è
 * solo di opacità e posizione.
 */
const buttonBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-sm px-4 text-14 font-medium whitespace-nowrap select-none pointer-coarse:h-11 disabled:cursor-not-allowed data-loading:cursor-progress";
const buttonVariants = {
  /** l'azione principale della vista: uno solo per vista */
  primary: `${buttonBase} bg-accent font-semibold text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:bg-hover disabled:text-fg-muted`,
  secondary: `${buttonBase} border border-line-strong bg-raised text-fg hover:bg-hover active:bg-canvas disabled:border-line disabled:bg-surface disabled:text-fg-muted`,
  ghost: `${buttonBase} text-fg-secondary hover:bg-hover hover:text-fg active:bg-raised disabled:bg-transparent disabled:text-fg-muted`,
  /**
   * Bordo e testo rossi, tinta in hover: il rosso pieno vorrebbe il testo
   * scuro come l'arancio (il bianco fa 3,49:1) e i due si confonderebbero.
   * Va sempre con un dialog di conferma: `ActionForm` e `ActionButton` lo
   * aprono da soli per questa variante.
   */
  destructive: `${buttonBase} border border-critical text-critical-fg hover:bg-critical-tint active:bg-critical-tint disabled:border-line disabled:bg-transparent disabled:text-fg-muted`,
} as const;

/**
 * `danger` è il nome di prima di `destructive`: le pagine lo usano ancora e
 * lo rinomina la PR7, quando le tocca.
 */
export type ButtonVariant = keyof typeof buttonVariants | "danger";

export function isDestructive(variant: ButtonVariant): boolean {
  return variant === "destructive" || variant === "danger";
}

export function buttonClass(variant: ButtonVariant = "primary"): string {
  return buttonVariants[variant === "danger" ? "destructive" : variant];
}

/** Un link vestito da pulsante. Gli altri attributi passano al link (`data-force` in /dev/ui). */
export function ButtonLink({
  href,
  variant = "primary",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "className" | "children"> & {
  href: string;
  variant?: Exclude<ButtonVariant, "destructive" | "danger">;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link {...props} href={href} className={cx(buttonClass(variant), className)}>
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Campi                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * La classe di ogni campo (input, select, textarea): 36 px col mouse, 44 al
 * tocco, bordo `--border-strong` (3:1 sul fondo), 16 px di testo sempre
 * (sotto i 16 iOS ingrandisce la pagina). Il focus è l'anello globale di
 * `globals.css` (2 px `--signal`, staccato di 2 px). Un campo con
 * `aria-invalid="true"` ha il bordo rosso. Le differenze di select (freccia
 * disegnata in CSS) e textarea (altezza libera) stanno in `globals.css`,
 * sulla classe `campo`, fuori dai layer: altezza, padding e freccia di
 * select e textarea non si cambiano con una classe in più.
 */
export const inputClass =
  "campo block h-9 w-full rounded-sm border border-line-strong bg-raised px-3 text-16 text-fg pointer-coarse:h-11 hover:border-fg-secondary disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-fg-muted aria-invalid:border-critical";

/** Gli id di aiuto ed errore che `Field` dà ai suoi testi, da passare al campo. */
export function fieldIds(id: string) {
  return { hint: `${id}-aiuto`, error: `${id}-errore` };
}

/** `aria-describedby` di un campo con aiuto e/o errore. */
export function describedBy(
  id: string,
  { hint, error }: { hint?: unknown; error?: unknown },
): string | undefined {
  const ids = fieldIds(id);
  return cx(hint ? ids.hint : null, error ? ids.error : null) || undefined;
}

type FieldControl = { invalid?: boolean };

export function Input({ invalid, className, ...props }: ComponentProps<"input"> & FieldControl) {
  return (
    <input
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cx(inputClass, className)}
    />
  );
}

export function Select({ invalid, className, ...props }: ComponentProps<"select"> & FieldControl) {
  return (
    <select
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cx(inputClass, className)}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...props
}: ComponentProps<"textarea"> & FieldControl) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cx(inputClass, className)}
    />
  );
}

/**
 * Etichetta + controllo + eventuale aiuto + eventuale errore, nello stesso
 * ordine ovunque. L'errore sta sotto il campo, con l'icona; perché il
 * lettore di schermo lo legga col campo, il campo ha
 * `aria-describedby={describedBy(id, { hint, error })}` e `invalid`.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  const ids = fieldIds(htmlFor);
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-13 font-medium text-fg">
        {label}
        {required && (
          <span aria-hidden="true" className="text-critical-fg">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={ids.hint} className="mt-1.5 text-12 text-fg-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.error} className="mt-1.5 flex items-start gap-1.5 text-13 text-critical-fg">
          <IconCritical className="mt-0.5 size-3.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Contenitori                                                                 */
/* -------------------------------------------------------------------------- */

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
        <h1 className="text-24 font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-14 text-fg-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Un riquadro: tono rialzato e bordo di 1 px, raggio 6 px, nessuna ombra. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-md border border-line bg-raised", className)}>{children}</div>;
}

/**
 * Un pannello con intestazione: etichetta mono maiuscola di 11 px
 * (`hud-label`) ed eventuali azioni a destra.
 */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName = "p-4",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("rounded-md border border-line bg-surface", className)}>
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-4 py-1.5">
        <h2 className="hud-label">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Coppie etichetta/valore di una scheda. */
export function Details({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-12 font-medium tracking-wide text-fg-secondary uppercase">{label}</dt>
          <dd className="text-14">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Stati di una lista: vuoto, caricamento, errore                              */
/* -------------------------------------------------------------------------- */

/**
 * Niente da mostrare. Con il solo testo (`children`) è una riga discreta;
 * con `title` e `action` dice anche cosa fare.
 */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-md border border-dashed border-line-strong bg-surface p-5",
        className,
      )}
    >
      <IconEmpty className="mt-0.5 size-5 text-fg-muted" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg-secondary">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

/** Il caricamento di una lista o di un dato non ha funzionato. */
export function ErrorState({
  title = "Non è stato possibile caricare i dati",
  children,
  action,
  className,
}: {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-3 rounded-md border border-line bg-surface p-5",
        className,
      )}
    >
      <IconCritical className="mt-0.5 size-5 text-critical" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-fg-secondary">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

/**
 * Un blocco grigio che occupa il posto del contenuto che arriva: va
 * dimensionato come il contenuto vero (`className="h-4 w-32"`), così
 * all'arrivo niente si sposta. Pulsa di sola opacità, ferma con
 * `prefers-reduced-motion`.
 */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block animate-pulse rounded-sm bg-hover motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** Una zona in caricamento: gli skeleton dentro, e il lettore di schermo sente «Caricamento…». */
export function Loading({
  label = "Caricamento…",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avvisi, badge, stati                                                        */
/* -------------------------------------------------------------------------- */

const alertTones = {
  critical: {
    box: "border-critical bg-critical-tint",
    icon: "text-critical-fg",
    Icon: IconCritical,
  },
  warn: { box: "border-warn bg-warn-tint", icon: "text-warn-fg", Icon: IconWarn },
  ok: { box: "border-ok bg-ok-tint", icon: "text-ok-fg", Icon: IconOk },
  info: { box: "border-signal bg-signal-tint", icon: "text-signal-fg", Icon: IconInfo },
} as const;
export type AlertTone = keyof typeof alertTones;

/**
 * Un avviso in linea (l'errore di un modulo sopra il pulsante, un'avvertenza
 * nella scheda): icona + testo sulla tinta del suo stato. L'errore è
 * `role="alert"` (il lettore di schermo lo legge subito), gli altri `status`.
 */
export function Alert({
  tone = "critical",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = alertTones[tone];
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={cx("flex items-start gap-2 rounded-sm border px-3 py-2 text-13", t.box, className)}
    >
      <t.Icon className={cx("mt-px size-4", t.icon)} />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Lo stato di un mezzo, di una scadenza, di un'attrezzatura. */
export type Status = "ok" | "warn" | "critical" | "idle";

const statusTones: Record<Status, string> = {
  ok: "bg-ok-tint text-ok-fg",
  warn: "bg-warn-tint text-warn-fg",
  critical: "bg-critical-tint text-critical-fg",
  idle: "bg-idle-tint text-idle-fg",
};

/**
 * Uno stato si dice con icona + testo + colore, mai col solo colore: il
 * testo è `children` («Operativo», «Scaduta»). Raggio 4 px, niente pillole.
 */
export function StatusBadge({
  status,
  icon,
  children,
}: {
  status: Status;
  /** un'icona diversa da quella dello stato */
  icon?: ReactNode;
  children: ReactNode;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cx(
        "inline-flex min-h-5 items-center gap-1 rounded-sm py-0.5 pr-1.5 pl-1 text-12 font-medium whitespace-nowrap",
        statusTones[status],
      )}
    >
      {icon ?? <Icon className="size-3.5" />}
      {children}
    </span>
  );
}

const badgeTones = {
  neutral: "bg-hover text-fg-secondary",
  ok: "bg-ok-tint text-ok-fg",
  warn: "bg-warn-tint text-warn-fg",
  danger: "bg-critical-tint text-critical-fg",
  /** l'arancio non è uno stato: le pagine lo usano ancora per «Riserva», la PR7 lo toglie */
  brand: "bg-accent-tint text-fg",
} as const;
export type BadgeTone = keyof typeof badgeTones;

/**
 * Un'etichetta senza icona, per le proprietà che non sono stati
 * («elettromedicale», «tu»). Per uno stato si usa `StatusBadge`: i toni
 * `ok`, `warn` e `danger` restano finché la PR7 non sposta lì le pagine.
 */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex min-h-5 items-center gap-1 rounded-sm px-1.5 py-0.5 text-12 font-medium ${badgeTones[tone]}`}
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
    red: "bg-critical",
    grey: "bg-idle",
  }[color];
  return (
    <span className="inline-flex items-center gap-1.5 text-14">
      <span aria-hidden="true" className={`size-2.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
