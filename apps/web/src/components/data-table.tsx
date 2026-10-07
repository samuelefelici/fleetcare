/**
 * La tabella dati: righe di 40 px, intestazione che resta in vista
 * scorrendo, numeri a destra in mono con cifre tabulari. Componente server.
 *
 * L'intestazione è `sticky` rispetto alla pagina: per questo da `md` in su
 * il contenitore taglia (`overflow: clip`) invece di scorrere, perché un
 * contenitore che scorre diventerebbe il riferimento dello sticky. Sotto
 * `md` la tabella scorre in orizzontale e l'intestazione resta ferma in
 * cima alla tabella. Se sopra c'è una barra fissa, chi la mette definisce
 * `--sticky-top` con la sua altezza. Con `maxHeight` la tabella scorre
 * dentro il suo riquadro, e l'intestazione si ferma in cima a quello.
 *
 * L'ordinamento sta nell'URL: la colonna dice dove porta il clic
 * sull'intestazione e com'è ordinata ora; la pagina ordina i dati.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { IconSort } from "./icons";
import { cx, Loading, Skeleton } from "./ui";

export type SortDir = "asc" | "desc";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** numeri (km, importi): a destra, in mono, cifre tabulari */
  numeric?: boolean;
  /** codici, targhe, date: in mono, a sinistra */
  mono?: boolean;
  className?: string;
  /** link dell'intestazione e verso attuale (`null` se non è la colonna ordinata) */
  sort?: { href: string; dir: SortDir | null };
};

const thClass =
  "sticky top-[var(--sticky-top,0px)] z-[1] h-10 border-b border-line-strong bg-surface px-3 text-left align-middle text-12 font-medium whitespace-nowrap text-fg-secondary";
const tdClass =
  "h-10 border-b border-line px-3 align-middle group-last:border-b-0 group-hover:bg-hover";

function frameProps(maxHeight: string | undefined, caption: string, className?: string) {
  return maxHeight
    ? {
        // un riquadro che scorre si raggiunge da tastiera per scorrerlo
        role: "region",
        "aria-label": caption,
        tabIndex: 0,
        style: { maxHeight, "--sticky-top": "0px" } as CSSProperties,
        className: cx("overflow-auto rounded-md border border-line bg-surface", className),
      }
    : {
        className: cx(
          "overflow-x-auto rounded-md border border-line bg-surface md:overflow-clip",
          className,
        ),
      };
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  maxHeight,
  className,
}: {
  /** cosa contiene la tabella: lo legge il lettore di schermo */
  caption: string;
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  /** cosa mostrare al posto della tabella se non ci sono righe (di solito un EmptyState) */
  empty?: ReactNode;
  /** altezza massima: la tabella scorre dentro il riquadro */
  maxHeight?: string;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div {...frameProps(maxHeight, caption, className)}>
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
                className={cx(thClass, c.numeric && "text-right", c.className)}
              >
                {c.sort ? (
                  <Link
                    href={c.sort.href}
                    className={cx(
                      "inline-flex items-center gap-1 rounded-sm hover:text-fg",
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
            <tr key={rowKey(row)} className="group">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    tdClass,
                    c.numeric && "text-right font-mono text-13 tabular",
                    c.mono && "font-mono text-13",
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
      <div
        aria-hidden="true"
        className="overflow-x-auto rounded-md border border-line bg-surface md:overflow-clip"
      >
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={cx(thClass, c.numeric && "text-right")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r} className="group">
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
