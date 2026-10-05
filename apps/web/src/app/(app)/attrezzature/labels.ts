/**
 * Le etichette della sezione attrezzature che non stanno in labels.ts di
 * @fleetcare/db: lo stato dell'oggetto, la proprietà e il colore del badge
 * di stato. L'ordine delle chiavi è l'ordine dei menu e dei pulsanti.
 */
import type { equipmentStatus, ownershipKind } from "@fleetcare/db";
import type { BadgeTone } from "@/components/ui";

type Values<E extends { enumValues: readonly string[] }> = E["enumValues"][number];

export type EquipmentStatus = Values<typeof equipmentStatus>;
export type OwnershipKind = Values<typeof ownershipKind>;

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  in_use: "In uso",
  in_stock: "Di scorta",
  in_repair: "In assistenza",
  out_of_service: "Fuori uso",
  disposed: "Dismessa",
};

/** Il colore del badge di stato: verde in uso, ambra in assistenza, rosso fuori uso. */
export const EQUIPMENT_STATUS_TONE: Record<EquipmentStatus, BadgeTone> = {
  in_use: "ok",
  in_stock: "brand",
  in_repair: "warn",
  out_of_service: "danger",
  disposed: "neutral",
};

export const OWNERSHIP_LABELS: Record<OwnershipKind, string> = {
  owned: "Di proprietà",
  loan: "In comodato",
  leased: "In leasing",
  rented: "A noleggio",
};
