/**
 * Le etichette della sezione mezzi che non stanno in labels.ts di
 * @fleetcare/db: alimentazione, classe EN 1789, proprietà, fonte delle
 * letture del contachilometri, e il colore del badge di stato.
 */
import type {
  en1789Type,
  fuelType,
  odometerSource,
  ownershipKind,
  vehicleStatus,
} from "@fleetcare/db";
import type { BadgeTone } from "@/components/ui";

type Values<E extends { enumValues: readonly string[] }> = E["enumValues"][number];

export type FuelType = Values<typeof fuelType>;
export type En1789Type = Values<typeof en1789Type>;
export type OwnershipKind = Values<typeof ownershipKind>;
export type OdometerSource = Values<typeof odometerSource>;
export type VehicleStatus = Values<typeof vehicleStatus>;

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  diesel: "Gasolio",
  petrol: "Benzina",
  hybrid: "Ibrido",
  electric: "Elettrico",
  lpg: "GPL",
  cng: "Metano",
};

export const EN1789_LABELS: Record<En1789Type, string> = {
  A1: "A1 – trasporto di un paziente",
  A2: "A2 – trasporto di più pazienti",
  B: "B – soccorso di base",
  C: "C – soccorso avanzato",
};

export const OWNERSHIP_LABELS: Record<OwnershipKind, string> = {
  owned: "Di proprietà",
  loan: "In comodato",
  leased: "In leasing",
  rented: "A noleggio",
};

export const ODOMETER_SOURCE_LABELS: Record<OdometerSource, string> = {
  manual: "A mano",
  checklist: "Check-list",
  fuel: "Rifornimento",
  maintenance: "Officina",
};

/** Il colore del badge di stato: verde in servizio, ambra in officina, rosso fermo. */
export const VEHICLE_STATUS_TONE: Record<VehicleStatus, BadgeTone> = {
  operational: "ok",
  reserve: "brand",
  maintenance: "warn",
  grounded: "danger",
  decommissioned: "neutral",
};
