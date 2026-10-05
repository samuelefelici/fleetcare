import { describe, expect, it } from "vitest";
import {
  accountEmailSchema,
  editPersonSchema,
  formValues,
  newPersonSchema,
  ownPasswordSchema,
  planAccount,
  ROLES,
  selfChangeProblem,
  tempPasswordSchema,
  uniqueViolationMessage,
  unwrapDbError,
} from "@/app/(app)/persone/campi";

const ID = "6f1a2b3c-4d5e-4f60-8a71-9b8c7d6e5f40";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e8f7a6b5c4d";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe("newPersonSchema (persona nuova)", () => {
  it("ripulisce i campi: vuoti → null, spunta assente → falso", () => {
    const parsed = newPersonSchema.safeParse(
      formValues(form({ nome: "  Mario Rossi ", ruolo: "crew", tessera: "  ", email: "" })),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({
      nome: "Mario Rossi",
      ruolo: "crew",
      tessera: null,
      autista: false,
      telefono: null,
      email: null,
      password: null,
    });
  });

  it("la spunta «on» è vera e l'email si tiene com'è scritta (la unicità la fa il database)", () => {
    const parsed = newPersonSchema.safeParse(
      formValues(
        form({
          nome: "Anna",
          ruolo: "fleet_manager",
          autista: "on",
          email: " Anna.Bianchi@CG.it ",
        }),
      ),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.autista).toBe(true);
    expect(parsed.data.email).toBe("Anna.Bianchi@CG.it");
  });

  it("rifiuta nome vuoto, ruolo sconosciuto ed email malformata con frasi in italiano", () => {
    const noName = newPersonSchema.safeParse(formValues(form({ nome: " ", ruolo: "crew" })));
    expect(noName.success).toBe(false);
    if (!noName.success) {
      expect(noName.error.issues[0]?.path).toEqual(["nome"]);
      expect(noName.error.issues[0]?.message).toBe("Scrivi nome e cognome");
    }
    const badRole = newPersonSchema.safeParse(formValues(form({ nome: "A", ruolo: "boss" })));
    expect(badRole.success).toBe(false);
    if (!badRole.success) expect(badRole.error.issues[0]?.message).toBe("Scegli un ruolo");
    const badEmail = newPersonSchema.safeParse(
      formValues(form({ nome: "A", ruolo: "crew", email: "non-una-email" })),
    );
    expect(badEmail.success).toBe(false);
    if (!badEmail.success) {
      expect(badEmail.error.issues[0]?.message).toBe("Non è un indirizzo email");
    }
  });

  it("i ruoli sono quelli dell'enum del database", () => {
    expect(ROLES).toEqual(["crew", "fleet_manager", "equipment_manager", "admin_finance", "admin"]);
  });
});

describe("editPersonSchema e gli schemi dell'utenza", () => {
  it("vuole un id uuid", () => {
    const parsed = editPersonSchema.safeParse(
      formValues(form({ id: "1", nome: "A", ruolo: "crew" })),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe("Identificativo non valido");
  });

  it("l'email dell'utenza è obbligatoria e ripulita", () => {
    const ok = accountEmailSchema.safeParse(formValues(form({ id: ID, email: " a@b.it " })));
    expect(ok.success && ok.data.email).toBe("a@b.it");
    const empty = accountEmailSchema.safeParse(formValues(form({ id: ID, email: "" })));
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0]?.message).toBe("Scrivi l'email");
  });

  it("la password iniziale non si ritaglia: al login gli spazi contano", () => {
    const r = newPersonSchema.safeParse(
      formValues(form({ nome: "Prova Spazi", ruolo: "crew", password: "  Prova-Spazi-2026  " })),
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.password).toBe("  Prova-Spazi-2026  ");
  });

  it("la password temporanea segue le regole di @fleetcare/db", () => {
    const short = tempPasswordSchema.safeParse(formValues(form({ id: ID, password: "corta" })));
    expect(short.success).toBe(false);
    if (!short.success) {
      expect(short.error.issues[0]?.message).toBe("La password deve avere almeno 10 caratteri");
    }
    expect(tempPasswordSchema.safeParse({ id: ID, password: "abbastanza-lunga" }).success).toBe(
      true,
    );
  });
});

describe("ownPasswordSchema (cambio della propria password)", () => {
  it("le due password nuove devono coincidere", () => {
    const parsed = ownPasswordSchema.safeParse(
      formValues(
        form({ attuale: "vecchia-password", nuova: "nuova-password-1", conferma: "altra" }),
      ),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["conferma"]);
      expect(parsed.error.issues[0]?.message).toBe("Le due password non coincidono");
    }
  });

  it("la password attuale è obbligatoria, la nuova deve essere lunga abbastanza", () => {
    const noCurrent = ownPasswordSchema.safeParse(
      formValues(form({ attuale: "", nuova: "nuova-password-1", conferma: "nuova-password-1" })),
    );
    expect(noCurrent.success).toBe(false);
    if (!noCurrent.success) {
      expect(noCurrent.error.issues[0]?.message).toBe("Scrivi la password attuale");
    }
    const short = ownPasswordSchema.safeParse(
      formValues(form({ attuale: "vecchia", nuova: "breve", conferma: "breve" })),
    );
    expect(short.success).toBe(false);
    const ok = ownPasswordSchema.safeParse(
      formValues(
        form({ attuale: "vecchia", nuova: "nuova-password-1", conferma: "nuova-password-1" }),
      ),
    );
    expect(ok.success).toBe(true);
  });
});

describe("planAccount (l'utenza che nasce con la persona)", () => {
  const hash = (p: string) => `hash(${p})`;

  it("senza email non nasce nessuna utenza", () => {
    expect(planAccount({ email: null, telefono: null, password: null }, hash)).toEqual({
      kind: "none",
    });
  });

  it("telefono o password senza email: lo dice, invece di perderli", () => {
    expect(planAccount({ email: null, telefono: "333", password: null }, hash)).toMatch(/email/);
    expect(planAccount({ email: null, telefono: null, password: "una-password-ok" }, hash)).toMatch(
      /email/,
    );
  });

  it("con l'email crea l'utenza, con o senza password", () => {
    expect(planAccount({ email: "a@b.it", telefono: "333", password: null }, hash)).toEqual({
      kind: "create",
      email: "a@b.it",
      phone: "333",
      passwordHash: null,
    });
    expect(
      planAccount({ email: "a@b.it", telefono: null, password: "una-password-ok" }, hash),
    ).toEqual({
      kind: "create",
      email: "a@b.it",
      phone: null,
      passwordHash: "hash(una-password-ok)",
    });
  });

  it("una password troppo corta è rifiutata con la frase di passwordProblem", () => {
    expect(planAccount({ email: "a@b.it", telefono: null, password: "corta" }, hash)).toBe(
      "La password deve avere almeno 10 caratteri",
    );
  });

  it("senza funzione di hash usa quella vera (scrypt)", () => {
    const plan = planAccount({ email: "a@b.it", telefono: null, password: "una-password-ok" });
    expect(typeof plan === "object" && plan.kind === "create" && plan.passwordHash).toMatch(
      /^scrypt\$/,
    );
  });
});

describe("selfChangeProblem (cosa la direzione non fa a sé stessa)", () => {
  const ctx = { userId: ID, role: "admin" };

  it("su un'altra persona non c'è limite", () => {
    expect(selfChangeProblem(ctx, { id: OTHER, role: "crew", active: false })).toBeNull();
  });

  it("non ci si disattiva", () => {
    expect(selfChangeProblem(ctx, { id: ID, active: false })).toMatch(/disattivare te stesso/);
    expect(selfChangeProblem(ctx, { id: ID, active: true })).toBeNull();
  });

  it("non ci si cambia il ruolo; lo stesso ruolo passa", () => {
    expect(selfChangeProblem(ctx, { id: ID, role: "crew" })).toMatch(/cambiare il tuo ruolo/);
    expect(selfChangeProblem(ctx, { id: ID, role: "admin" })).toBeNull();
  });
});

describe("gli errori del database", () => {
  it("unwrapDbError toglie l'involucro di drizzle e lascia stare il resto", () => {
    const pg = Object.assign(new Error("duplicate key"), { code: "23505" });
    const wrapped = new Error("Failed query", { cause: pg });
    expect(unwrapDbError(wrapped)).toBe(pg);
    expect(unwrapDbError(pg)).toBe(pg);
    const plain = new Error("altro");
    expect(unwrapDbError(plain)).toBe(plain);
    expect(unwrapDbError("stringa")).toBe("stringa");
  });

  it("uniqueViolationMessage: l'email doppia e la tessera doppia hanno la loro frase", () => {
    expect(
      uniqueViolationMessage({
        code: "23505",
        constraint_name: "profile_accounts_tenant_email_uq",
      }),
    ).toBe("Email già usata da un'altra persona dell'associazione");
    expect(
      uniqueViolationMessage({ code: "23505", constraint_name: "profiles_tenant_badge_uq" }),
    ).toBe("Numero di tessera già assegnato a un'altra persona");
    expect(uniqueViolationMessage({ code: "23505", constraint_name: "altro_uq" })).toBe(
      "Esiste già una persona con questi dati",
    );
  });

  it("uniqueViolationMessage: un errore diverso non è suo", () => {
    expect(uniqueViolationMessage({ code: "42501" })).toBeNull();
    expect(uniqueViolationMessage(new Error("x"))).toBeNull();
    expect(uniqueViolationMessage(null)).toBeNull();
  });
});
