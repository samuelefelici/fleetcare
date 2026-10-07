/**
 * La tabella dati: righe di 40 px, intestazione che resta in vista,
 * numeri a destra in mono con cifre tabulari. Componente server.
 *
 * La tabella sta in un riquadro che scorre nei due sensi: in orizzontale
 * quando le colonne non ci stanno (nessuna colonna viene mai tagliata), in
 * verticale quando le righe superano l'altezza dello schermo, e lì
 * l'intestazione si ferma in cima al riquadro. Una tabella più corta dello
 * schermo non scorre affatto e si legge come parte della pagina. L'altezza
 * massima si cambia con `maxHeight` ("16rem", oppure "none" per lasciarla
 * libera: allora l'intestazione scorre via con la pagina). Se sopra c'è una
 * barra fissa, chi la mette definisce `--sticky-top` con la sua altezza, e
 * il riquadro la toglie dall'altezza dello schermo.
 *
 * Il riquadro si raggiunge col Tab e si scorre con le frecce: senza, chi usa
 * la tastiera non vedrebbe le colonne nascoste a destra.
 *
 * L'ordinamento sta nell'URL: la colonna dice dove porta il clic
 * sull'intestazione e com'è ordinata ora; la pagina ordina i dati.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { IconSort } from "./icons";
import { cx, Loading, Skeleton } from "./ui";

export type SortDir = "asc" | "desc";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** numeri (km, importi): a destra, in mono, cifre tabulari, mai a capo */
  numeric?: boolean;
  /** codici, targhe, date: in mono, a sinistra, mai a capo */
  mono?: boolean;
  className?: string;
  /**
   * link dell'intestazione e verso attuale (`null` se non è la colonna
   * ordinata); `force` è il `data-force` di /dev/ui
   */
  sort?: { href: string; dir: SortDir | null; force?: string };
};

const FRAME = "overflow-auto rounded-md border border-line bg-surface";
const DEFAULT_MAX_HEIGHT = "calc(100dvh - var(--sticky-top, 0px) - 1rem)";

const thClass =
  "sticky top-0 z-[1] h-10 border-b border-line-strong bg-surface text-left align-middle text-12 font-medium whitespace-nowrap text-fg-secondary pointer-coarse:h-11";
const tdClass =
  "h-10 border-b border-line px-3 align-middle group-last/riga:border-b-0 group-hover/riga:bg-hover";

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  maxHeight = DEFAULT_MAX_HEIGHT,
  rowForce,
  className,
}: {
  /** cosa contiene la tabella: lo legge il lettore di schermo, e dà il nome al riquadro */
  caption: string;
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  /** cosa mostrare al posto della tabella se non ci sono righe (di solito un EmptyState) */
  empty?: ReactNode;
  /** altezza massima del riquadro; di default lo schermo meno le barre fisse */
  maxHeight?: string;
  /** il `data-force` di una riga, per mostrarne l'hover in /dev/ui */
  rowForce?: (row: T) => string | undefined;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      style={{ maxHeight }}
      className={cx(FRAME, className)}
    >
      <table className="w-full border-separate border-spacing-0">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  c.sort?.dir === "asc"
                    ? "ascending"
                    : c.sort?.dir === "desc"
                      ? "descending"
                      : undefined
                }
                className={cx(thClass, !c.sort && "px-3", c.numeric && "text-right", c.className)}
              >
                {c.sort ? (
                  // il link riempie la cella: bersaglio largo quanto la colonna, 44 px al tocco
                  <Link
                    href={c.sort.href}
                    data-force={c.sort.force}
                    className={cx(
                      "flex h-full min-h-10 w-full items-center gap-1 rounded-sm px-3 hover:text-fg pointer-coarse:min-h-11",
                      c.numeric && "justify-end",
                      c.sort.dir && "text-fg",
                    )}
                  >
                    {c.header}
                    <IconSort dir={c.sort.dir} className="size-3.5" />
                  </Link>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} data-force={rowForce?.(row)} className="group/riga">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    tdClass,
                    c.numeric && "text-right font-mono text-13 whitespace-nowrap tabular",
                    c.mono && "font-mono text-13 whitespace-nowrap",
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6"];

/**
 * La tabella mentre i dati arrivano: stesse intestazioni, stesse righe di
 * 40 px, così all'arrivo dei dati niente si sposta.
 */
export function DataTableSkeleton({
  columns,
  rows = 5,
  label = "Caricamento…",
}: {
  columns: Array<{ header: ReactNode; numeric?: boolean }>;
  rows?: number;
  label?: string;
}) {
  return (
    <Loading label={label}>
      <div aria-hidden="true" className={FRAME}>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={cx(thClass, "px-3", c.numeric && "text-right")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r} className="group/riga">
                {columns.map((c, i) => (
                  <td key={i} className={tdClass}>
                    <Skeleton
                      className={cx(
                        "h-3",
                        c.numeric
                          ? "ml-auto w-12"
                          : SKELETON_WIDTHS[(r + i) % SKELETON_WIDTHS.length],
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Loading>
  );
}
