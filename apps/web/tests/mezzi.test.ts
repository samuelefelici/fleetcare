/**
 * La logica pura della sezione mezzi: gli schemi dei moduli (vuoto → null,
 * caselle, numeri, date), la targa normalizzata, le ore di Roma.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  decommissionSchema,
  formValues,
  isCalendarDay,
  normalizePlate,
  nowRomeLocal,
  odometerReadingSchema,
  romeToDate,
  statusChangeSchema,
  vehicleEditSchema,
  vehicleSchema,
} from "@/app/(app)/mezzi/parse";

const UUID = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";

/** Il modulo minimo di un mezzo, come arriva dal browser. */
const BASE = {
  internalCode: "05",
  plate: "ab 123 cd",
  category: "emergency_ambulance",
  fuelType: "diesel",
  ownership: "owned",
};

/** Il primo problema, nella forma «campo: messaggio» di zodMessage. */
function issue(result: z.SafeParseReturnType<unknown, unknown>): string {
  if (result.success) return "";
  const first = result.error.issues[0]!;
  return `${first.path.join(".")}: ${first.message}`;
}

describe("normalizePlate", () => {
  it("maiuscolo e senza spazi", () => {
    expect(normalizePlate("fx 123 ab")).toBe("FX123AB");
    expect(normalizePlate(" AB123CD ")).toBe("AB123CD");
  });
});

describe("formValues", () => {
  it("legge i campi di testo e ignora i file", () => {
    const fd = new FormData();
    fd.append("internalCode", "05");
    fd.append("foto", new File(["x"], "x.txt"));
    expect(formValues(fd)).toEqual({ internalCode: "05" });
  });
});

describe("vehicleSchema", () => {
  it("il modulo minimo passa, con i default", () => {
    const r = vehicleSchema.safeParse(BASE);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.plate).toBe("AB123CD");
    expect(r.data.internalCode).toBe("05");
    expect(r.data.callSign).toBeNull();
    expect(r.data.en1789Type).toBeNull();
    expect(r.data.hasLift).toBe(false);
    expect(r.data.bolloExempt).toBe(false);
    expect(r.data.initialOdometerKm).toBe(0);
    expect(r.data.siteId).toBeNull();
  });

  it("i campi extra del browser (le chiavi $ACTION di Next) si ignorano", () => {
    expect(vehicleSchema.safeParse({ ...BASE, $ACTION_ID_x: "y" }).success).toBe(true);
  });

  it("numero interno e targa sono obbligatori e devono avere una lettera o una cifra", () => {
    expect(issue(vehicleSchema.safeParse({ ...BASE, internalCode: undefined }))).toBe(
      "internalCode: obbligatorio",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, internalCode: "   " }))).toBe(
      "internalCode: obbligatorio",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, plate: "- -" }))).toBe(
      "plate: serve almeno una lettera o una cifra",
    );
  });

  it("categoria: vuota è obbligatoria, sconosciuta non è valida", () => {
    expect(issue(vehicleSchema.safeParse({ ...BASE, category: "" }))).toBe(
      "category: obbligatorio",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, category: "camion" }))).toBe(
      "category: valore non valido",
    );
  });

  it("i numeri: vuoto → null, interi non negativi, con limiti", () => {
    const ok = vehicleSchema.safeParse({ ...BASE, seats: "", grossWeightKg: "3500" });
    expect(ok.success && ok.data.seats).toBeNull();
    expect(ok.success && ok.data.grossWeightKg).toBe(3500);
    expect(issue(vehicleSchema.safeParse({ ...BASE, seats: "abc" }))).toBe(
      "seats: deve essere un numero",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, seats: "4.5" }))).toBe(
      "seats: deve essere un numero intero",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, seats: "-1" }))).toBe(
      "seats: non può essere sotto 0",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, stretcherPositions: "12" }))).toBe(
      "stretcherPositions: non può superare 9",
    );
  });

  it("le date: una data vera o niente", () => {
    expect(issue(vehicleSchema.safeParse({ ...BASE, registrationDate: "2026-02-30" }))).toBe(
      "registrationDate: data non valida",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, registrationDate: "30/01/2026" }))).toBe(
      "registrationDate: data non valida",
    );
    const ok = vehicleSchema.safeParse({ ...BASE, registrationDate: "2024-02-29" });
    expect(ok.success && ok.data.registrationDate).toBe("2024-02-29");
  });

  it("le caselle: «on» è vero, assente è falso", () => {
    const r = vehicleSchema.safeParse({ ...BASE, hasLift: "on", bolloExempt: "on" });
    expect(r.success && r.data.hasLift).toBe(true);
    expect(r.success && r.data.bolloExempt).toBe(true);
    expect(r.success && r.data.hasPriorityLights).toBe(false);
  });

  it("i km d'ingresso: vuoto vale 0", () => {
    const empty = vehicleSchema.safeParse({ ...BASE, initialOdometerKm: "" });
    expect(empty.success && empty.data.initialOdometerKm).toBe(0);
    const set = vehicleSchema.safeParse({ ...BASE, initialOdometerKm: "120000" });
    expect(set.success && set.data.initialOdometerKm).toBe(120000);
    expect(issue(vehicleSchema.safeParse({ ...BASE, initialOdometerKm: "12 000" }))).toBe(
      "initialOdometerKm: deve essere un numero",
    );
  });

  it("sede: vuota è null, altrimenti un uuid", () => {
    const none = vehicleSchema.safeParse({ ...BASE, siteId: "" });
    expect(none.success && none.data.siteId).toBeNull();
    expect(issue(vehicleSchema.safeParse({ ...BASE, siteId: "sede-1" }))).toBe(
      "siteId: sede non valida",
    );
    const some = vehicleSchema.safeParse({ ...BASE, siteId: UUID });
    expect(some.success && some.data.siteId).toBe(UUID);
  });

  it("classe EN 1789 e matricola del distributore: facoltative", () => {
    const r = vehicleSchema.safeParse({ ...BASE, en1789Type: "B", fuelVehicleCode: "  " });
    expect(r.success && r.data.en1789Type).toBe("B");
    expect(r.success && r.data.fuelVehicleCode).toBeNull();
    expect(issue(vehicleSchema.safeParse({ ...BASE, en1789Type: "D" }))).toBe(
      "en1789Type: valore non valido",
    );
    expect(issue(vehicleSchema.safeParse({ ...BASE, fuelVehicleCode: "--" }))).toBe(
      "fuelVehicleCode: serve almeno una lettera o una cifra",
    );
  });

  it("i testi si ripuliscono dagli spazi", () => {
    const r = vehicleSchema.safeParse({ ...BASE, make: "  Fiat ", notes: " ok " });
    expect(r.success && r.data.make).toBe("Fiat");
    expect(r.success && r.data.notes).toBe("ok");
  });
});

describe("vehicleEditSchema", () => {
  it("vuole l'id del mezzo", () => {
    expect(issue(vehicleEditSchema.safeParse(BASE))).toBe("id: mezzo non indicato");
    expect(issue(vehicleEditSchema.safeParse({ ...BASE, id: "12" }))).toBe("id: mezzo non valido");
    expect(vehicleEditSchema.safeParse({ ...BASE, id: UUID }).success).toBe(true);
  });
});

describe("odometerReadingSchema", () => {
  it("km interi e l'ora letta come ora di Roma", () => {
    const r = odometerReadingSchema.safeParse({
      vehicleId: UUID,
      km: "123456",
      readAt: "2026-01-15T10:00",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.km).toBe(123456);
    expect(r.data.readAt.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("rifiuta km vuoti, decimali e date in altro formato", () => {
    expect(
      issue(
        odometerReadingSchema.safeParse({ vehicleId: UUID, km: "", readAt: "2026-01-15T10:00" }),
      ),
    ).toBe("km: obbligatorio");
    expect(
      issue(
        odometerReadingSchema.safeParse({
          vehicleId: UUID,
          km: "12.5",
          readAt: "2026-01-15T10:00",
        }),
      ),
    ).toBe("km: deve essere un numero intero");
    expect(
      issue(odometerReadingSchema.safeParse({ vehicleId: UUID, km: "10", readAt: "15/01/2026" })),
    ).toBe("readAt: data e ora non valide");
    expect(issue(odometerReadingSchema.safeParse({ km: "10", readAt: "2026-01-15T10:00" }))).toBe(
      "vehicleId: mezzo non indicato",
    );
  });
});

describe("statusChangeSchema", () => {
  it("accetta solo gli stati che si scelgono a mano", () => {
    const ok = statusChangeSchema.safeParse({ vehicleId: UUID, status: "grounded", reason: "" });
    expect(ok.success && ok.data.reason).toBeNull();
    expect(issue(statusChangeSchema.safeParse({ vehicleId: UUID, status: "decommissioned" }))).toBe(
      "status: valore non valido",
    );
  });
});

describe("decommissionSchema", () => {
  it("vuole data e motivo", () => {
    expect(
      issue(decommissionSchema.safeParse({ vehicleId: UUID, decommissionedOn: "", reason: "x" })),
    ).toBe("decommissionedOn: obbligatorio");
    expect(
      issue(
        decommissionSchema.safeParse({
          vehicleId: UUID,
          decommissionedOn: "2026-10-04",
          reason: " ",
        }),
      ),
    ).toBe("reason: obbligatorio");
    const ok = decommissionSchema.safeParse({
      vehicleId: UUID,
      decommissionedOn: "2026-10-04",
      reason: "Rottamato",
    });
    expect(ok.success).toBe(true);
  });
});

describe("date e ore di Roma", () => {
  it("isCalendarDay: date vere, fra il 1900 e il 2999", () => {
    expect(isCalendarDay("2026-02-28")).toBe(true);
    expect(isCalendarDay("2024-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-04-31")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("0026-01-01")).toBe(false);
    expect(isCalendarDay("2026-1-1")).toBe(false);
  });

  it("romeToDate: ora solare e ora legale", () => {
    expect(romeToDate("2026-01-15T10:00").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(romeToDate("2026-07-15T10:00").toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(romeToDate("2026-07-15T00:30:15").toISOString()).toBe("2026-07-14T22:30:15.000Z");
    expect(() => romeToDate("2026-07-15")).toThrow();
  });

  it("nowRomeLocal: l'istante nel formato di datetime-local, nel fuso di Roma", () => {
    expect(nowRomeLocal(new Date("2026-07-15T08:05:00Z"))).toBe("2026-07-15T10:05");
    expect(nowRomeLocal(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16T00:30");
  });
});
