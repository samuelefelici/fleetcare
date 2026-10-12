/**
 * La hero della login, per ora ferma: il poster della scena 1 (la sua
 * inquadratura larga). Le foto vere arrivano con la PR6; finché mancano, il
 * poster è un segnaposto disegnato qui (gradiente grafite, rettangolo
 * wireframe, nome del file atteso), senza immagini scaricate né file.
 * L'animazione delle scene è la PR5.
 *
 * È decorativa: `aria-hidden`, niente di focusabile, `pointer-events: none`.
 * Il segnaposto è in 4:5 come gli asset (viewBox 1000×1250) e riempie il
 * riquadro come `object-fit: cover`.
 */
import type { CSSProperties } from "react";

/** Il segnaposto di un asset delle scene: lo userà anche il motore della PR5. */
export function ScenePlaceholder({
  file,
  label,
  className,
}: {
  /** il nome del file atteso in public/login/ */
  file: string;
  /** cosa ritrae, in maiuscolo: «ASSE ANTERIORE · INQUADRATURA LARGA» */
  label: string;
  className?: string;
}) {
  const id = `sfondo-${file.replace(/[^a-z0-9]/gi, "")}`;
  const stop = (color: string): CSSProperties => ({ stopColor: color });
  return (
    <svg
      viewBox="0 0 1000 1250"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" style={stop("var(--bg-raised)")} />
          <stop offset="1" style={stop("var(--bg-base)")} />
        </linearGradient>
      </defs>
      <rect width="1000" height="1250" fill={`url(#${id})`} />
      {/* il wireframe: il riquadro dove andrà l'ambulanza, con le diagonali */}
      <g className="fill-none stroke-line-strong" strokeWidth={2} strokeDasharray="10 8">
        <rect x="140" y="420" width="720" height="440" rx="6" />
        <path d="M140 420 860 860M860 420 140 860" />
      </g>
      <g className="fill-fg-secondary font-sans" textAnchor="middle">
        <text x="500" y="935" fontSize="30">
          {file}
        </text>
        <text x="500" y="980" fontSize="22" className="fill-fg-muted" letterSpacing="3">
          {label}
        </text>
      </g>
    </svg>
  );
}

/** Il riquadro della hero: il poster in cover e la sfumatura verso il modulo. */
export function LoginHero() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative h-[28vh] overflow-hidden bg-canvas lg:sticky lg:top-0 lg:h-dvh"
    >
      <ScenePlaceholder
        file="scene-01-wide.jpg"
        label="ASSE ANTERIORE · INQUADRATURA LARGA"
        className="absolute inset-0 size-full"
      />
      {/* nessuna linea netta col modulo: 160 px di sfumatura verso il grafite
          (a sinistra da lg, in basso al telefono, dove la hero è una banda) */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-surface to-transparent lg:inset-x-auto lg:inset-y-0 lg:left-0 lg:h-auto lg:w-40 lg:bg-linear-to-r" />
    </div>
  );
}
