/**
 * Controlla i rapporti di contrasto WCAG 2.1 delle coppie di token che
 * l'interfaccia usa davvero, leggendo i valori da src/app/tokens.css.
 * Fallisce (exit 1) se una coppia sta sotto la sua soglia:
 *   4,5:1 testo normale · 3:1 testo grande o non essenziale · 3:1 bordi,
 *   icone e anelli di focus (componenti non testuali, WCAG 1.4.11).
 * Controlla anche che viewport.themeColor di src/app/layout.tsx sia
 * --bg-base, l'unico colore che non può stare nei token CSS.
 *
 * Si esegue con Node da solo (toglie i tipi): `node scripts/check-contrast.ts`.
 * Per questo è un file unico, senza import relativi né alias.
 */
import { readFileSync } from "node:fs";

const TEXT = 4.5;
const LARGE = 3;
const NON_TEXT = 3;

type Pair = { fg: string; bg: string; min: number; use: string };

const tokensCss = readFileSync(new URL("../src/app/tokens.css", import.meta.url), "utf8");
const layoutTsx = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

/** Le variabili `--nome: #rrggbb;` del blocco :root (tema scuro). */
function readTokens(css: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root?.[1]) throw new Error("tokens.css: blocco :root non trovato");
  const tokens = new Map<string, string>();
  for (const m of root[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (m[1] && m[2]) tokens.set(m[1], m[2].toLowerCase());
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const surfaces = ["bg-base", "bg-surface", "bg-raised", "bg-hover"];
const statuses = ["ok", "warn", "critical", "idle"];

const pairs: Pair[] = [
  // testo sulle superfici
  ...surfaces.flatMap((bg) => [
    { fg: "text-primary", bg, min: TEXT, use: "testo principale" },
    { fg: "text-secondary", bg, min: TEXT, use: "testo secondario" },
    {
      fg: "text-muted",
      bg,
      min: LARGE,
      use: "solo testo disabilitato o decorativo, o grande: ≥ 24 px o ≥ 18,66 px in grassetto",
    },
    { fg: "signal-fg", bg, min: TEXT, use: "link" },
    ...statuses.map((s) => ({ fg: `status-${s}-fg`, bg, min: TEXT, use: `testo di stato ${s}` })),
  ]),
  // bottone primario: testo scuro sull'arancio, in ogni stato
  { fg: "on-accent", bg: "accent", min: TEXT, use: "testo del bottone primario" },
  { fg: "on-accent", bg: "accent-hover", min: TEXT, use: "bottone primario in hover" },
  { fg: "on-accent", bg: "accent-pressed", min: TEXT, use: "bottone primario premuto" },
  // tinte: testo principale e testo del proprio stato
  ...statuses.flatMap((s) => [
    { fg: "text-primary", bg: `status-${s}-tint`, min: TEXT, use: `testo su tinta ${s}` },
    {
      fg: `status-${s}-fg`,
      bg: `status-${s}-tint`,
      min: TEXT,
      use: `testo di stato su tinta ${s}`,
    },
    { fg: `status-${s}`, bg: `status-${s}-tint`, min: NON_TEXT, use: `icona su tinta ${s}` },
  ]),
  { fg: "text-primary", bg: "accent-tint", min: TEXT, use: "testo su tinta arancio" },
  { fg: "accent", bg: "accent-tint", min: NON_TEXT, use: "bordo/icona su tinta arancio" },
  { fg: "text-primary", bg: "signal-tint", min: TEXT, use: "testo su selezione" },
  { fg: "signal-fg", bg: "signal-tint", min: TEXT, use: "link su selezione" },
  // componenti non testuali sulle superfici dove stanno
  ...["bg-base", "bg-surface", "bg-raised"].flatMap((bg) => [
    { fg: "border-strong", bg, min: NON_TEXT, use: "bordo di campi e controlli" },
    { fg: "signal", bg, min: NON_TEXT, use: "anello di focus" },
    { fg: "accent", bg, min: NON_TEXT, use: "bottone primario sul fondo" },
    ...statuses.map((s) => ({ fg: `status-${s}`, bg, min: NON_TEXT, use: `icona/pallino ${s}` })),
  ]),
];

const tokens = readTokens(tokensCss);
const value = (name: string): string => {
  const v = tokens.get(name);
  if (!v) throw new Error(`tokens.css: manca --${name}`);
  return v;
};

let failures = 0;
const rows: string[] = [];
for (const p of pairs) {
  const ratio = contrast(value(p.fg), value(p.bg));
  const ok = ratio >= p.min;
  if (!ok) failures++;
  rows.push(
    `${ok ? "ok  " : "NO  "} ${ratio.toFixed(2).padStart(5)} ≥ ${p.min.toFixed(1)}  --${p.fg} su --${p.bg}  (${p.use})`,
  );
}

const themeColor = /themeColor:\s*"(#[0-9a-fA-F]{6})"/.exec(layoutTsx)?.[1]?.toLowerCase();
if (themeColor !== value("bg-base")) {
  failures++;
  rows.push(
    `NO   themeColor di layout.tsx (${themeColor ?? "assente"}) ≠ --bg-base (${value("bg-base")})`,
  );
} else {
  rows.push(`ok   themeColor di layout.tsx = --bg-base (${themeColor})`);
}

const verbose = process.argv.includes("--tutte");
for (const r of rows) if (verbose || r.startsWith("NO")) console.log(r);
console.log(
  failures === 0
    ? `contrasto: ${rows.length} controlli, tutti sopra soglia`
    : `contrasto: ${failures} controlli su ${rows.length} sotto soglia`,
);
process.exit(failures === 0 ? 0 : 1);
