/**
 * La shell dell'app: barra laterale, barra in alto, contenuto. Componente
 * server; le parti che vivono nel browser sono in `shell-client.tsx`.
 *
 * - Da `md` in su: barra laterale di 240 px (64 ridotta, stato nel cookie)
 *   e barra in alto di 56 px con l'associazione e il menu utente.
 * - Sotto `md`: la barra in alto ha il pulsante che apre le sezioni in un
 *   pannello a sinistra; l'associazione sta nel pannello e nel menu utente.
 * - La barra in alto è fissa: la colonna del contenuto definisce
 *   `--sticky-top` con la sua altezza (la tabella dati la toglie dalla sua),
 *   e globals.css riserva la stessa altezza quando il browser porta in vista
 *   un elemento (focus, salto al contenuto).
 * - Senza JavaScript: il menu utente funziona (è un <details>), le sezioni
 *   al telefono diventano una riga di link sotto la barra, e i pulsanti che
 *   da soli non farebbero niente (`data-solo-js`) spariscono.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { IconCross } from "./icons";
import { MobileNav, Sidebar, UserMenu } from "./shell-client";
import type { NavItem, SidebarState } from "./shell-logic";

function Mark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent text-on-accent"
    >
      <IconCross />
    </span>
  );
}

/**
 * Il marchio: il segno e la scritta FLEETCARE in Barlow Condensed. Con
 * `hideWordmarkWhenNarrow` la scritta sparisce quando lo spazio manca (telefono
 * stretto o testo ingrandito: la soglia è in rem, quindi segue il testo).
 */
function Brand({ hideWordmarkWhenNarrow = false }: { hideWordmarkWhenNarrow?: boolean }) {
  return (
    <Link href="/mezzi" className="flex min-w-0 items-center gap-2.5 rounded-sm">
      <Mark />
      <span
        className={
          hideWordmarkWhenNarrow
            ? "title-display hidden text-20 leading-none min-[22rem]:inline"
            : "title-display text-20 leading-none"
        }
      >
        FleetCare
      </span>
      {hideWordmarkWhenNarrow && <span className="sr-only min-[22rem]:hidden">FleetCare</span>}
    </Link>
  );
}

function BrandCompact() {
  return (
    <Link href="/mezzi" className="flex size-11 items-center justify-center rounded-sm">
      <Mark />
      <span className="sr-only">FleetCare</span>
    </Link>
  );
}

export function AppShell({
  items,
  sidebar,
  tenantName,
  userName,
  roleLabel,
  logout,
  children,
}: {
  items: NavItem[];
  sidebar: SidebarState;
  tenantName: string;
  userName: string;
  roleLabel: string;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className="touch flex min-h-dvh">
      <noscript>
        <style>{"[data-solo-js]{display:none!important}"}</style>
      </noscript>
      <a
        href="#contenuto"
        className="sr-only z-50 rounded-sm bg-raised px-3 py-2 text-14 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>
      <Sidebar
        items={items}
        initial={sidebar}
        brand={{ full: <Brand />, compact: <BrandCompact /> }}
      />
      <div className="flex min-w-0 flex-1 flex-col [--sticky-top:3.5rem]">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:px-6">
          <MobileNav items={items} tenantName={tenantName} brand={<Brand />} />
          <div className="min-w-0 md:hidden">
            <Brand hideWordmarkWhenNarrow />
          </div>
          <p className="hidden min-w-0 truncate text-14 font-medium md:block">{tenantName}</p>
          <div className="ml-auto min-w-0">
            <UserMenu name={userName} role={roleLabel} tenantName={tenantName} logout={logout} />
          </div>
        </header>
        <noscript>
          <nav
            aria-label="Sezioni"
            className="flex flex-wrap gap-1 border-b border-line bg-surface px-3 py-2 md:hidden"
          >
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-sm px-3 py-2 text-14 text-fg-secondary hover:bg-hover hover:text-fg"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </noscript>
        <main
          id="contenuto"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 outline-none md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** I moduli stanno in 960 px al massimo; liste e tabelle usano tutta la larghezza. */
export function FormWidth({ children }: { children: ReactNode }) {
  return <div className="max-w-[60rem]">{children}</div>;
}
