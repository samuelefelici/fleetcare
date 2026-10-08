"use client";

/**
 * Le parti della shell che hanno bisogno del browser: la barra laterale
 * (lo stato ridotta/estesa e il cookie che lo ricorda), le voci di menu
 * (quale è attiva dipende dall'indirizzo), il pannello delle sezioni al
 * telefono e il menu utente.
 *
 * Niente Popover API: Safari la ha solo dalla 17, e l'app deve andare sugli
 * iPhone fermi a iOS 16. Il pannello delle sezioni è un <dialog> modale
 * (Safari 15.4), il menu utente un <details> (si apre anche senza
 * JavaScript); qui si aggiungono la chiusura con Esc, col clic fuori, quando
 * il focus esce e quando si cambia pagina.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconCalendar,
  IconChevronDown,
  IconClose,
  IconCollapse,
  IconKit,
  IconLogout,
  IconMenu,
  IconPeople,
  IconUser,
  IconVehicle,
} from "./icons";
import {
  ariaCurrent,
  initials,
  isActive,
  sidebarCookie,
  type NavIcon,
  type NavItem,
  type SidebarState,
} from "./shell-logic";
import { cx } from "./ui";

const ICONS: Record<NavIcon, (p: { className?: string }) => ReactNode> = {
  mezzi: IconVehicle,
  scadenze: IconCalendar,
  attrezzature: IconKit,
  persone: IconPeople,
};

const isHttps = () => location.protocol === "https:";

/** Esegue `fn` quando l'indirizzo cambia davvero (non al primo montaggio). */
function useOnNavigate(fn: () => void) {
  const pathname = usePathname();
  const prev = useRef(pathname);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;
    latest.current();
  }, [pathname]);
}

/**
 * Le voci delle sezioni. Quella attiva ha la barra arancio di 2 px a
 * sinistra (coi colori forzati di Windows, nel colore del testo), il testo
 * primario e `aria-current`: "page" sulla sua pagina, "true" sulle pagine
 * sotto. Ridotte mostrano solo l'icona; il nome resta per il lettore di
 * schermo e compare accanto all'icona con hover o focus.
 */
export function NavLinks({ items, collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={ariaCurrent(pathname, item.href)}
              className={cx(
                "group/voce relative flex h-10 items-center gap-3 rounded-sm text-14 font-medium hover:bg-hover hover:text-fg",
                collapsed ? "justify-center px-0" : "px-3",
                active
                  ? "text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-accent forced-colors:before:bg-[CanvasText]"
                  : "text-fg-secondary",
              )}
            >
              <Icon className="size-5" />
              <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
              {collapsed && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-full z-30 ml-2 -translate-y-1/2 rounded-sm border border-line-strong bg-raised px-2 py-1 text-13 whitespace-nowrap text-fg opacity-0 shadow-xl transition-opacity duration-150 ease-standard group-hover/voce:opacity-100 group-focus-visible/voce:opacity-100 motion-reduce:transition-none"
                >
                  {item.label}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * La barra laterale da `md` in su: 240 px, o 64 px ridotta. Lo stato
 * iniziale arriva dal cookie letto dal layout; il pulsante in fondo lo
 * cambia subito e lo riscrive nel cookie. Nessuna animazione di larghezza:
 * il movimento nell'app è solo di opacità e posizione.
 */
export function Sidebar({
  items,
  initial,
  brand,
}: {
  items: NavItem[];
  initial: SidebarState;
  /** il marchio in alto, esteso e ridotto */
  brand: { full: ReactNode; compact: ReactNode };
}) {
  const [state, setState] = useState<SidebarState>(initial);
  const collapsed = state === "ridotta";

  // Safari tiene al massimo 7 giorni un cookie scritto da document.cookie:
  // si rinnova a ogni visita, così dura finché la si usa
  useEffect(() => {
    if (initial === "ridotta") document.cookie = sidebarCookie("ridotta", isHttps());
  }, [initial]);

  function toggle() {
    const next: SidebarState = collapsed ? "estesa" : "ridotta";
    setState(next);
    document.cookie = sidebarCookie(next, isHttps());
  }

  const label = collapsed ? "Espandi la barra laterale" : "Riduci la barra laterale";
  return (
    <aside
      aria-label="Barra laterale"
      data-state={state}
      className={cx(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cx(
          "flex h-14 shrink-0 items-center border-b border-line",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        {collapsed ? brand.compact : brand.full}
      </div>
      {/* ridotta, le voci sono poche e stanno in altezza: niente scorrimento, così i nomi possono uscire di lato */}
      <nav
        aria-label="Sezioni"
        className={cx("flex-1 py-3", collapsed ? "px-2" : "overflow-y-auto px-3")}
      >
        <NavLinks items={items} collapsed={collapsed} />
      </nav>
      <div className={cx("border-t border-line py-3", collapsed ? "px-2" : "px-3")}>
        <button
          type="button"
          onClick={toggle}
          data-solo-js
          className={cx(
            "flex h-10 w-full items-center gap-3 rounded-sm text-13 text-fg-secondary hover:bg-hover hover:text-fg",
            collapsed ? "justify-center" : "px-3",
          )}
        >
          <IconCollapse className={cx("size-4", collapsed && "rotate-180")} />
          <span className={collapsed ? "sr-only" : undefined}>{label}</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * Le sezioni al telefono: un pannello a sinistra in un <dialog> modale. Il
 * browser rende inerte la pagina (il focus non esce, un tocco sul fondo non
 * attiva quello che c'è sotto) e lo chiude con Esc; qui si aggiungono la ×,
 * il tocco sul fondo, la chiusura quando si cambia pagina o quando la
 * finestra diventa larga quanto basta per la barra laterale.
 */
export function MobileNav({
  items,
  tenantName,
  brand,
}: {
  items: NavItem[];
  tenantName: string;
  brand: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pressedOnBackdrop = useRef(false);
  const close = () => {
    if (ref.current?.open) ref.current.close();
  };

  useOnNavigate(close);
  useEffect(() => {
    const wide = matchMedia("(min-width: 48rem)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches && ref.current?.open) ref.current.close();
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        data-solo-js
        onClick={() => {
          const d = ref.current;
          if (!d) return;
          d.showModal();
          // il focus parte dalla sezione in cui si è, o dalla prima
          (
            d.querySelector<HTMLElement>("nav a[aria-current]") ??
            d.querySelector<HTMLElement>("nav a")
          )?.focus();
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-sm text-fg-secondary hover:bg-hover hover:text-fg md:hidden"
      >
        <IconMenu className="size-5" />
        <span className="sr-only">Sezioni</span>
      </button>
      <dialog
        ref={ref}
        aria-label="Menu delle sezioni"
        onClose={() => opener.current?.focus()}
        onMouseDown={(e) => {
          pressedOnBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (pressedOnBackdrop.current && e.target === e.currentTarget) close();
          pressedOnBackdrop.current = false;
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-0 border-r border-line-strong bg-surface p-0 text-fg shadow-2xl transition-[opacity,translate,display,overlay] transition-discrete duration-150 ease-standard backdrop:bg-canvas/80 not-open:-translate-x-4 not-open:opacity-0 motion-reduce:transition-none starting:open:-translate-x-4 starting:open:opacity-0"
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-line pr-1.5 pl-4">
          {brand}
          <button
            type="button"
            onClick={close}
            className="flex size-11 shrink-0 items-center justify-center rounded-sm text-fg-secondary hover:bg-hover hover:text-fg"
          >
            <IconClose className="size-5" />
            <span className="sr-only">Chiudi le sezioni</span>
          </button>
        </div>
        <p className="px-4 pt-4 text-12 text-fg-secondary">{tenantName}</p>
        <nav aria-label="Sezioni" className="p-3">
          <NavLinks items={items} />
        </nav>
      </dialog>
    </>
  );
}

/**
 * Il menu utente: un <details>, che si apre e si chiude anche senza
 * JavaScript. Con JavaScript si chiude anche con Esc (il focus torna al
 * pulsante), col clic fuori, quando il focus esce dal menu e quando si
 * cambia pagina. Dentro: nome, ruolo e associazione, il profilo, l'uscita.
 */
export function UserMenu({
  name,
  role,
  tenantName,
  logout,
}: {
  name: string;
  role: string;
  tenantName: string;
  logout: () => Promise<void>;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = (focusSummary = false) => {
    const d = ref.current;
    if (!d?.open) return;
    d.open = false;
    if (focusSummary) d.querySelector("summary")?.focus();
  };

  useOnNavigate(() => close());
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const d = ref.current;
      if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <details
      ref={ref}
      className="relative min-w-0"
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current?.open) {
          e.preventDefault();
          close(true);
        }
      }}
      onBlur={(e) => {
        // il focus va fuori dal menu (Tab dopo «Esci», Maiusc+Tab dal pulsante)
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <summary
        aria-label={`${name}, ${role}: menu utente`}
        className="flex h-10 min-w-0 cursor-pointer list-none items-center gap-2 rounded-sm px-1.5 pointer-coarse:h-11 text-fg-secondary hover:bg-hover hover:text-fg sm:px-2 [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-line bg-raised text-12 font-semibold text-fg"
        >
          {initials(name)}
        </span>
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-48 truncate text-13 font-medium text-fg">{name}</span>
          <span className="block truncate text-12">{role}</span>
        </span>
        <IconChevronDown className="hidden size-4 shrink-0 sm:block" />
      </summary>
      <div className="absolute top-full right-0 z-30 mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] rounded-md border border-line-strong bg-raised text-fg shadow-2xl transition-[opacity,translate] duration-150 ease-standard motion-reduce:transition-none starting:-translate-y-1 starting:opacity-0">
        <div className="border-b border-line px-4 py-3">
          <p className="truncate text-14 font-medium">{name}</p>
          <p className="text-12 text-fg-secondary">{role}</p>
          <p className="mt-1 truncate text-12 text-fg-secondary">{tenantName}</p>
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
    </details>
  );
}
