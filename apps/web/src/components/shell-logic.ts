/**
 * La logica della shell che si prova senza DOM (tests/shell.test.ts): quale
 * voce è attiva e come si legge lo stato della barra laterale dal cookie.
 */

/** Le icone delle sezioni: la shell le sceglie per nome (un componente non passa dal server al client). */
export type NavIcon = "mezzi" | "scadenze" | "attrezzature" | "persone";

export type NavItem = { href: string; label: string; icon: NavIcon };

/**
 * La voce è attiva sulla sua pagina e su quelle sotto: «Mezzi» resta accesa
 * nella scheda di un mezzo (/mezzi/…) e nei suoi moduli. Il confine è la
 * barra: /mezzi non accende /mezzicolo.
 */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `aria-current` di una voce: "page" sulla sua pagina, "true" su una pagina
 * sotto (la scheda di un mezzo è dentro «Mezzi», ma non è la pagina «Mezzi»).
 */
export function ariaCurrent(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  return isActive(pathname, href) ? "true" : undefined;
}

/**
 * Lo stato della barra laterale sta in un cookie, che il layout legge sul
 * server: così la pagina arriva già con la barra giusta e niente si sposta
 * dopo l'idratazione (con localStorage la barra si aprirebbe e poi si
 * richiuderebbe).
 */
export const SIDEBAR_COOKIE = "fleetcare_barra";
export type SidebarState = "estesa" | "ridotta";

export function parseSidebar(value: string | undefined): SidebarState {
  return value === "ridotta" ? "ridotta" : "estesa";
}

/** La riga `document.cookie` che ricorda lo stato per un anno, su tutto il sito. */
export function sidebarCookie(state: SidebarState, secure: boolean): string {
  return `${SIDEBAR_COOKIE}=${state}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Le iniziali per il menu utente: «Mario Rossi» → «MR», «Direzione CG» → «DC». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toLocaleUpperCase("it-IT");
}
