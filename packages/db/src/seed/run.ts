/**
 * Seed: crea l'associazione (se non c'è), la sede principale e il catalogo
 * iniziale.
 *
 * Il catalogo si scrive **una volta sola**, alla nascita dell'associazione
 * (`tenants.catalog_seeded_at`). Da lì è dell'associazione: un secondo seed
 * non lo tocca, e in particolare non fa risorgere tipi, regole o dotazioni
 * che l'associazione ha eliminato. Rilanciarlo è sicuro: non fa niente.
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
    // for update: due seed in parallelo non scrivono il catalogo due volte
    const [tenant] = await tx
      .select({ id: schema.tenants.id, catalogSeededAt: schema.tenants.catalogSeededAt })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .for("update");
    if (!tenant) throw new Error("tenant non creato");
    if (tenant.catalogSeededAt) {
      console.log(
        `«${name}»: catalogo già scritto il ${tenant.catalogSeededAt.toISOString()}, non lo riscrivo`,
      );
      return;
    }
    const tenantId = tenant.id;

    await tx
      .insert(schema.sites)
      .values({ tenantId, name: "Sede principale", isHeadquarters: true })
      .onConflictDoNothing();

    // --- tipi di scadenza e di attrezzatura ---
    const deadlineTypeId = lookup(
      await tx
        .insert(schema.deadlineTypes)
        .values(DEADLINE_TYPES.map((d, i) => ({ ...d, tenantId, sortOrder: i * 10 })))
        .returning({ id: schema.deadlineTypes.id, code: schema.deadlineTypes.code }),
      "tipo di scadenza",
    );
    const equipmentTypeId = lookup(
      await tx
        .insert(schema.equipmentTypes)
        .values(EQUIPMENT_TYPES.map((e, i) => ({ ...e, tenantId, sortOrder: i * 10 })))
        .returning({ id: schema.equipmentTypes.id, code: schema.equipmentTypes.code }),
      "tipo di attrezzatura",
    );

    // --- regole ---
    const rules = await tx
      .insert(schema.deadlineRules)
      .values(
        DEADLINE_RULES.map(({ deadlineType, equipmentType, ...rule }) => ({
          ...rule,
          tenantId,
          deadlineTypeId: deadlineTypeId(deadlineType),
          equipmentTypeId: equipmentType ? equipmentTypeId(equipmentType) : null,
        })),
      )
      .returning({ id: schema.deadlineRules.id });

    // --- materiale di consumo e dotazione minima ---
    const supplyItemId = lookup(
      await tx
        .insert(schema.supplyItems)
        .values(SUPPLY_ITEMS.map((s) => ({ ...s, tenantId })))
        .returning({ id: schema.supplyItems.id, code: schema.supplyItems.code }),
      "articolo",
    );
    await tx.insert(schema.kitRequirements).values(
      KIT_REQUIREMENTS.map((k) => ({
        tenantId,
        vehicleCategory: k.vehicleCategory,
        equipmentTypeId: k.equipmentType ? equipmentTypeId(k.equipmentType) : null,
        supplyItemId: k.supplyItem ? supplyItemId(k.supplyItem) : null,
        minQuantity: String(k.minQuantity),
      })),
    );

    // --- check-list ---
    for (const template of CHECKLIST_TEMPLATES) {
      const [created] = await tx
        .insert(schema.checklistTemplates)
        .values({ tenantId, name: template.name, vehicleCategories: template.vehicleCategories })
        .returning({ id: schema.checklistTemplates.id });
      if (!created) throw new Error(`modello di check-list non creato: ${template.name}`);
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

    await tx
      .update(schema.tenants)
      .set({ catalogSeededAt: new Date() })
      .where(eq(schema.tenants.id, tenantId));
    console.log(
      `Seed «${name}»: ${DEADLINE_TYPES.length} tipi di scadenza, ${EQUIPMENT_TYPES.length} tipi di attrezzatura, ` +
        `${rules.length} regole, ${SUPPLY_ITEMS.length} articoli, ${KIT_REQUIREMENTS.length} voci di dotazione, ` +
        `${CHECKLIST_TEMPLATES.length} check-list`,
    );
  });
} finally {
  await client.end();
}
