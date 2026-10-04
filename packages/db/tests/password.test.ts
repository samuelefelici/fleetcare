import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "../src/ops/password";

describe("password delle utenze", () => {
  it("si verifica solo con la password giusta", () => {
    const stored = hashPassword("Camerano-2026!");
    expect(stored.startsWith("scrypt$N=16384,r=8,p=1$")).toBe(true);
    expect(verifyPassword("Camerano-2026!", stored)).toBe(true);
    expect(verifyPassword("Camerano-2026", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("due hash della stessa password sono diversi (sale casuale) e validi entrambi", () => {
    const a = hashPassword("Camerano-2026!");
    const b = hashPassword("Camerano-2026!");
    expect(a).not.toBe(b);
    expect(verifyPassword("Camerano-2026!", a) && verifyPassword("Camerano-2026!", b)).toBe(true);
  });

  it("un hash assente o malformato non entra mai, e non lancia", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "hash-c001")).toBe(false);
    expect(verifyPassword("x", "scrypt$N=16384,r=8,p=1$non-base64!$zzz")).toBe(false);
  });

  it("i parametri si leggono dal valore: un hash con N diverso resta valido", () => {
    const stored = hashPassword("Camerano-2026!").replace("N=16384", "N=16384");
    expect(verifyPassword("Camerano-2026!", stored)).toBe(true);
  });

  it("password troppo corte si rifiutano prima di salvarle", () => {
    expect(passwordProblem("corta")).toMatch(/almeno 10/);
    expect(passwordProblem("abbastanza lunga")).toBeNull();
    expect(() => hashPassword("corta")).toThrow(/almeno 10/);
  });
});
