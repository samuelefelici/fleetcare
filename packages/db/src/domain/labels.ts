/**
 * Etichette italiane degli enum: unica fonte per UI, export e seed.
 * `Record<valore, string>` sui valori dell'enum Drizzle: se si aggiunge un
 * valore all'enum e non l'etichetta, il typecheck fallisce.
 */
import type {
  equipmentGroup,
  faultArea,
  faultSeverity,
  maintenanceKind,
  profileRole,
  sanitizationKind,
  supplierKind,
  vehicleCategory,
  vehicleStatus,
} from "../schema/enums";

type Values<E extends { enumValues: readonly string[] }> = E["enumValues"][number];
type Labels<E extends { enumValues: readonly string[] }> = Record<Values<E>, string>;

export const PROFILE_ROLE_LABELS: Labels<typeof profileRole> = {
  crew: "Equipaggio",
  fleet_manager: "Responsabile parco mezzi",
  equipment_manager: "Responsabile materiale sanitario",
  admin_finance: "Amministrazione",
  admin: "Direzione",
};

export const VEHICLE_CATEGORY_LABELS: Labels<typeof vehicleCategory> = {
  emergency_ambulance: "Ambulanza di soccorso",
  transport_ambulance: "Ambulanza di trasporto",
  medical_car: "Automedica",
  disabled_transport: "Pulmino trasporto disabili",
  service_car: "Auto di servizio",
  civil_protection: "Protezione civile",
};

export const VEHICLE_STATUS_LABELS: Labels<typeof vehicleStatus> = {
  operational: "Operativo",
  reserve: "Riserva",
  maintenance: "In officina",
  grounded: "Fermo",
  decommissioned: "Dismesso",
};

export const EQUIPMENT_GROUP_LABELS: Labels<typeof equipmentGroup> = {
  electromedical: "Elettromedicali",
  oxygen: "Ossigeno",
  transport_device: "Barelle e sedie",
  immobilization: "Immobilizzazione",
  safety: "Sicurezza",
  vehicle_device: "Dispositivi del mezzo",
  other: "Altro",
};

export const FAULT_AREA_LABELS: Labels<typeof faultArea> = {
  mechanical: "Meccanica",
  electrical: "Impianto elettrico",
  bodywork: "Carrozzeria",
  tyres: "Pneumatici",
  lights_siren: "Lampeggianti e sirena",
  sanitary_compartment: "Vano sanitario",
  equipment: "Attrezzatura",
  lift: "Pedana / sollevatore",
  radio_it: "Radio e dispositivi",
  other: "Altro",
};

export const FAULT_SEVERITY_LABELS: Labels<typeof faultSeverity> = {
  green: "Posso continuare il servizio",
  yellow: "Da controllare presto",
  red: "Il mezzo non è sicuro",
};

export const MAINTENANCE_KIND_LABELS: Labels<typeof maintenanceKind> = {
  service: "Tagliando",
  repair: "Riparazione",
  tyres: "Pneumatici",
  bodywork: "Carrozzeria",
  inspection: "Revisione",
  outfitting: "Allestimento sanitario",
  equipment_service: "Assistenza attrezzatura",
  other: "Altro",
};

export const SUPPLIER_KIND_LABELS: Labels<typeof supplierKind> = {
  workshop: "Officina",
  body_shop: "Carrozzeria",
  tyre_shop: "Gommista",
  auto_electrician: "Elettrauto",
  outfitter: "Allestitore",
  medical_service: "Assistenza elettromedicali",
  fuel_station: "Distributore carburante",
  insurer: "Assicurazione",
  inspection_center: "Centro revisioni",
  fire_safety: "Manutentore estintori",
  medical_gas: "Gas medicinali",
  other: "Altro",
};

export const SANITIZATION_KIND_LABELS: Labels<typeof sanitizationKind> = {
  routine: "Ordinaria (fine servizio)",
  periodic: "Periodica approfondita",
  post_infectious: "Straordinaria (paziente infettivo)",
};
