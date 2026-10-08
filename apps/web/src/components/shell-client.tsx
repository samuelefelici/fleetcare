"use client";

/**
 * Le parti della shell che hanno bisogno del browser: la barra laterale
 * (lo stato ridotta/estesa e il cookie che lo ricorda), le voci di menu
 * (quale è attiva dipende dall'indirizzo) e la chiusura dei menu a comparsa
 * quando si cambia pagina.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { IconCalendar, IconCollapse, IconKit, IconPeople, IconVehicle } from "./icons";
import {
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

/**
 * Le voci delle sezioni. Quella attiva ha la barra arancio di 2 px a
 * sinistra, il testo primario e `aria-current="page"`. Ridotte, mostrano
 * solo l'icona: il nome resta per il lettore di schermo e come suggerimento.
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
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cx(
                "relative flex h-10 items-center gap-3 rounded-sm text-14 font-medium hover:bg-hover hover:text-fg",
                collapsed ? "justify-center px-0" : "px-3",
                active
                  ? "text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-accent"
                  : "text-fg-secondary",
              )}
            >
              <Icon className="size-5" />
              <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
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

  function toggle() {
    const next: SidebarState = collapsed ? "estesa" : "ridotta";
    setState(next);
    document.cookie = sidebarCookie(next, location.protocol === "https:");
  }

  return (
    <aside
      id="barra-laterale"
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
      <nav
        aria-label="Sezioni"
        className={cx("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}
      >
        <NavLinks items={items} collapsed={collapsed} />
      </nav>
      <div className={cx("border-t border-line py-3", collapsed ? "px-2" : "px-3")}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="barra-laterale"
          title={collapsed ? "Espandi la barra laterale" : undefined}
          className={cx(
            "flex h-10 w-full items-center gap-3 rounded-sm text-13 text-fg-secondary hover:bg-hover hover:text-fg",
            collapsed ? "justify-center" : "px-3",
          )}
        >
          <IconCollapse className={cx("size-4", collapsed && "rotate-180")} />
          <span className={collapsed ? "sr-only" : undefined}>
            {collapsed ? "Espandi la barra laterale" : "Riduci la barra"}
          </span>
        </button>
      </div>
    </aside>
  );
}

/**
 * I menu a comparsa (sezioni al telefono, menu utente) sono `popover` HTML:
 * si aprono e si chiudono anche prima che arrivi il JavaScript. Ma un link
 * seguito dal router di Next non ricarica la pagina, e il menu resterebbe
 * aperto sulla pagina nuova: qui il menu si chiude appena si sceglie un link
 * al suo interno, e per sicurezza a ogni cambio di indirizzo.
 */
export function ClosePopoversOnNavigate() {
  const pathname = usePathname();
  useEffect(() => {
    closeOpenPopovers();
  }, [pathname]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const popover = link?.closest<HTMLElement>("[popover]");
      if (popover) closeOpenPopovers(popover);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

function closeOpenPopovers(only?: HTMLElement) {
  try {
    const open = only ? [only] : document.querySelectorAll<HTMLElement>("[popover]:popover-open");
    open.forEach((p) => {
      if (p.matches(":popover-open")) p.hidePopover();
    });
  } catch {
    // un browser senza popover non ha niente da chiudere
  }
}
