import { describe, expect, it } from "vitest";
import {
  CHECKLIST_TEMPLATES,
  DEADLINE_RULES,
  DEADLINE_TYPES,
  EQUIPMENT_TYPES,
  KIT_REQUIREMENTS,
  SUPPLY_ITEMS,
} from "../src/seed/catalog";

/* Il catalogo è dati scritti a mano: questi controlli lo tengono coerente
   prima ancora che il seed tocchi un database. */

const unique = (values: string[]) => new Set(values).size === values.length;
const deadlineTypes = new Map(DEADLINE_TYPES.map((d) => [d.code, d]));
const equipmentCodes = new Set(EQUIPMENT_TYPES.map((e) => e.code));
const supplyCodes = new Set(SUPPLY_ITEMS.map((s) => s.code));

describe("catalogo iniziale", () => {
  it("codici unici", () => {
    expect(unique(DEADLINE_TYPES.map((d) => d.code))).toBe(true);
    expect(unique(EQUIPMENT_TYPES.map((e) => e.code))).toBe(true);
    expect(unique(SUPPLY_ITEMS.map((s) => s.code))).toBe(true);
    expect(unique(CHECKLIST_TEMPLATES.map((t) => t.name))).toBe(true);
  });

  it("mai mesi e giorni insieme", () => {
    for (const d of [...DEADLINE_TYPES, ...DEADLINE_RULES]) {
      expect(d.intervalMonths !== undefined && d.intervalDays !== undefined).toBe(false);
    }
  });

  it("ogni regola punta a un tipo esistente e del soggetto giusto", () => {
    for (const rule of DEADLINE_RULES) {
      const type = deadlineTypes.get(rule.deadlineType);
      expect(type, rule.deadlineType).toBeDefined();
      expect(Boolean(rule.vehicleCategory) !== Boolean(rule.equipmentType)).toBe(true);
      if (rule.vehicleCategory) expect(type?.subject).toBe("vehicle");
      if (rule.equipmentType) {
        expect(type?.subject).toBe("equipment");
        expect(equipmentCodes.has(rule.equipmentType), rule.equipmentType).toBe(true);
      }
    }
  });

  it("nessuna regola duplicata (stesso tipo per lo stesso destinatario)", () => {
    const keys = DEADLINE_RULES.map(
      (r) => `${r.deadlineType}|${r.vehicleCategory ?? r.equipmentType}`,
    );
    expect(unique(keys)).toBe(true);
  });

  it("la revisione delle ambulanze è annuale", () => {
    const rule = DEADLINE_RULES.find(
      (r) => r.deadlineType === "revisione" && r.vehicleCategory === "emergency_ambulance",
    );
    expect(rule?.intervalMonths).toBe(12);
  });

  it("dotazione e check-list citano solo attrezzature e articoli a catalogo", () => {
    for (const k of KIT_REQUIREMENTS) {
      expect(Boolean(k.equipmentType) !== Boolean(k.supplyItem)).toBe(true);
      if (k.equipmentType) expect(equipmentCodes.has(k.equipmentType), k.equipmentType).toBe(true);
      if (k.supplyItem) expect(supplyCodes.has(k.supplyItem), k.supplyItem).toBe(true);
    }
    for (const t of CHECKLIST_TEMPLATES) {
      for (const item of t.items) {
        if (item.equipmentType)
          expect(equipmentCodes.has(item.equipmentType), item.equipmentType).toBe(true);
        if (item.supplyItem) expect(supplyCodes.has(item.supplyItem), item.supplyItem).toBe(true);
        if (item.kind === "number") expect(item.unit).toBeDefined();
      }
    }
  });

  it("ogni categoria di mezzo ha una check-list", () => {
    const covered = new Set(CHECKLIST_TEMPLATES.flatMap((t) => t.vehicleCategories));
    expect([...covered].sort()).toEqual(
      [
        "civil_protection",
        "disabled_transport",
        "emergency_ambulance",
        "medical_car",
        "service_car",
        "transport_ambulance",
      ].sort(),
    );
  });
});
