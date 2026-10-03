/**
 * Seed: crea l'associazione (se non c'è), la sede principale e il catalogo
 * iniziale. Idempotente: si può rilanciare, non duplica e non sovrascrive
 * ciò che è stato modificato dall'applicazione.
 *
 * Gira con il ruolo owner (DATABASE_ADMIN_URL), quindi fuori dalla RLS.
 * Non crea mezzi né utenti: il parco vero si carica dai dati reali.
 *
 * `pnpm db:seed`
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import {
  CHECKLIST_TEMPLATES,
  DEADLINE_RULES,
  DEADLINE_TYPES,
  EQUIPMENT_TYPES,
  KIT_REQUIREMENTS,
  SUPPLY_ITEMS,
} from "./catalog";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL mancante");
  process.exit(1);
}
const slug = process.env.SEED_TENANT_SLUG ?? "croce-gialla-camerano";
const name = process.env.SEED_TENANT_NAME ?? "Croce Gialla di Camerano";

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

/** codice → id, fallendo forte se il catalogo cita un codice che non esiste */
function lookup(rows: { id: string; code: string }[], what: string) {
  const map = new Map(rows.map((r) => [r.code, r.id]));
  return (code: string): string => {
    const id = map.get(code);
    if (!id) throw new Error(`${what} sconosciuto nel catalogo: ${code}`);
    return id;
  };
}

try {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.tenants)
      .values({ name, slug, network: "ANPAS", city: "Camerano", province: "AN" })
      .onConflictDoNothing({ target: schema.tenants.slug });
    const [tenant] = await tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug));
    if (!tenant) throw new Error("tenant non creato");
    const tenantId = tenant.id;

    await tx
      .insert(schema.sites)
      .values({ tenantId, name: "Sede principale", isHeadquarters: true })
      .onConflictDoNothing();

    // --- tipi di scadenza ---
    await tx
      .insert(schema.deadlineTypes)
      .values(DEADLINE_TYPES.map((d, i) => ({ ...d, tenantId, sortOrder: i * 10 })))
      .onConflictDoNothing();
    const deadlineTypeId = lookup(
      await tx
        .select({ id: schema.deadlineTypes.id, code: schema.deadlineTypes.code })
        .from(schema.deadlineTypes)
        .where(eq(schema.deadlineTypes.tenantId, tenantId)),
      "tipo di scadenza",
    );

    // --- tipi di attrezzatura ---
    await tx
      .insert(schema.equipmentTypes)
      .values(EQUIPMENT_TYPES.map((e, i) => ({ ...e, tenantId, sortOrder: i * 10 })))
      .onConflictDoNothing();
    const equipmentTypeId = lookup(
      await tx
        .select({ id: schema.equipmentTypes.id, code: schema.equipmentTypes.code })
        .from(schema.equipmentTypes)
        .where(eq(schema.equipmentTypes.tenantId, tenantId)),
      "tipo di attrezzatura",
    );

    // --- regole ---
    await tx
      .insert(schema.deadlineRules)
      .values(
        DEADLINE_RULES.map(({ deadlineType, equipmentType, ...rule }) => ({
          ...rule,
          tenantId,
          deadlineTypeId: deadlineTypeId(deadlineType),
          equipmentTypeId: equipmentType ? equipmentTypeId(equipmentType) : null,
        })),
      )
      .onConflictDoNothing();

    // --- materiale di consumo e dotazione minima ---
    await tx
      .insert(schema.supplyItems)
      .values(SUPPLY_ITEMS.map((s) => ({ ...s, tenantId })))
      .onConflictDoNothing();
    const supplyItemId = lookup(
      await tx
        .select({ id: schema.supplyItems.id, code: schema.supplyItems.code })
        .from(schema.supplyItems)
        .where(eq(schema.supplyItems.tenantId, tenantId)),
      "articolo",
    );
    await tx
      .insert(schema.kitRequirements)
      .values(
        KIT_REQUIREMENTS.map((k) => ({
          tenantId,
          vehicleCategory: k.vehicleCategory,
          equipmentTypeId: k.equipmentType ? equipmentTypeId(k.equipmentType) : null,
          supplyItemId: k.supplyItem ? supplyItemId(k.supplyItem) : null,
          minQuantity: String(k.minQuantity),
        })),
      )
      .onConflictDoNothing();

    // --- check-list: le voci si scrivono solo per un modello appena creato ---
    for (const template of CHECKLIST_TEMPLATES) {
      const [created] = await tx
        .insert(schema.checklistTemplates)
        .values({ tenantId, name: template.name, vehicleCategories: template.vehicleCategories })
        .onConflictDoNothing()
        .returning({ id: schema.checklistTemplates.id });
      if (!created) continue;
      await tx.insert(schema.checklistTemplateItems).values(
        template.items.map((item, i) => ({
          tenantId,
          templateId: created.id,
          section: item.section,
          label: item.label,
          kind: item.kind ?? "check",
          unit: item.unit ?? null,
          minValue: item.minValue === undefined ? null : String(item.minValue),
          safetyCritical: item.safetyCritical ?? false,
          equipmentTypeId: item.equipmentType ? equipmentTypeId(item.equipmentType) : null,
          supplyItemId: item.supplyItem ? supplyItemId(item.supplyItem) : null,
          sortOrder: i * 10,
        })),
      );
    }

    const templates = await tx
      .select({ id: schema.checklistTemplates.id })
      .from(schema.checklistTemplates)
      .where(eq(schema.checklistTemplates.tenantId, tenantId));
    console.log(
      `Seed «${name}»: ${DEADLINE_TYPES.length} tipi di scadenza, ${EQUIPMENT_TYPES.length} tipi di attrezzatura, ` +
        `${DEADLINE_RULES.length} regole, ${SUPPLY_ITEMS.length} articoli, ${templates.length} check-list`,
    );
  });
} finally {
  await client.end();
}
