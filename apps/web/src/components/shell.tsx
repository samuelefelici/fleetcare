/**
 * La shell dell'app: barra laterale, barra in alto, contenuto. Componente
 * server; le parti che vivono nel browser sono in `shell-client.tsx`.
 *
 * - Da `md` in su: barra laterale di 240 px (64 ridotta, stato nel cookie)
 *   e barra in alto di 56 px con l'associazione e il menu utente.
 * - Sotto `md`: la barra in alto ha il pulsante che apre le sezioni in un
 *   pannello a sinistra.
 * - I due menu a comparsa sono `popover` HTML: funzionano senza JavaScript,
 *   si chiudono con Esc o toccando fuori.
 * - La barra in alto è fissa: la colonna del contenuto definisce
 *   `--sticky-top` con la sua altezza, che la tabella dati toglie dalla sua.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronDown, IconCross, IconLogout, IconMenu, IconUser } from "./icons";
import { ClosePopoversOnNavigate, NavLinks, Sidebar } from "./shell-client";
import { initials, type NavItem, type SidebarState } from "./shell-logic";

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

/** Il marchio: il segno e la scritta FLEETCARE in Barlow Condensed. */
function Brand() {
  return (
    <Link href="/mezzi" className="flex items-center gap-2.5 rounded-sm">
      <Mark />
      <span className="title-display text-20 leading-none">FleetCare</span>
    </Link>
  );
}

function BrandCompact() {
  return (
    <Link href="/mezzi" className="rounded-sm" title="FleetCare">
      <Mark />
      <span className="sr-only">FleetCare</span>
    </Link>
  );
}

const menuButton =
  "flex items-center gap-2 rounded-sm text-fg-secondary hover:bg-hover hover:text-fg";
const popoverPanel =
  "border border-line-strong bg-raised p-0 text-fg shadow-2xl transition-[opacity,translate,display,overlay] transition-discrete duration-150 ease-standard motion-reduce:transition-none";

/** Il menu utente: nome e ruolo, il profilo, l'uscita. */
function UserMenu({
  name,
  role,
  logout,
}: {
  name: string;
  role: string;
  logout: () => Promise<void>;
}) {
  return (
    <>
      <button
        type="button"
        popoverTarget="menu-utente"
        aria-label={`${name}, ${role}: menu utente`}
        className={`${menuButton} h-10 px-1.5 sm:px-2`}
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-sm border border-line bg-raised text-12 font-semibold text-fg"
        >
          {initials(name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-48 truncate text-13 font-medium text-fg">{name}</span>
          <span className="block text-12">{role}</span>
        </span>
        <IconChevronDown className="hidden size-4 sm:block" />
      </button>
      <div
        id="menu-utente"
        popover="auto"
        className={`${popoverPanel} fixed inset-auto top-[3.75rem] right-3 m-0 w-64 rounded-md not-open:-translate-y-1 not-open:opacity-0 starting:open:-translate-y-1 starting:open:opacity-0`}
      >
        <div className="border-b border-line px-4 py-3">
          <p className="truncate text-14 font-medium">{name}</p>
          <p className="text-12 text-fg-secondary">{role}</p>
        </div>
        <ul className="p-1.5">
          <li>
            <Link
              href="/profilo"
              className="flex h-10 items-center gap-3 rounded-sm px-2.5 text-14 hover:bg-hover"
            >
              <IconUser className="size-4 text-fg-secondary" />
              Il mio profilo
            </Link>
          </li>
          <li>
            <form action={logout}>
              <button
                type="submit"
                className="flex h-10 w-full items-center gap-3 rounded-sm px-2.5 text-left text-14 hover:bg-hover"
              >
                <IconLogout className="size-4 text-fg-secondary" />
                Esci
              </button>
            </form>
          </li>
        </ul>
      </div>
    </>
  );
}

/** Le sezioni al telefono: un pannello a sinistra, sopra la pagina. */
function MobileNav({ items, tenantName }: { items: NavItem[]; tenantName: string }) {
  return (
    <>
      <button
        type="button"
        popoverTarget="menu-sezioni"
        className={`${menuButton} size-11 justify-center md:hidden`}
      >
        <IconMenu className="size-5" />
        <span className="sr-only">Sezioni</span>
      </button>
      <div
        id="menu-sezioni"
        popover="auto"
        className={`${popoverPanel} fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-72 max-w-[85vw] border-y-0 border-l-0 backdrop:bg-canvas/80 not-open:-translate-x-4 not-open:opacity-0 starting:open:-translate-x-4 starting:open:opacity-0`}
      >
        <div className="flex h-14 items-center border-b border-line px-4">
          <Brand />
        </div>
        <p className="px-4 pt-4 text-12 text-fg-secondary">{tenantName}</p>
        <nav aria-label="Sezioni" className="p-3">
          <NavLinks items={items} />
        </nav>
      </div>
    </>
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
      <a
        href="#contenuto"
        className="sr-only z-50 rounded-sm bg-raised px-3 py-2 text-14 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>
      <ClosePopoversOnNavigate />
      <Sidebar
        items={items}
        initial={sidebar}
        brand={{ full: <Brand />, compact: <BrandCompact /> }}
      />
      <div className="flex min-w-0 flex-1 flex-col [--sticky-top:3.5rem]">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-6">
          <MobileNav items={items} tenantName={tenantName} />
          <div className="md:hidden">
            <Brand />
          </div>
          <p className="hidden min-w-0 truncate text-14 font-medium md:block">{tenantName}</p>
          <div className="ml-auto">
            <UserMenu name={userName} role={roleLabel} logout={logout} />
          </div>
        </header>
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
