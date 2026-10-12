/**
 * La logica della shell: la voce attiva, lo stato della barra laterale nel
 * cookie, le iniziali del menu utente.
 */
import { describe, expect, it } from "vitest";
import {
  ariaCurrent,
  initials,
  isActive,
  parseSidebar,
  sidebarCookie,
} from "@/components/shell-logic";

describe("isActive", () => {
  it("la voce è attiva sulla sua pagina e su quelle sotto", () => {
    expect(isActive("/mezzi", "/mezzi")).toBe(true);
    expect(isActive("/mezzi/2b0e…/modifica", "/mezzi")).toBe(true);
    expect(isActive("/mezzi/nuovo", "/mezzi")).toBe(true);
  });

  it("non per un indirizzo che comincia allo stesso modo, né per un'altra sezione", () => {
    expect(isActive("/mezzicolo", "/mezzi")).toBe(false);
    expect(isActive("/scadenze", "/mezzi")).toBe(false);
    expect(isActive("/", "/mezzi")).toBe(false);
  });
});

describe("barra laterale", () => {
  it("estesa a meno che il cookie dica «ridotta»", () => {
    expect(parseSidebar("ridotta")).toBe("ridotta");
    expect(parseSidebar("estesa")).toBe("estesa");
    expect(parseSidebar(undefined)).toBe("estesa");
    expect(parseSidebar("qualcosa")).toBe("estesa");
  });

  it("il cookie vale un anno su tutto il sito, Secure solo in https", () => {
    expect(sidebarCookie("ridotta", false)).toBe(
      "fleetcare_barra=ridotta; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    expect(sidebarCookie("estesa", true)).toMatch(/; Secure$/);
  });
});

describe("initials", () => {
  it("prima lettera del primo e dell'ultimo nome", () => {
    expect(initials("Mario Rossi")).toBe("MR");
    expect(initials("Anna Maria de Angelis")).toBe("AA");
    expect(initials("direzione")).toBe("D");
    expect(initials("  ")).toBe("?");
  });
});

describe("ariaCurrent", () => {
  it("«page» sulla pagina della voce, «true» sotto, niente altrove", () => {
    expect(ariaCurrent("/mezzi", "/mezzi")).toBe("page");
    expect(ariaCurrent("/mezzi/nuovo", "/mezzi")).toBe("true");
    expect(ariaCurrent("/scadenze", "/mezzi")).toBeUndefined();
  });
});
