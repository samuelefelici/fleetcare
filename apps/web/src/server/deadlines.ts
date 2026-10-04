/**
 * Le scadenze che nascono con un mezzo o un'attrezzatura nuovi: dalle
 * regole del catalogo dell'associazione (`planDeadlines`, logica pura in
 * @fleetcare/db), dentro la stessa transazione dell'inserimento. Nascono
 * «da completare»: la prima data la scrive chi ha in mano il documento.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "@fleetcare/db";
import type { TenantTx } from "@fleetcare/db/client";
import {
  planDeadlines,
  type PlannableRule,
  type PlanSubject,
} from "@fleetcare/db/domain/deadlines";

export async function createDeadlinesFor(
  tx: TenantTx,
  tenantId: string,
  subjectId: string,
  subject: PlanSubject,
): Promise<number> {
  const rows = await tx
    .select({ rule: schema.deadlineRules, type: schema.deadlineTypes })
    .from(schema.deadlineRules)
    .innerJoin(
      schema.deadlineTypes,
      and(
        eq(schema.deadlineTypes.id, schema.deadlineRules.deadlineTypeId),
        eq(schema.deadlineTypes.tenantId, schema.deadlineRules.tenantId),
      ),
    )
    .where(isNull(schema.deadlineTypes.archivedAt));

  const rules: PlannableRule[] = rows.map(({ rule, type }) => ({
    deadlineTypeId: rule.deadlineTypeId,
    vehicleCategory: rule.vehicleCategory,
    equipmentTypeId: rule.equipmentTypeId,
    ownershipKinds: rule.ownershipKinds,
    intervalMonths: rule.intervalMonths,
    intervalDays: rule.intervalDays,
    intervalKm: rule.intervalKm,
    alertDays: rule.alertDays,
    alertKm: rule.alertKm,
    blocking: rule.blocking,
    type: {
      intervalMonths: type.intervalMonths,
      intervalDays: type.intervalDays,
      intervalKm: type.intervalKm,
      alertDays: type.alertDays,
      alertKm: type.alertKm,
      blocking: type.blocking,
      archived: type.archivedAt !== null,
      isVehicleTax: type.isVehicleTax,
    },
  }));

  const planned = planDeadlines(subject, rules);
  if (planned.length === 0) return 0;
  await tx.insert(schema.deadlines).values(
    planned.map((p) => ({
      tenantId,
      deadlineTypeId: p.deadlineTypeId,
      vehicleId: subject.kind === "vehicle" ? subjectId : null,
      equipmentId: subject.kind === "equipment" ? subjectId : null,
    })),
  );
  return planned.length;
}
