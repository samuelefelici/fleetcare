/**
 * Le icone dell'app: SVG in linea, disegnate qui, nessuna libreria.
 * Prendono il colore dal testo (`currentColor`) e la misura da `className`
 * (16 px di default). Sono decorative: il significato sta sempre nel testo
 * accanto, quindi `aria-hidden` e mai focusabili.
 */
import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ className = "size-4", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/** Stato `ok`: cerchio con spunta. */
export function IconOk(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="m5.25 8.25 1.9 1.9 3.6-3.9" />
    </Svg>
  );
}

/** Stato `warn`: triangolo con punto esclamativo. */
export function IconWarn(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5Z" />
      <path d="M8 6.25v3" />
      <path d="M8 11.5h.01" />
    </Svg>
  );
}

/** Stato `critical`: ottagono con croce, la forma del «fermo». */
export function IconCritical(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.4 1.75h5.2l3.65 3.65v5.2l-3.65 3.65H5.4L1.75 10.6V5.4Z" />
      <path d="m6 6 4 4M10 6l-4 4" />
    </Svg>
  );
}

/** Stato `idle`: cerchio con trattino, fuori servizio. */
export function IconIdle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.25 8h5.5" />
    </Svg>
  );
}

/** Informazione: cerchio con «i». */
export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.5" />
      <path d="M8 5.25h.01" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  );
}

/** Elenco vuoto: un vassoio. */
export function IconEmpty(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.75 9.25 3.6 3.4a1 1 0 0 1 .95-.65h6.9a1 1 0 0 1 .95.65l1.85 5.85v3a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1Z" />
      <path d="M1.75 9.25h3.5l.75 1.5h4l.75-1.5h3.5" />
    </Svg>
  );
}

/** Ordinamento di una colonna: freccia su, giù, o entrambe se non ordinata. */
export function IconSort({ dir, className }: IconProps & { dir: "asc" | "desc" | null }) {
  return (
    <Svg className={className}>
      {dir !== "desc" && <path d="m5 6.5 3-3 3 3" />}
      {dir !== "asc" && <path d="m5 9.5 3 3 3-3" />}
    </Svg>
  );
}

/* Shell: sezioni, menu, barra laterale */

/** Mezzi: un'ambulanza di profilo. */
export function IconVehicle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.75 4.25h8.5v6.5h-8.5Z" />
      <path d="M10.25 6.5h2.4l1.6 2.1v2.15h-4" />
      <circle cx="4.5" cy="11.75" r="1.25" />
      <circle cx="11.5" cy="11.75" r="1.25" />
      <path d="M6 5.75v3M4.5 7.25h3" />
    </Svg>
  );
}

/** Scadenze: un calendario. */
export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1" />
      <path d="M2.25 6.5h11.5M5.5 1.75v3M10.5 1.75v3" />
    </Svg>
  );
}

/** Attrezzature: una borsa medica. */
export function IconKit(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.75" y="4.75" width="12.5" height="9" rx="1" />
      <path d="M5.75 4.75v-1.5a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1v1.5M8 7.25v4M6 9.25h4" />
    </Svg>
  );
}

/** Persone: due figure. */
export function IconPeople(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M1.75 13.25a4.25 4.25 0 0 1 8.5 0" />
      <path d="M10.5 3.4a2.25 2.25 0 0 1 0 4.2M11.75 9.4a4.25 4.25 0 0 1 2.5 3.85" />
    </Svg>
  );
}

/** Il proprio profilo: una figura. */
export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 13.75a5.25 5.25 0 0 1 10.5 0" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Svg>
  );
}

/** Riduci la barra laterale (verso sinistra); ruotata di 180° vuol dire «espandi». */
export function IconCollapse(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.5 4.5 5 8l3.5 3.5M12.5 4.5 9 8l3.5 3.5" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.25 2.75h-2.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h2.5M10.25 5.25 13 8l-2.75 2.75M13 8H6.5" />
    </Svg>
  );
}

/** Il segno di FleetCare: una croce, sul quadrato arancio. */
export function IconCross({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

/**
 * L'indicatore di attesa. Gira anche con `prefers-reduced-motion`, più
 * lento: è l'unico segno che qualcosa sta succedendo.
 */
export function Spinner({ className = "size-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 animate-spin motion-reduce:animate-[spin_1.6s_linear_infinite] ${className}`}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity={0.3} strokeWidth={2} />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** L'icona di ciascuno stato, nello stesso posto per badge, avvisi e toast. */
export const STATUS_ICON = {
  ok: IconOk,
  warn: IconWarn,
  critical: IconCritical,
  idle: IconIdle,
} as const;
