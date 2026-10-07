/**
 * /dev/ui: ogni componente in ogni stato, per guardarli tutti insieme e
 * provarli da tastiera. Esiste solo con `next dev`: in produzione risponde
 * 404. Hover, focus e pressione sono forzati con `data-force` (vedi
 * globals.css); accanto ci sono gli stessi componenti veri, da provare.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/button";
import { ConfirmPanel } from "@/components/confirm-dialog";
import { DataTable, DataTableSkeleton, type Column, type SortDir } from "@/components/data-table";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  describedBy,
  Details,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Panel,
  Select,
  Semaphore,
  Skeleton,
  StatusBadge,
  Textarea,
  type Status,
} from "@/components/ui";
import { ConfirmDemo, LoadingDemo, ToastDemo } from "./demo";

export const metadata: Metadata = { title: "Componenti", robots: { index: false } };

type SearchParams = Record<string, string | string[] | undefined>;

const SECTIONS = [
  ["colori", "Colori"],
  ["tipografia", "Tipografia"],
  ["pulsanti", "Pulsanti"],
  ["campi", "Campi"],
  ["stati", "Stati e avvisi"],
  ["contenitori", "Pannelli e card"],
  ["tabella", "Tabella dati"],
  ["vuoto", "Vuoto, caricamento, errore"],
  ["toast", "Toast"],
  ["conferma", "Dialog di conferma"],
] as const;

export default async function DevUiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const sp = await searchParams;

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 py-8 md:px-8">
      <header className="space-y-2">
        <p className="hud-label">FleetCare · solo sviluppo</p>
        <h1 className="text-32 font-semibold">Componenti</h1>
        <p className="max-w-prose text-fg-secondary">
          Ogni componente in ogni stato. Hover, focus e pressione sono forzati per poterli vedere
          senza mouse; i componenti veri si provano da tastiera con Tab, Invio, Spazio ed Esc. Al
          tocco campi e pulsanti passano da 36 a 44 px.
        </p>
        <nav aria-label="Sezioni della pagina" className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-13 text-signal-fg underline">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="colori" title="Colori">
        <Swatches />
      </Section>

      <Section id="tipografia" title="Tipografia">
        <Typography />
      </Section>

      <Section id="pulsanti" title="Pulsanti">
        <ButtonStates />
        <div className="flex flex-wrap items-center gap-3">
          <LoadingDemo />
          <ButtonLink href="#pulsanti" variant="secondary">
            Link come pulsante
          </ButtonLink>
        </div>
        <p className="text-13 text-fg-secondary">
          Un solo primario arancio per vista. Il distruttivo apre sempre un dialog di conferma (vedi
          l&apos;ultima sezione); qui è mostrato da solo.
        </p>
      </Section>

      <Section id="campi" title="Campi">
        <FieldStates />
        <Card className="max-w-md space-y-4 p-4">
          <Field label="Targa" htmlFor="vero-targa" hint="Senza spazi: FX123AB" required>
            <Input
              id="vero-targa"
              name="targa"
              required
              placeholder="FX123AB"
              aria-describedby={describedBy("vero-targa", { hint: true })}
            />
          </Field>
          <Field label="Sede" htmlFor="vero-sede">
            <Select id="vero-sede" name="sede" defaultValue="camerano">
              <option value="camerano">Camerano</option>
              <option value="sirolo">Sirolo</option>
            </Select>
          </Field>
          <label className="flex items-center gap-3 text-14">
            <input type="checkbox" name="autista" defaultChecked className="size-5" />È abilitato
            alla guida dei mezzi
          </label>
        </Card>
      </Section>

      <Section id="stati" title="Stati e avvisi">
        <StatusSamples />
      </Section>

      <Section id="contenitori" title="Pannelli e card">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Dati del mezzo" actions={<Button variant="ghost">Modifica</Button>}>
            <Details
              items={[
                ["Sigla", <span className="font-mono">AMB-03</span>],
                ["Targa", <span className="font-mono">FX123AB</span>],
                ["Modello", "Fiat Ducato 2.3"],
                ["Km", <span className="font-mono tabular">182.340</span>],
              ]}
            />
          </Panel>
          <Card className="space-y-2 p-4">
            <h3 className="font-semibold">Card</h3>
            <p className="text-fg-secondary">
              Tono rialzato e bordo di 1 px, raggio 6 px, nessuna ombra. Le ombre restano a popover
              e dialog.
            </p>
          </Card>
        </div>
      </Section>

      <Section id="tabella" title="Tabella dati">
        <p className="text-13 text-fg-secondary">
          Righe di 40 px, numeri a destra in mono. L&apos;ordinamento sta nell&apos;URL: clic su
          «Sigla» o «Km». Qui la tabella scorre nel suo riquadro, per mostrare l&apos;intestazione
          che resta in vista.
        </p>
        <VehicleTable sp={sp} />
        <h3 className="hud-label pt-2">Senza righe</h3>
        <DataTable
          caption="Mezzi dismessi"
          columns={vehicleColumns(sortOf(sp))}
          rows={[]}
          rowKey={(v) => v.id}
          empty={<EmptyState>Nessun mezzo dismesso.</EmptyState>}
        />
      </Section>

      <Section id="vuoto" title="Vuoto, caricamento, errore">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState>Nessuna scadenza «in scadenza».</EmptyState>
          <EmptyState
            title="Nessun mezzo"
            action={<ButtonLink href="#vuoto">Aggiungi il primo mezzo</ButtonLink>}
          >
            I mezzi dell&apos;associazione compaiono qui, con le loro scadenze.
          </EmptyState>
          <ErrorState
            action={
              <ButtonLink href="/dev/ui#vuoto" variant="secondary">
                Riprova
              </ButtonLink>
            }
          >
            Il database non ha risposto. I dati non sono andati persi.
          </ErrorState>
          <Loading className="space-y-2 rounded-md border border-line bg-surface p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </Loading>
        </div>
        <DataTableSkeleton
          columns={[
            { header: "Sigla" },
            { header: "Targa" },
            { header: "Stato" },
            { header: "Km", numeric: true },
          ]}
          rows={4}
        />
      </Section>

      <Section id="toast" title="Toast">
        <p className="text-13 text-fg-secondary">
          In alto al centro. Lo stato lo dicono icona e testo; il toast si chiude da solo
          (l&apos;errore dopo 8 s) o con la ×. Alt+T porta il focus sulle notifiche.
        </p>
        <ToastDemo />
      </Section>

      <Section id="conferma" title="Dialog di conferma">
        <div className="max-w-[30rem] rounded-lg border border-line-strong bg-raised shadow-2xl">
          <ConfirmPanel
            title="Dismettere il mezzo AMB-03 · FX123AB?"
            description="Esce dalla flotta; resta in archivio con letture e scadenze."
            confirmLabel="Dismetti il mezzo"
          />
        </div>
        <p className="text-13 text-fg-secondary">
          Il dialog vero: il focus parte da «Annulla», resta dentro finché è aperto, Esc o un clic
          sullo sfondo annullano, alla chiusura torna al pulsante.
        </p>
        <ConfirmDemo />
      </Section>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titolo`} className="scroll-mt-6 space-y-4">
      <h2 id={`${id}-titolo`} className="border-b border-line pb-2 text-20 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Una griglia stati × varianti: la prima colonna dice la riga, l'intestazione lo stato. */
function StateGrid({
  states,
  rows,
}: {
  states: string[];
  rows: Array<{ label: string; cells: ReactNode[] }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-x-3 border-spacing-y-2">
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              Variante
            </th>
            {states.map((s) => (
              <th key={s} scope="col" className="hud-label text-left">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="pr-2 text-left text-13 font-medium whitespace-nowrap">
                {r.label}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} className="align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SWATCHES: Array<[string, string]> = [
  ["--bg-base", "fondo dell'app"],
  ["--bg-surface", "pannelli"],
  ["--bg-raised", "card, campi"],
  ["--bg-hover", "hover"],
  ["--border", "bordi"],
  ["--border-strong", "bordi dei controlli"],
  ["--text-primary", "testo"],
  ["--text-secondary", "testo secondario"],
  ["--text-muted", "testo tenue"],
  ["--accent", "azione primaria"],
  ["--signal", "link, focus, selezione"],
  ["--status-ok", "ok"],
  ["--status-warn", "warn"],
  ["--status-critical", "critical"],
  ["--status-idle", "idle"],
];

function Swatches() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {SWATCHES.map(([name, use]) => (
        <li key={name} className="rounded-md border border-line bg-surface p-2">
          <span
            aria-hidden="true"
            className="block h-10 rounded-sm border border-line"
            style={{ background: `var(${name})` }}
          />
          <span className="mt-2 block font-mono text-12">{name}</span>
          <span className="block text-12 text-fg-secondary">{use}</span>
        </li>
      ))}
    </ul>
  );
}

const SCALE = [11, 12, 13, 14, 16, 20, 24, 32, 48] as const;
const SCALE_CLASS: Record<(typeof SCALE)[number], string> = {
  11: "text-11",
  12: "text-12",
  13: "text-13",
  14: "text-14",
  16: "text-16",
  20: "text-20",
  24: "text-24",
  32: "text-32",
  48: "text-48",
};

function Typography() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ul className="space-y-1">
        {SCALE.map((px) => (
          <li key={px} className="flex items-baseline gap-4">
            <span className="w-10 shrink-0 font-mono text-12 text-fg-secondary tabular">{px}</span>
            <span className={`${SCALE_CLASS[px]} truncate`}>Parco mezzi</span>
          </li>
        ))}
      </ul>
      <div className="space-y-4">
        <p className="title-display text-32">AMB-03 Ducato</p>
        <p>IBM Plex Sans 400 per il testo, 500 per le etichette, 600 per i titoli.</p>
        <p className="font-mono text-13 tabular">FX123AB · 182.340 km · 12/11/2026 · € 1.250,00</p>
        <p className="hud-label">Etichetta mono 11 px</p>
        <p className="text-24 text-fg-muted">Testo tenue, solo da 24 px</p>
        <p className="text-13 text-fg-secondary">
          Sotto i 24 px il tenue va solo su testo disabilitato o decorativo: fa 4,09:1 sul fondo.
        </p>
      </div>
    </div>
  );
}

const BUTTON_STATES = ["Predefinito", "Hover", "Focus", "Premuto", "Disabilitato", "Caricamento"];
const BUTTON_ROWS = [
  ["Primario", "primary", "Salva"],
  ["Secondario", "secondary", "Annulla"],
  ["Ghost", "ghost", "Indietro"],
  ["Distruttivo", "destructive", "Dismetti"],
] as const;

function ButtonStates() {
  return (
    <StateGrid
      states={BUTTON_STATES}
      rows={BUTTON_ROWS.map(([label, variant, text]) => ({
        label,
        cells: [
          <Button key="d" variant={variant}>
            {text}
          </Button>,
          <Button key="h" variant={variant} data-force="hover">
            {text}
          </Button>,
          <Button key="f" variant={variant} data-force="focus">
            {text}
          </Button>,
          <Button key="a" variant={variant} data-force="hover active">
            {text}
          </Button>,
          <Button key="x" variant={variant} disabled>
            {text}
          </Button>,
          <Button key="l" variant={variant} loading>
            {text}
          </Button>,
        ],
      }))}
    />
  );
}

const FIELD_STATES = ["Predefinito", "Hover", "Focus", "Disabilitato", "Errore"];

function FieldStates() {
  const cell = (kind: "testo" | "select" | "area", state: number) => {
    const id = `campo-${kind}-${state}`;
    const force = state === 1 ? "hover" : state === 2 ? "focus" : undefined;
    const disabled = state === 3;
    const error =
      state !== 4
        ? undefined
        : kind === "testo"
          ? "Targa già presente"
          : kind === "select"
            ? "Scegli la sede del mezzo"
            : "Al massimo 500 caratteri";
    const common = {
      id,
      name: id,
      disabled,
      invalid: Boolean(error),
      "data-force": force,
      "aria-describedby": describedBy(id, { error }),
    };
    return (
      <div className="w-44">
        <Field
          label={kind === "testo" ? "Targa" : kind === "select" ? "Sede" : "Note"}
          htmlFor={id}
          error={error}
        >
          {kind === "testo" ? (
            <Input {...common} defaultValue="FX123AB" />
          ) : kind === "select" ? (
            <Select {...common} defaultValue="camerano">
              <option value="camerano">Camerano</option>
              <option value="sirolo">Sirolo</option>
            </Select>
          ) : (
            <Textarea {...common} rows={2} defaultValue="Tagliando a 4.200 km" />
          )}
        </Field>
      </div>
    );
  };
  return (
    <StateGrid
      states={FIELD_STATES}
      rows={(["testo", "select", "area"] as const).map((kind) => ({
        label: kind === "testo" ? "Testo" : kind === "select" ? "Select" : "Textarea",
        cells: FIELD_STATES.map((_, i) => cell(kind, i)),
      }))}
    />
  );
}

const STATUS_SAMPLES: Array<[Status, string]> = [
  ["ok", "Operativo"],
  ["warn", "In scadenza"],
  ["critical", "Scaduta"],
  ["idle", "Dismesso"],
];

function StatusSamples() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {STATUS_SAMPLES.map(([s, label]) => (
          <StatusBadge key={s} status={s}>
            {label}
          </StatusBadge>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Semaphore color="green">In regola</Semaphore>
        <Semaphore color="yellow">In scadenza</Semaphore>
        <Semaphore color="red">Scaduta</Semaphore>
        <Semaphore color="grey">Archiviata</Semaphore>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge>elettromedicale</Badge>
        <Badge>tu</Badge>
        <span className="text-12 text-fg-secondary">
          Etichette senza icona, per ciò che non è uno stato.
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Alert tone="critical">Targa già presente in questa associazione.</Alert>
        <Alert tone="warn" title="Revisione in scadenza">
          Entro il 12/11/2026: prenota l&apos;officina.
        </Alert>
        <Alert tone="ok">Lettura dei km registrata.</Alert>
        <Alert tone="info">Le scadenze nascono dal catalogo dell&apos;associazione.</Alert>
      </div>
    </div>
  );
}

type Vehicle = {
  id: string;
  code: string;
  plate: string;
  model: string;
  status: Status;
  statusLabel: string;
  km: number;
  next: string;
};

const VEHICLES: Vehicle[] = [
  ["AMB-01", "FX101AA", "Fiat Ducato", "ok", "Operativo", 182340, "12/11/2026"],
  ["AMB-02", "FX202BB", "Fiat Ducato", "warn", "In manutenzione", 241905, "03/10/2026"],
  ["AMB-03", "FX123AB", "Volkswagen Crafter", "ok", "Operativo", 98712, "28/02/2027"],
  ["AMB-04", "GA404CD", "Renault Master", "critical", "Fermo", 310066, "15/09/2026"],
  ["AMB-05", "GA505EE", "Fiat Ducato", "ok", "Riserva", 45210, "01/06/2027"],
  ["AUT-01", "EZ606FF", "Fiat Doblò", "ok", "Operativo", 120480, "19/01/2027"],
  ["AUT-02", "EZ707GG", "Dacia Duster", "idle", "Dismesso", 287300, "—"],
  ["AMB-06", "GB808HH", "Mercedes Sprinter", "ok", "Operativo", 12345, "30/04/2028"],
  ["AMB-07", "GB909JJ", "Fiat Ducato", "warn", "In manutenzione", 199870, "08/12/2026"],
  ["PMA-01", "DY010KK", "Iveco Daily", "ok", "Operativo", 76001, "22/03/2027"],
].map(([code, plate, model, status, statusLabel, km, next]) => ({
  id: code as string,
  code: code as string,
  plate: plate as string,
  model: model as string,
  status: status as Status,
  statusLabel: statusLabel as string,
  km: km as number,
  next: next as string,
}));

type Sort = { key: "code" | "km"; dir: SortDir };

function sortOf(sp: SearchParams): Sort {
  const key = sp.ordina === "km" ? "km" : "code";
  const dir = sp.verso === "desc" ? "desc" : "asc";
  return { key, dir };
}

function sortHref(sort: Sort, key: Sort["key"]): string {
  const dir: SortDir = sort.key === key && sort.dir === "asc" ? "desc" : "asc";
  return `/dev/ui?ordina=${key}&verso=${dir}#tabella`;
}

function vehicleColumns(sort: Sort): Array<Column<Vehicle>> {
  return [
    {
      key: "code",
      header: "Sigla",
      mono: true,
      cell: (v) => v.code,
      sort: { href: sortHref(sort, "code"), dir: sort.key === "code" ? sort.dir : null },
    },
    { key: "plate", header: "Targa", mono: true, cell: (v) => v.plate },
    { key: "model", header: "Modello", cell: (v) => v.model, className: "min-w-40" },
    {
      key: "status",
      header: "Stato",
      cell: (v) => <StatusBadge status={v.status}>{v.statusLabel}</StatusBadge>,
    },
    {
      key: "km",
      header: "Km",
      numeric: true,
      cell: (v) => v.km.toLocaleString("it-IT"),
      sort: { href: sortHref(sort, "km"), dir: sort.key === "km" ? sort.dir : null },
    },
    { key: "next", header: "Prossima scadenza", mono: true, cell: (v) => v.next },
  ];
}

function VehicleTable({ sp }: { sp: SearchParams }) {
  const sort = sortOf(sp);
  const rows = [...VEHICLES].sort((a, b) => {
    const d = sort.key === "km" ? a.km - b.km : a.code.localeCompare(b.code, "it");
    return sort.dir === "asc" ? d : -d;
  });
  return (
    <DataTable
      caption="Mezzi dell'associazione"
      columns={vehicleColumns(sort)}
      rows={rows}
      rowKey={(v) => v.id}
      maxHeight="16rem"
    />
  );
}
