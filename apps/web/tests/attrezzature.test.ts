/**
 * La logica pura della sezione attrezzature: gli schemi dei moduli (vuoto
 * → null, date, importi), la posizione letta da una <select>, i filtri
 * dell'elenco, i testi dello storico.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  NO_PLACE,
  equipmentEditSchema,
  equipmentSchema,
  formValues,
  hasAnyFilter,
  isCalendarDay,
  isUuid,
  listHref,
  moveSchema,
  movementText,
  parseEuro,
  parseListFilters,
  parsePlace,
  placeLabel,
  placeValue,
  samePlace,
  statusChangeSchema,
} from "@/app/(app)/attrezzature/parse";

const TYPE = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const VEHICLE = "0a1b2c3d-4e5f-4a6b-8c7d-9e8f7a6b5c4d";
const SITE = "11111111-2222-4333-8444-555555555555";
const ITEM = "99999999-8888-4777-8666-555555555555";

/** Il modulo minimo di un'attrezzatura, come arriva dal browser. */
const BASE = {
  equipmentTypeId: TYPE,
  ownership: "owned",
};

/** Il primo problema, nella forma «campo: messaggio» di zodMessage. */
function issue(result: z.SafeParseReturnType<unknown, unknown>): string {
  if (result.success) return "";
  const first = result.error.issues[0]!;
  return `${first.path.join(".")}: ${first.message}`;
}

describe("formValues", () => {
  it("legge i campi di testo e ignora i file", () => {
    const fd = new FormData();
    fd.append("inventoryCode", "DAE-01");
    fd.append("foto", new File(["x"], "x.txt"));
    expect(formValues(fd)).toEqual({ inventoryCode: "DAE-01" });
  });
});

describe("isUuid e isCalendarDay", () => {
  it("riconosce un uuid, anche maiuscolo", () => {
    expect(isUuid(TYPE)).toBe(true);
    expect(isUuid(TYPE.toUpperCase())).toBe(true);
    expect(isUuid("non-un-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });

  it("accetta solo giorni veri del calendario", () => {
    expect(isCalendarDay("2026-02-28")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("26-01-01")).toBe(false);
    expect(isCalendarDay("1800-01-01")).toBe(false);
  });
});

describe("parseEuro", () => {
  it("capisce la notazione italiana e quella con il punto", () => {
    expect(parseEuro("1.234,50")).toBe("1234.50");
    expect(parseEuro("1234,5")).toBe("1234.50");
    expect(parseEuro("1234.50")).toBe("1234.50");
    expect(parseEuro("1234")).toBe("1234.00");
    expect(parseEuro(" 12 € ")).toBe("12.00");
  });

  it("vuoto è null, non un numero è undefined", () => {
    expect(parseEuro("")).toBeNull();
    expect(parseEuro("   ")).toBeNull();
    expect(parseEuro("abc")).toBeUndefined();
    expect(parseEuro("-5")).toBeUndefined();
    expect(parseEuro("1.234.567")).toBeUndefined();
    expect(parseEuro("1,2345")).toBeUndefined();
    expect(parseEuro("99999999999")).toBeUndefined();
  });
});

describe("la posizione", () => {
  it("si scrive e si rilegge dal valore della <option>", () => {
    expect(placeValue({ vehicleId: VEHICLE, siteId: null })).toBe(`vehicle:${VEHICLE}`);
    expect(placeValue({ vehicleId: null, siteId: SITE })).toBe(`site:${SITE}`);
    expect(placeValue(NO_PLACE)).toBe("");
    expect(parsePlace(`vehicle:${VEHICLE}`)).toEqual({ vehicleId: VEHICLE, siteId: null });
    expect(parsePlace(`site:${SITE}`)).toEqual({ vehicleId: null, siteId: SITE });
  });

  it("vuoto è «nessuna collocazione», il resto non è una posizione", () => {
    expect(parsePlace("")).toEqual(NO_PLACE);
    expect(parsePlace("  ")).toEqual(NO_PLACE);
    expect(parsePlace("vehicle:abc")).toBeNull();
    expect(parsePlace(`garage:${SITE}`)).toBeNull();
    expect(parsePlace(VEHICLE)).toBeNull();
  });

  it("gli uuid si confrontano in minuscolo", () => {
    expect(parsePlace(`vehicle:${VEHICLE.toUpperCase()}`)).toEqual({
      vehicleId: VEHICLE,
      siteId: null,
    });
    expect(samePlace({ vehicleId: VEHICLE, siteId: null }, parsePlace(`vehicle:${VEHICLE}`)!)).toBe(
      true,
    );
    expect(samePlace({ vehicleId: VEHICLE, siteId: null }, NO_PLACE)).toBe(false);
  });
});

describe("equipmentSchema", () => {
  it("il modulo minimo passa, con i default", () => {
    const r = equipmentSchema.safeParse(BASE);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.equipmentTypeId).toBe(TYPE);
    expect(r.data.status).toBe("in_use");
    expect(r.data.ownership).toBe("owned");
    expect(r.data.inventoryCode).toBeNull();
    expect(r.data.purchaseValueEur).toBeNull();
    expect(r.data.manufacturedOn).toBeNull();
    expect(r.data.place).toEqual(NO_PLACE);
  });

  it("i campi extra del browser (le chiavi $ACTION di Next) si ignorano", () => {
    expect(equipmentSchema.safeParse({ ...BASE, $ACTION_ID_x: "y" }).success).toBe(true);
  });

  it("il tipo è obbligatorio e deve essere un uuid", () => {
    expect(issue(equipmentSchema.safeParse({ ...BASE, equipmentTypeId: undefined }))).toBe(
      "equipmentTypeId: obbligatorio",
    );
    expect(issue(equipmentSchema.safeParse({ ...BASE, equipmentTypeId: "" }))).toBe(
      "equipmentTypeId: obbligatorio",
    );
    expect(issue(equipmentSchema.safeParse({ ...BASE, equipmentTypeId: "dae" }))).toBe(
      "equipmentTypeId: tipo non valido",
    );
  });

  it("proprietà e stato accettano solo i valori dell'enum", () => {
    expect(issue(equipmentSchema.safeParse({ ...BASE, ownership: "" }))).toBe(
      "ownership: obbligatorio",
    );
    expect(issue(equipmentSchema.safeParse({ ...BASE, ownership: "stolen" }))).toBe(
      "ownership: valore non valido",
    );
    expect(issue(equipmentSchema.safeParse({ ...BASE, status: "broken" }))).toBe(
      "status: valore non valido",
    );
    const r = equipmentSchema.safeParse({ ...BASE, status: "", ownership: "loan" });
    expect(r.success && r.data.status).toBe("in_use");
  });

  it("i testi si ripuliscono e i vuoti diventano null", () => {
    const r = equipmentSchema.safeParse({
      ...BASE,
      inventoryCode: "  DAE-01 ",
      manufacturer: "   ",
      serialNumber: "SN123",
      positionNote: "",
      notes: "zaino rosso",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.inventoryCode).toBe("DAE-01");
    expect(r.data.manufacturer).toBeNull();
    expect(r.data.serialNumber).toBe("SN123");
    expect(r.data.positionNote).toBeNull();
    expect(r.data.notes).toBe("zaino rosso");
  });

  it("i testi troppo lunghi non passano", () => {
    expect(issue(equipmentSchema.safeParse({ ...BASE, inventoryCode: "x".repeat(51) }))).toBe(
      "inventoryCode: al massimo 50 caratteri",
    );
  });

  it("le date devono essere giorni veri", () => {
    expect(issue(equipmentSchema.safeParse({ ...BASE, manufacturedOn: "2026-02-30" }))).toBe(
      "manufacturedOn: data non valida",
    );
    expect(issue(equipmentSchema.safeParse({ ...BASE, warrantyUntil: "domani" }))).toBe(
      "warrantyUntil: data non valida",
    );
    const r = equipmentSchema.safeParse({ ...BASE, purchaseDate: "2025-03-15" });
    expect(r.success && r.data.purchaseDate).toBe("2025-03-15");
  });

  it("il valore d'acquisto diventa la stringa della colonna numeric", () => {
    const r = equipmentSchema.safeParse({ ...BASE, purchaseValueEur: "1.250,00" });
    expect(r.success && r.data.purchaseValueEur).toBe("1250.00");
    expect(issue(equipmentSchema.safeParse({ ...BASE, purchaseValueEur: "mille" }))).toBe(
      "purchaseValueEur: deve essere un importo",
    );
  });

  it("la posizione iniziale: un mezzo, una sede o niente", () => {
    const v = equipmentSchema.safeParse({ ...BASE, place: `vehicle:${VEHICLE}` });
    expect(v.success && v.data.place).toEqual({ vehicleId: VEHICLE, siteId: null });
    const s = equipmentSchema.safeParse({ ...BASE, place: `site:${SITE}` });
    expect(s.success && s.data.place).toEqual({ vehicleId: null, siteId: SITE });
    expect(issue(equipmentSchema.safeParse({ ...BASE, place: "vehicle:12" }))).toBe(
      "place: scegli un mezzo o una sede",
    );
  });
});

describe("equipmentEditSchema", () => {
  it("vuole l'id e non ha la posizione", () => {
    expect(issue(equipmentEditSchema.safeParse(BASE))).toBe("id: obbligatorio");
    const r = equipmentEditSchema.safeParse({ ...BASE, id: ITEM, place: `vehicle:${VEHICLE}` });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.id).toBe(ITEM);
    expect("place" in r.data).toBe(false);
  });
});

describe("moveSchema e statusChangeSchema", () => {
  it("«Sposta» legge la destinazione e il motivo", () => {
    const r = moveSchema.safeParse({
      equipmentId: ITEM,
      place: `site:${SITE}`,
      reason: " revisione ",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.place).toEqual({ vehicleId: null, siteId: SITE });
    expect(r.data.reason).toBe("revisione");
    const none = moveSchema.safeParse({ equipmentId: ITEM, place: "" });
    expect(none.success && none.data.place).toEqual(NO_PLACE);
    expect(none.success && none.data.reason).toBeNull();
    expect(issue(moveSchema.safeParse({ equipmentId: "x", place: "" }))).toBe(
      "equipmentId: attrezzatura non valido",
    );
  });

  it("il cambio di stato accetta solo gli stati dell'enum", () => {
    expect(statusChangeSchema.safeParse({ equipmentId: ITEM, status: "in_repair" }).success).toBe(
      true,
    );
    expect(issue(statusChangeSchema.safeParse({ equipmentId: ITEM, status: "rotta" }))).toBe(
      "status: valore non valido",
    );
  });
});

describe("i filtri dell'elenco", () => {
  it("si leggono dall'indirizzo e un valore sbagliato si ignora", () => {
    expect(parseListFilters({})).toEqual({
      vehicleId: null,
      siteId: null,
      typeId: null,
      status: null,
      showAll: false,
    });
    expect(
      parseListFilters({ mezzo: VEHICLE.toUpperCase(), stato: "in_stock", mostra: "tutti" }),
    ).toEqual({
      vehicleId: VEHICLE,
      siteId: null,
      typeId: null,
      status: "in_stock",
      showAll: true,
    });
    expect(parseListFilters({ sede: "12", stato: "rotta", mostra: "si" })).toEqual({
      vehicleId: null,
      siteId: null,
      typeId: null,
      status: null,
      showAll: false,
    });
    expect(parseListFilters({ tipo: [TYPE, SITE] }).typeId).toBe(TYPE);
  });

  it("hasAnyFilter e listHref", () => {
    const none = parseListFilters({});
    expect(hasAnyFilter(none)).toBe(false);
    expect(listHref(none)).toBe("/attrezzature");
    const f = parseListFilters({ mezzo: VEHICLE, stato: "in_use" });
    expect(hasAnyFilter(f)).toBe(true);
    expect(listHref(f)).toBe(`/attrezzature?mezzo=${VEHICLE}&stato=in_use`);
    expect(listHref(f, { showAll: true, status: null })).toBe(
      `/attrezzature?mezzo=${VEHICLE}&mostra=tutti`,
    );
    expect(listHref(parseListFilters({ sede: SITE, tipo: TYPE }))).toBe(
      `/attrezzature?sede=${SITE}&tipo=${TYPE}`,
    );
  });
});

describe("i testi", () => {
  it("placeLabel", () => {
    expect(placeLabel({ vehicleCode: "12", siteName: null })).toBe("Mezzo 12");
    expect(placeLabel({ vehicleCode: null, siteName: "Sede principale" })).toBe("Sede principale");
    expect(placeLabel({ vehicleCode: null, siteName: null })).toBe("Nessuna collocazione");
  });

  it("movementText", () => {
    expect(
      movementText({
        fromVehicleCode: "12",
        fromSiteName: null,
        toVehicleCode: null,
        toSiteName: "Sede principale",
      }),
    ).toBe("Dal mezzo 12 alla sede «Sede principale»");
    expect(
      movementText({
        fromVehicleCode: null,
        fromSiteName: "Sede principale",
        toVehicleCode: "5",
        toSiteName: null,
      }),
    ).toBe("Dalla sede «Sede principale» al mezzo 5");
    expect(
      movementText({
        fromVehicleCode: null,
        fromSiteName: null,
        toVehicleCode: "5",
        toSiteName: null,
      }),
    ).toBe("Messa a bordo del mezzo 5");
    expect(
      movementText({
        fromVehicleCode: null,
        fromSiteName: null,
        toVehicleCode: null,
        toSiteName: "Magazzino",
      }),
    ).toBe("Messa in sede «Magazzino»");
    expect(
      movementText({
        fromVehicleCode: "12",
        fromSiteName: null,
        toVehicleCode: null,
        toSiteName: null,
      }),
    ).toBe("Tolta dal mezzo 12");
    expect(
      movementText({
        fromVehicleCode: null,
        fromSiteName: null,
        toVehicleCode: null,
        toSiteName: null,
      }),
    ).toBe("Spostamento senza partenza né arrivo");
  });
});
