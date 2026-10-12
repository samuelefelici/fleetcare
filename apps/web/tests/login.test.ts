/**
 * La login: i messaggi sotto i campi e il messaggio generico sopra il
 * pulsante. I controlli restano quelli del browser (`required`,
 * `type="email"`); qui si prova solo cosa si legge.
 */
import { describe, expect, it } from "vitest";
import { fieldMessage, loginError } from "@/app/login/validazione";

const ok = { valid: true, valueMissing: false, typeMismatch: false };
const missing = { valid: false, valueMissing: true, typeMismatch: false };
const mismatch = { valid: false, valueMissing: false, typeMismatch: true };

describe("fieldMessage", () => {
  it("niente messaggio per un campo valido", () => {
    expect(fieldMessage("email", ok)).toBeNull();
  });

  it("un messaggio per ogni campo vuoto", () => {
    expect(fieldMessage("email", missing)).toBe("Scrivi l'email.");
    expect(fieldMessage("password", missing)).toBe("Scrivi la password.");
    expect(fieldMessage("tenant", missing)).toBe("Scegli l'associazione.");
  });

  it("un'email scritta male lo dice", () => {
    expect(fieldMessage("email", mismatch)).toMatch(/Non sembra un'email/);
  });
});

describe("loginError", () => {
  it("nessun errore, nessun messaggio", () => {
    expect(loginError(undefined)).toBeNull();
    expect(loginError("")).toBeNull();
  });

  it("utenza disattivata o credenziali sbagliate", () => {
    expect(loginError("disattivata")).toMatch(/disattivata/);
    expect(loginError("1")).toBe("Email o password non giuste. Riprova.");
  });
});
