/**
 * Catalogo iniziale di un'associazione: è l'analisi dei campi tradotta in
 * dati. Tutto è per tenant e modificabile dall'applicazione; il seed lo
 * scrive una volta sola (idempotente: rilanciarlo non duplica e non
 * sovrascrive le modifiche).
 *
 * Periodicità e riferimenti sono quelli di partenza, da validare con il
 * responsabile mezzi e il responsabile sanitario dell'associazione: dove
 * la norma lascia la periodicità al fabbricante, il valore qui è quello
 * tipico e va corretto sul manuale del dispositivo vero.
 */
import type {
  checklistItemKind,
  deadlineSubject,
  equipmentGroup,
  vehicleCategory,
} from "../schema/enums";

type VehicleCategory = (typeof vehicleCategory.enumValues)[number];
type EquipmentGroup = (typeof equipmentGroup.enumValues)[number];
type DeadlineSubject = (typeof deadlineSubject.enumValues)[number];
type ChecklistItemKind = (typeof checklistItemKind.enumValues)[number];

const ALL_CATEGORIES: VehicleCategory[] = [
  "emergency_ambulance",
  "transport_ambulance",
  "medical_car",
  "disabled_transport",
  "service_car",
  "civil_protection",
];
const SANITARY: VehicleCategory[] = ["emergency_ambulance", "transport_ambulance", "medical_car"];

// ------------------------------------------------------------------
// Tipi di scadenza
// ------------------------------------------------------------------

export interface DeadlineTypeSeed {
  code: string;
  label: string;
  subject: DeadlineSubject;
  reference: string;
  description?: string;
  intervalMonths?: number;
  intervalDays?: number;
  intervalKm?: number;
  monthEnd?: boolean;
  renewFromDue?: boolean;
  renewGraceDays?: number;
  isVehicleTax?: boolean;
  completedByCrew?: boolean;
  alertDays: number;
  alertKm?: number;
  blocking: boolean;
  documentRequired: boolean;
}

export const DEADLINE_TYPES: DeadlineTypeSeed[] = [
  // --- mezzi ---
  {
    code: "revisione",
    label: "Revisione periodica",
    subject: "vehicle",
    reference:
      "CdS art. 80: annuale per le autoambulanze; per autovetture e autocarri fino a 3,5 t la prima a 4 anni dall'immatricolazione, poi ogni 2",
    description:
      "Scade a fine mese. Annuale anche per i mezzi con più di 9 posti o oltre 3,5 t: per questo pulmini e mezzi di protezione civile nascono annuali, e si portano a 24 mesi solo i mezzi che lo consentono (carta di circolazione).",
    intervalMonths: 12,
    monthEnd: true,
    alertDays: 60,
    blocking: true,
    documentRequired: true,
  },
  {
    code: "rca",
    label: "Assicurazione RCA",
    subject: "vehicle",
    reference: "CdS art. 193",
    description:
      "Con una polizza a libro matricola la scadenza è la stessa per tutti i mezzi: il rinnovo si registra su ciascuno, con la sua quota di premio. Si rinnova dall'anniversario, non dal giorno del pagamento, se pagata entro 15 giorni dalla scadenza (art. 1901 c.c.); oltre, il nuovo periodo parte dal pagamento.",
    intervalMonths: 12,
    renewFromDue: true,
    renewGraceDays: 15,
    alertDays: 30,
    blocking: true,
    documentRequired: true,
  },
  {
    code: "bollo",
    label: "Tassa automobilistica",
    subject: "vehicle",
    reference: "Tassa regionale; molti mezzi sanitari e per disabili di ETS sono esenti",
    description:
      "Non nasce per i mezzi con «esente bollo». Calendario fisso: si rinnova dalla scadenza precedente anche se pagato in ritardo.",
    intervalMonths: 12,
    monthEnd: true,
    renewFromDue: true,
    isVehicleTax: true,
    alertDays: 30,
    blocking: false,
    documentRequired: false,
  },
  {
    code: "tagliando",
    label: "Tagliando",
    subject: "vehicle",
    reference: "Piano di manutenzione del costruttore",
    description:
      "Vale il primo raggiunto fra tempo e chilometri. Correggere i valori sul libretto del mezzo.",
    intervalMonths: 12,
    intervalKm: 30_000,
    alertDays: 30,
    alertKm: 2_000,
    blocking: false,
    documentRequired: false,
  },
  {
    code: "autorizzazione_sanitaria",
    label: "Autorizzazione al trasporto sanitario",
    subject: "vehicle",
    reference:
      "Regione Marche, L.R. 36/1998 e atti attuativi — verificare durata e modalità di rinnovo con l'ufficio regionale",
    description: "Data di scadenza dall'atto di autorizzazione.",
    alertDays: 90,
    blocking: true,
    documentRequired: true,
  },
  {
    code: "sanificazione_periodica",
    label: "Sanificazione periodica approfondita",
    subject: "vehicle",
    reference: "Protocollo di sanificazione dell'associazione",
    description:
      "La registra l'equipaggio che ha sanificato: l'adempimento si collega alla sanificazione «periodica».",
    intervalDays: 30,
    completedByCrew: true,
    alertDays: 5,
    blocking: false,
    documentRequired: false,
  },

  // --- attrezzature ---
  {
    code: "manutenzione_fabbricante",
    label: "Manutenzione preventiva del fabbricante",
    subject: "equipment",
    reference:
      "Manuale d'uso e manutenzione del dispositivo (Reg. UE 2017/745 per i dispositivi medici)",
    intervalMonths: 12,
    alertDays: 30,
    blocking: false,
    documentRequired: true,
  },
  {
    code: "verifica_elettrica",
    label: "Verifica di sicurezza elettrica",
    subject: "equipment",
    reference: "CEI EN 62353 — periodicità indicata dal fabbricante (tipicamente 12–24 mesi)",
    intervalMonths: 12,
    alertDays: 30,
    blocking: false,
    documentRequired: true,
  },
  {
    code: "scadenza_elettrodi",
    label: "Scadenza elettrodi / piastre",
    subject: "equipment",
    reference: "Data stampata sulla confezione",
    alertDays: 60,
    blocking: true,
    documentRequired: false,
  },
  {
    code: "scadenza_batteria",
    label: "Sostituzione batteria",
    subject: "equipment",
    reference: "Data indicata dal fabbricante sulla batteria",
    alertDays: 60,
    blocking: true,
    documentRequired: false,
  },
  {
    code: "collaudo_recipiente",
    label: "Revisione periodica del recipiente in pressione",
    subject: "equipment",
    reference:
      "Bombole gas: ADR/TPED (D.Lgs. 78/2012), per l'ossigeno tipicamente ogni 10 anni; estintori: UNI 9994-1",
    description:
      "Se le bombole sono del fornitore (scambio vuoto per pieno) la revisione è sua: disattivare la scadenza.",
    alertDays: 90,
    blocking: true,
    documentRequired: true,
  },
  {
    code: "scadenza_gas",
    label: "Scadenza lotto ossigeno medicinale",
    subject: "equipment",
    reference: "Etichetta del lotto (farmaco con AIC)",
    alertDays: 30,
    blocking: true,
    documentRequired: false,
  },
  {
    code: "controllo_estintore",
    label: "Controllo periodico estintore",
    subject: "equipment",
    reference: "UNI 9994-1 — controllo semestrale da tecnico manutentore",
    intervalMonths: 6,
    alertDays: 15,
    blocking: false,
    documentRequired: true,
  },
  {
    code: "revisione_estintore",
    label: "Revisione estintore",
    subject: "equipment",
    reference: "UNI 9994-1 — polvere 36 mesi, CO2 60 mesi",
    alertDays: 30,
    blocking: false,
    documentRequired: true,
  },
  {
    code: "fine_vita",
    label: "Fine vita dichiarata dal fabbricante",
    subject: "equipment",
    reference: "Manuale del dispositivo",
    alertDays: 180,
    blocking: true,
    documentRequired: false,
  },
];

// ------------------------------------------------------------------
// Tipi di attrezzatura
// ------------------------------------------------------------------

export interface EquipmentTypeSeed {
  code: string;
  label: string;
  group: EquipmentGroup;
  electromedical: boolean;
  missionCritical: boolean;
}

export const EQUIPMENT_TYPES: EquipmentTypeSeed[] = [
  {
    code: "defibrillatore",
    label: "Defibrillatore semiautomatico (DAE)",
    group: "electromedical",
    electromedical: true,
    missionCritical: true,
  },
  {
    code: "monitor_defibrillatore",
    label: "Monitor-defibrillatore",
    group: "electromedical",
    electromedical: true,
    missionCritical: true,
  },
  {
    code: "aspiratore",
    label: "Aspiratore di secreti",
    group: "electromedical",
    electromedical: true,
    missionCritical: true,
  },
  {
    code: "ventilatore",
    label: "Ventilatore polmonare",
    group: "electromedical",
    electromedical: true,
    missionCritical: true,
  },
  {
    code: "saturimetro",
    label: "Saturimetro",
    group: "electromedical",
    // a batteria, senza parti collegate alla rete: niente verifica elettrica,
    // il controllo è quello funzionale della check-list
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "bombola_o2_fissa",
    label: "Bombola O2 fissa",
    group: "oxygen",
    electromedical: false,
    missionCritical: true,
  },
  {
    code: "bombola_o2_portatile",
    label: "Bombola O2 portatile",
    group: "oxygen",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "riduttore_o2",
    label: "Riduttore / flussimetro O2",
    group: "oxygen",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "barella_autocaricante",
    label: "Barella autocaricante",
    group: "transport_device",
    electromedical: false,
    missionCritical: true,
  },
  {
    code: "sedia_portantina",
    label: "Sedia portantina / da evacuazione",
    group: "transport_device",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "barella_cucchiaio",
    label: "Barella a cucchiaio",
    group: "immobilization",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "tavola_spinale",
    label: "Tavola spinale",
    group: "immobilization",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "materasso_depressione",
    label: "Materasso a depressione",
    group: "immobilization",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "ked",
    label: "Estricatore (KED)",
    group: "immobilization",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "estintore_polvere",
    label: "Estintore a polvere",
    group: "safety",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "estintore_co2",
    label: "Estintore a CO2",
    group: "safety",
    electromedical: false,
    missionCritical: false,
  },
  {
    code: "sollevatore",
    label: "Sollevatore / pedana per carrozzine",
    group: "vehicle_device",
    electromedical: false,
    missionCritical: true,
  },
];

// ------------------------------------------------------------------
// Regole: quali scadenze nascono, per chi, ogni quanto
// ------------------------------------------------------------------

export interface DeadlineRuleSeed {
  deadlineType: string;
  vehicleCategory?: VehicleCategory;
  equipmentType?: string;
  intervalMonths?: number;
  intervalDays?: number;
  intervalKm?: number;
  alertDays?: number;
  alertKm?: number;
  blocking?: boolean;
}

const forCategories = (
  deadlineType: string,
  categories: VehicleCategory[],
  extra: Omit<DeadlineRuleSeed, "deadlineType" | "vehicleCategory"> = {},
): DeadlineRuleSeed[] =>
  categories.map((vehicleCategory) => ({ deadlineType, vehicleCategory, ...extra }));

const forEquipment = (
  equipmentType: string,
  rules: Array<Omit<DeadlineRuleSeed, "equipmentType" | "vehicleCategory">>,
): DeadlineRuleSeed[] => rules.map((r) => ({ ...r, equipmentType }));

const lifeSupportDevice = (code: string) =>
  forEquipment(code, [
    { deadlineType: "manutenzione_fabbricante", blocking: true },
    { deadlineType: "verifica_elettrica" },
  ]);

export const DEADLINE_RULES: DeadlineRuleSeed[] = [
  // revisione: annuale per le ambulanze e — dalla parte sicura — per pulmini e
  // protezione civile, che spesso superano 9 posti o 3,5 t; 24 mesi per le
  // autovetture (automedica, auto di servizio), dopo la prima a 4 anni
  ...forCategories(
    "revisione",
    ["emergency_ambulance", "transport_ambulance", "disabled_transport", "civil_protection"],
    { intervalMonths: 12 },
  ),
  ...forCategories("revisione", ["medical_car", "service_car"], { intervalMonths: 24 }),
  ...forCategories("rca", ALL_CATEGORIES),
  ...forCategories("bollo", ALL_CATEGORIES),
  ...forCategories("tagliando", ALL_CATEGORIES),
  ...forCategories("autorizzazione_sanitaria", SANITARY),
  ...forCategories("sanificazione_periodica", [...SANITARY, "disabled_transport"]),

  ...lifeSupportDevice("aspiratore"),
  ...lifeSupportDevice("ventilatore"),
  ...forEquipment("defibrillatore", [
    { deadlineType: "manutenzione_fabbricante", blocking: true },
    { deadlineType: "verifica_elettrica" },
    { deadlineType: "scadenza_elettrodi" },
    { deadlineType: "scadenza_batteria" },
  ]),
  ...forEquipment("monitor_defibrillatore", [
    { deadlineType: "manutenzione_fabbricante", blocking: true },
    { deadlineType: "verifica_elettrica" },
    { deadlineType: "scadenza_elettrodi" },
    { deadlineType: "scadenza_batteria" },
  ]),
  ...forEquipment("bombola_o2_fissa", [
    { deadlineType: "collaudo_recipiente", intervalMonths: 120 },
    { deadlineType: "scadenza_gas" },
  ]),
  ...forEquipment("bombola_o2_portatile", [
    { deadlineType: "collaudo_recipiente", intervalMonths: 120 },
    { deadlineType: "scadenza_gas" },
  ]),
  ...forEquipment("riduttore_o2", [
    { deadlineType: "manutenzione_fabbricante", intervalMonths: 60 },
  ]),
  ...forEquipment("barella_autocaricante", [
    { deadlineType: "manutenzione_fabbricante", blocking: true },
    { deadlineType: "fine_vita" },
  ]),
  ...forEquipment("sedia_portantina", [
    { deadlineType: "manutenzione_fabbricante" },
    { deadlineType: "fine_vita" },
  ]),
  ...["barella_cucchiaio", "tavola_spinale", "materasso_depressione", "ked"].flatMap((code) =>
    forEquipment(code, [{ deadlineType: "manutenzione_fabbricante" }]),
  ),
  ...forEquipment("estintore_polvere", [
    { deadlineType: "controllo_estintore" },
    { deadlineType: "revisione_estintore", intervalMonths: 36 },
    { deadlineType: "collaudo_recipiente", intervalMonths: 144 },
  ]),
  ...forEquipment("estintore_co2", [
    { deadlineType: "controllo_estintore" },
    { deadlineType: "revisione_estintore", intervalMonths: 60 },
    { deadlineType: "collaudo_recipiente", intervalMonths: 120 },
  ]),
  ...forEquipment("sollevatore", [{ deadlineType: "manutenzione_fabbricante", blocking: true }]),
];

// ------------------------------------------------------------------
// Materiale di consumo
// ------------------------------------------------------------------

export interface SupplyItemSeed {
  code: string;
  name: string;
  unit: string;
  category: string;
  tracksExpiry: boolean;
}

export const SUPPLY_ITEMS: SupplyItemSeed[] = [
  {
    code: "guanti_nitrile",
    name: "Guanti monouso in nitrile",
    unit: "conf",
    category: "protezione",
    tracksExpiry: false,
  },
  {
    code: "garze_sterili",
    name: "Garze sterili 10×10",
    unit: "pz",
    category: "medicazione",
    tracksExpiry: true,
  },
  {
    code: "fisiologica_500",
    name: "Soluzione fisiologica 500 ml",
    unit: "pz",
    category: "medicazione",
    tracksExpiry: true,
  },
  {
    code: "disinfettante_cute",
    name: "Disinfettante per cute",
    unit: "pz",
    category: "medicazione",
    tracksExpiry: true,
  },
  {
    code: "telo_ustioni",
    name: "Telo sterile per ustioni",
    unit: "pz",
    category: "medicazione",
    tracksExpiry: true,
  },
  {
    code: "maschera_o2_adulto",
    name: "Maschera O2 adulto con reservoir",
    unit: "pz",
    category: "vie aeree",
    tracksExpiry: true,
  },
  {
    code: "maschera_o2_pediatrica",
    name: "Maschera O2 pediatrica",
    unit: "pz",
    category: "vie aeree",
    tracksExpiry: true,
  },
  {
    code: "occhialini_o2",
    name: "Occhialini nasali O2",
    unit: "pz",
    category: "vie aeree",
    tracksExpiry: true,
  },
  {
    code: "cannule_guedel",
    name: "Set cannule orofaringee (Guedel)",
    unit: "set",
    category: "vie aeree",
    tracksExpiry: true,
  },
  {
    code: "sondini_aspirazione",
    name: "Sondini di aspirazione",
    unit: "pz",
    category: "vie aeree",
    tracksExpiry: true,
  },
  {
    code: "elettrodi_dae_ricambio",
    name: "Elettrodi DAE di scorta",
    unit: "pz",
    category: "elettromedicali",
    tracksExpiry: true,
  },
  {
    code: "collari_cervicali",
    name: "Collari cervicali (set)",
    unit: "set",
    category: "immobilizzazione",
    tracksExpiry: false,
  },
  {
    code: "laccio_emostatico",
    name: "Laccio emostatico (tourniquet)",
    unit: "pz",
    category: "emorragie",
    tracksExpiry: false,
  },
  {
    code: "coperta_isotermica",
    name: "Coperta isotermica",
    unit: "pz",
    category: "varie",
    tracksExpiry: false,
  },
  {
    code: "ghiaccio_istantaneo",
    name: "Ghiaccio istantaneo",
    unit: "pz",
    category: "varie",
    tracksExpiry: true,
  },
];

// ------------------------------------------------------------------
// Dotazione minima per categoria (indicativa: da validare col responsabile sanitario)
// ------------------------------------------------------------------

export interface KitRequirementSeed {
  vehicleCategory: VehicleCategory;
  equipmentType?: string;
  supplyItem?: string;
  minQuantity: number;
}

const kit = (
  vehicleCategory: VehicleCategory,
  equipment: Record<string, number>,
  supplies: Record<string, number> = {},
): KitRequirementSeed[] => [
  ...Object.entries(equipment).map(([equipmentType, minQuantity]) => ({
    vehicleCategory,
    equipmentType,
    minQuantity,
  })),
  ...Object.entries(supplies).map(([supplyItem, minQuantity]) => ({
    vehicleCategory,
    supplyItem,
    minQuantity,
  })),
];

export const KIT_REQUIREMENTS: KitRequirementSeed[] = [
  ...kit(
    "emergency_ambulance",
    {
      defibrillatore: 1,
      aspiratore: 1,
      saturimetro: 1,
      bombola_o2_fissa: 1,
      bombola_o2_portatile: 1,
      riduttore_o2: 2,
      barella_autocaricante: 1,
      sedia_portantina: 1,
      barella_cucchiaio: 1,
      tavola_spinale: 1,
      materasso_depressione: 1,
      ked: 1,
      estintore_polvere: 1,
    },
    {
      guanti_nitrile: 2,
      garze_sterili: 20,
      fisiologica_500: 4,
      disinfettante_cute: 1,
      telo_ustioni: 2,
      maschera_o2_adulto: 2,
      maschera_o2_pediatrica: 1,
      occhialini_o2: 2,
      cannule_guedel: 1,
      sondini_aspirazione: 4,
      elettrodi_dae_ricambio: 1,
      collari_cervicali: 1,
      laccio_emostatico: 2,
      coperta_isotermica: 4,
      ghiaccio_istantaneo: 2,
    },
  ),
  ...kit(
    "transport_ambulance",
    {
      bombola_o2_fissa: 1,
      bombola_o2_portatile: 1,
      riduttore_o2: 2,
      barella_autocaricante: 1,
      sedia_portantina: 1,
      estintore_polvere: 1,
    },
    {
      guanti_nitrile: 2,
      garze_sterili: 10,
      maschera_o2_adulto: 2,
      occhialini_o2: 2,
      coperta_isotermica: 2,
    },
  ),
  ...kit(
    "medical_car",
    {
      monitor_defibrillatore: 1,
      aspiratore: 1,
      ventilatore: 1,
      saturimetro: 1,
      bombola_o2_portatile: 1,
      riduttore_o2: 1,
      estintore_polvere: 1,
    },
    { guanti_nitrile: 1, elettrodi_dae_ricambio: 1, laccio_emostatico: 1 },
  ),
  ...kit("disabled_transport", { sollevatore: 1, estintore_polvere: 1 }),
  ...kit("service_car", { estintore_polvere: 1 }),
  ...kit("civil_protection", { estintore_polvere: 1 }),
];

// ------------------------------------------------------------------
// Check-list «controllo mezzo» a inizio turno
// ------------------------------------------------------------------

export interface ChecklistItemSeed {
  section: string;
  label: string;
  kind?: ChecklistItemKind;
  unit?: string;
  minValue?: number;
  safetyCritical?: boolean;
  equipmentType?: string;
  supplyItem?: string;
}

export interface ChecklistTemplateSeed {
  name: string;
  vehicleCategories: VehicleCategory[];
  items: ChecklistItemSeed[];
}

/** Il giro del mezzo, uguale per tutti: km e livello carburante stanno in testata, non qui. */
const VEHICLE_ROUND: ChecklistItemSeed[] = [
  { section: "Mezzo", label: "Documenti di bordo presenti (carta di circolazione, assicurazione)" },
  { section: "Mezzo", label: "Nessuna spia di avaria accesa sul cruscotto" },
  { section: "Mezzo", label: "Luci, frecce e stop funzionanti", safetyCritical: true },
  { section: "Mezzo", label: "Pneumatici integri e gonfi a vista", safetyCritical: true },
  { section: "Mezzo", label: "Nessun danno nuovo alla carrozzeria" },
];

const PRIORITY_LIGHTS: ChecklistItemSeed[] = [
  { section: "Mezzo", label: "Lampeggianti blu e sirena funzionanti", safetyCritical: true },
  { section: "Mezzo", label: "Radio e dispositivi di bordo funzionanti" },
];

const EXTINGUISHER: ChecklistItemSeed = {
  section: "Sicurezza",
  label: "Estintore presente, manometro in zona verde",
  equipmentType: "estintore_polvere",
};

/** Vano sanitario: uguale per le due ambulanze */
const AMBULANCE_COMPARTMENT: ChecklistItemSeed[] = [
  { section: "Vano sanitario", label: "Vano pulito e sanificato" },
  { section: "Vano sanitario", label: "Illuminazione, prese e climatizzazione funzionanti" },
  {
    section: "Vano sanitario",
    label: "Barella autocaricante: ganci di ancoraggio e cinghie integri",
    safetyCritical: true,
    equipmentType: "barella_autocaricante",
  },
  {
    section: "Vano sanitario",
    label: "Sedia portantina presente e integra",
    equipmentType: "sedia_portantina",
  },
];

const AMBULANCE_OXYGEN: ChecklistItemSeed[] = [
  {
    section: "Ossigeno",
    label: "Pressione bombola O2 fissa",
    kind: "number",
    unit: "bar",
    minValue: 50,
    safetyCritical: true,
    equipmentType: "bombola_o2_fissa",
  },
  {
    section: "Ossigeno",
    label: "Pressione bombola O2 portatile",
    kind: "number",
    unit: "bar",
    minValue: 50,
    safetyCritical: true,
    equipmentType: "bombola_o2_portatile",
  },
  {
    section: "Ossigeno",
    label: "Riduttori e flussimetri funzionanti, nessuna perdita",
    safetyCritical: true,
    equipmentType: "riduttore_o2",
  },
];

const CREW_SAFETY: ChecklistItemSeed[] = [
  {
    section: "Zaino e consumabili",
    label: "Guanti e DPI per l'equipaggio",
    supplyItem: "guanti_nitrile",
  },
  EXTINGUISHER,
  { section: "Sicurezza", label: "Giubbini ad alta visibilità per l'equipaggio" },
];

export const CHECKLIST_TEMPLATES: ChecklistTemplateSeed[] = [
  {
    name: "Controllo ambulanza di soccorso",
    vehicleCategories: ["emergency_ambulance"],
    items: [
      ...VEHICLE_ROUND,
      ...PRIORITY_LIGHTS,
      ...AMBULANCE_COMPARTMENT,
      ...AMBULANCE_OXYGEN,
      {
        section: "Elettromedicali",
        label: "DAE: autotest superato, batteria carica",
        safetyCritical: true,
        equipmentType: "defibrillatore",
      },
      {
        section: "Elettromedicali",
        label: "DAE: elettrodi presenti e non scaduti",
        safetyCritical: true,
        equipmentType: "defibrillatore",
      },
      {
        section: "Elettromedicali",
        label: "Aspiratore carico e funzionante",
        safetyCritical: true,
        equipmentType: "aspiratore",
      },
      {
        section: "Elettromedicali",
        label: "Saturimetro funzionante",
        equipmentType: "saturimetro",
      },
      {
        section: "Immobilizzazione",
        label: "Tavola spinale con fermacapo e cinghie",
        equipmentType: "tavola_spinale",
      },
      {
        section: "Immobilizzazione",
        label: "Materasso a depressione e pompa",
        equipmentType: "materasso_depressione",
      },
      { section: "Immobilizzazione", label: "Estricatore (KED)", equipmentType: "ked" },
      {
        section: "Immobilizzazione",
        label: "Barella a cucchiaio",
        equipmentType: "barella_cucchiaio",
      },
      { section: "Immobilizzazione", label: "Collari cervicali", supplyItem: "collari_cervicali" },
      { section: "Zaino e consumabili", label: "Zaino di soccorso completo e sigillato" },
      ...CREW_SAFETY,
    ],
  },
  {
    // solo ciò che un'ambulanza di trasporto ha in dotazione (kit_requirements)
    name: "Controllo ambulanza di trasporto",
    vehicleCategories: ["transport_ambulance"],
    items: [
      ...VEHICLE_ROUND,
      ...PRIORITY_LIGHTS,
      ...AMBULANCE_COMPARTMENT,
      ...AMBULANCE_OXYGEN,
      ...CREW_SAFETY,
    ],
  },
  {
    name: "Controllo automedica",
    vehicleCategories: ["medical_car"],
    items: [
      ...VEHICLE_ROUND,
      ...PRIORITY_LIGHTS,
      {
        section: "Elettromedicali",
        label: "Monitor-defibrillatore: autotest superato, elettrodi non scaduti",
        safetyCritical: true,
        equipmentType: "monitor_defibrillatore",
      },
      {
        section: "Elettromedicali",
        label: "Ventilatore funzionante, circuito presente",
        safetyCritical: true,
        equipmentType: "ventilatore",
      },
      {
        section: "Elettromedicali",
        label: "Aspiratore carico e funzionante",
        safetyCritical: true,
        equipmentType: "aspiratore",
      },
      {
        section: "Ossigeno",
        label: "Pressione bombola O2 portatile",
        kind: "number",
        unit: "bar",
        minValue: 50,
        safetyCritical: true,
        equipmentType: "bombola_o2_portatile",
      },
      { section: "Zaino e consumabili", label: "Borse del medico complete e sigillate" },
      EXTINGUISHER,
    ],
  },
  {
    name: "Controllo pulmino trasporto disabili",
    vehicleCategories: ["disabled_transport"],
    items: [
      ...VEHICLE_ROUND,
      {
        section: "Accessibilità",
        label: "Sollevatore: prova completa di salita e discesa",
        safetyCritical: true,
        equipmentType: "sollevatore",
      },
      {
        section: "Accessibilità",
        label: "Ancoraggi carrozzine e cinture a 3 punti presenti e integri",
        safetyCritical: true,
      },
      {
        section: "Accessibilità",
        label: "Cinture dei passeggeri funzionanti",
        safetyCritical: true,
      },
      { section: "Abitacolo", label: "Abitacolo pulito" },
      EXTINGUISHER,
    ],
  },
  {
    name: "Controllo mezzo",
    vehicleCategories: ["service_car", "civil_protection"],
    items: [...VEHICLE_ROUND, { section: "Abitacolo", label: "Abitacolo pulito" }, EXTINGUISHER],
  },
];
