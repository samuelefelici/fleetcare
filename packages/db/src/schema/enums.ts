import { fleetcareSchema } from "./_schema";

/*
 * Identificatori in inglese, etichette in italiano: le etichette per la UI
 * stanno in `src/domain/labels.ts`, unica fonte.
 *
 * Regola per scegliere enum o tabella: enum quando il valore guida la
 * logica dell'applicazione (un ruolo, uno stato, una categoria di mezzo);
 * tabella quando l'associazione deve poterne aggiungere da sola (tipi di
 * scadenza, tipi di attrezzatura, articoli di consumo).
 */

// --- utenti ---
export const profileRole = fleetcareSchema.enum("profile_role", [
  "crew", // volontario/dipendente in turno: check-list, segnalazioni, rifornimenti, sanificazioni
  "fleet_manager", // responsabile parco mezzi
  "equipment_manager", // responsabile materiale sanitario e attrezzature
  "admin_finance", // amministrazione/tesoreria: fatture, costi
  "admin", // presidenza/direzione: tutto + configurazione
]);

// --- mezzi ---
export const vehicleCategory = fleetcareSchema.enum("vehicle_category", [
  "emergency_ambulance", // ambulanza di soccorso (DM 553/1987 tipo A · UNI EN 1789 tipo B/C)
  "transport_ambulance", // ambulanza di trasporto (DM 553/1987 tipo B · UNI EN 1789 tipo A1/A2)
  "medical_car", // automedica
  "disabled_transport", // pulmino per trasporto disabili (pedana/sollevatore)
  "service_car", // auto di servizio / trasporto sociale
  "civil_protection", // mezzo di protezione civile
]);

/** Classe UNI EN 1789 dell'allestimento sanitario, quando dichiarata. */
export const en1789Type = fleetcareSchema.enum("en1789_type", ["A1", "A2", "B", "C"]);

export const fuelType = fleetcareSchema.enum("fuel_type", [
  "diesel",
  "petrol",
  "hybrid",
  "electric",
  "lpg",
  "cng",
]);

export const vehicleStatus = fleetcareSchema.enum("vehicle_status", [
  "operational", // in servizio
  "reserve", // di riserva: usabile, non in turno
  "maintenance", // in officina
  "grounded", // fermo: scadenza bloccante superata o difetto di sicurezza
  "decommissioned", // dismesso
]);

/** Vale per mezzi e attrezzature: il DAE in comodato dall'AST è frequente quanto l'ambulanza donata. */
export const ownershipKind = fleetcareSchema.enum("ownership_kind", [
  "owned", // proprietà
  "loan", // comodato d'uso
  "leased", // leasing
  "rented", // noleggio
]);

export const downtimeCause = fleetcareSchema.enum("downtime_cause", [
  "breakdown",
  "maintenance",
  "deadline", // scadenza bloccante superata (revisione, RCA…)
  "accident",
  "sanitization",
  "other",
]);

export const odometerSource = fleetcareSchema.enum("odometer_source", [
  "manual",
  "checklist",
  "fuel",
  "maintenance",
]);

// --- scadenze ---
export const deadlineSubject = fleetcareSchema.enum("deadline_subject", ["vehicle", "equipment"]);

export const completionOutcome = fleetcareSchema.enum("completion_outcome", [
  "passed", // regolare / conforme
  "conditional", // con prescrizioni (es. revisione «ripetere» entro un mese)
  "failed", // non conforme: la scadenza resta aperta
]);

// --- attrezzature ---
export const equipmentGroup = fleetcareSchema.enum("equipment_group", [
  "electromedical", // DAE, monitor, aspiratore, ventilatore, saturimetro
  "oxygen", // bombole, riduttori/flussimetri
  "transport_device", // barella autocaricante, sedia portantina
  "immobilization", // tavola spinale, materasso a depressione, KED, barella a cucchiaio
  "safety", // estintori
  "vehicle_device", // sollevatore/pedana, ancoraggi carrozzine
  "other",
]);

export const equipmentStatus = fleetcareSchema.enum("equipment_status", [
  "in_use", // a bordo / in uso
  "in_stock", // in sede, di scorta
  "in_repair", // in assistenza
  "out_of_service", // guasta o scaduta, non utilizzabile
  "disposed", // dismessa
]);

// --- check-list ---
export const checklistItemKind = fleetcareSchema.enum("checklist_item_kind", [
  "check", // OK / anomalia
  "number", // un valore da leggere: pressione O2 in bar, livello carburante…
  "text",
]);

export const checkOutcome = fleetcareSchema.enum("check_outcome", [
  "ok",
  "anomaly",
  "not_applicable",
]);

// --- sanificazioni ---
export const sanitizationKind = fleetcareSchema.enum("sanitization_kind", [
  "routine", // ordinaria, a fine servizio
  "periodic", // approfondita, a calendario
  "post_infectious", // straordinaria dopo trasporto di paziente infettivo
]);

// --- segnalazioni guasti ---
export const faultSeverity = fleetcareSchema.enum("fault_severity", ["green", "yellow", "red"]);

export const faultStatus = fleetcareSchema.enum("fault_status", [
  "open",
  "acknowledged", // presa in carico
  "in_progress", // collegata a un intervento
  "resolved",
  "rejected",
]);

export const faultArea = fleetcareSchema.enum("fault_area", [
  "mechanical",
  "electrical",
  "bodywork",
  "tyres",
  "lights_siren", // lampeggianti e sirena
  "sanitary_compartment", // vano sanitario: illuminazione, prese, clima, arredi
  "equipment", // un'attrezzatura (si collega `equipment_id`)
  "lift", // pedana/sollevatore, ancoraggi
  "radio_it", // radio, tablet, navigatore
  "other",
]);

// --- manutenzione ---
export const supplierKind = fleetcareSchema.enum("supplier_kind", [
  "workshop", // officina meccanica / concessionaria
  "body_shop", // carrozzeria
  "tyre_shop", // gommista
  "auto_electrician", // elettrauto
  "outfitter", // allestitore sanitario
  "medical_service", // assistenza tecnica elettromedicali / barelle
  "fuel_station", // distributore carburante
  "insurer", // compagnia / broker
  "inspection_center", // centro revisioni / motorizzazione
  "fire_safety", // manutentore estintori
  "medical_gas", // fornitore ossigeno medicinale
  "other",
]);

export const maintenanceKind = fleetcareSchema.enum("maintenance_kind", [
  "service", // tagliando
  "repair",
  "tyres",
  "bodywork",
  "inspection", // revisione
  "outfitting", // lavori sull'allestimento sanitario
  "equipment_service", // assistenza su un'attrezzatura
  "other",
]);

export const maintenanceStatus = fleetcareSchema.enum("maintenance_status", [
  "planned",
  "in_progress", // il mezzo è in officina
  "completed",
  "cancelled",
]);

// --- rifornimenti ---
export const fuelProduct = fleetcareSchema.enum("fuel_product", [
  "diesel",
  "petrol",
  "adblue",
  "lpg",
  "cng",
  "other",
]);

export const fuelInvoiceStatus = fleetcareSchema.enum("fuel_invoice_status", [
  "received",
  "reconciled", // tutte le righe abbinate o spiegate
  "disputed", // contestata al distributore
  "approved", // approvata per il pagamento
  "paid",
]);

export const fuelMatchStatus = fleetcareSchema.enum("fuel_match_status", [
  "unmatched", // fatturato ma nessun rifornimento registrato
  "matched",
  "mismatch", // c'è un rifornimento candidato ma litri/importo non tornano
  "manual", // abbinato o spiegato a mano
  "ignored", // riga non di rifornimento (sconto, commissione…)
]);

// --- sinistri ---
export const accidentFault = fleetcareSchema.enum("accident_fault", [
  "ours",
  "counterpart",
  "shared",
  "unknown",
]);

export const accidentStatus = fleetcareSchema.enum("accident_status", [
  "open",
  "assessment",
  "closed",
]);

// --- trasversali ---
export const attachmentEntity = fleetcareSchema.enum("attachment_entity", [
  "vehicle",
  "equipment",
  "deadline_completion",
  "maintenance_job",
  "fault_report",
  "accident",
  "fuel_invoice",
  "checklist",
]);

export const notificationKind = fleetcareSchema.enum("notification_kind", [
  "deadline_expiring",
  "deadline_expired",
  "fault_red",
  "vehicle_grounded",
  "vehicle_restored",
  "fuel_mismatch",
  "generic",
]);
