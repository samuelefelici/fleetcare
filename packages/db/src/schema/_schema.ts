import { foreignKey, pgSchema, unique, type AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Tutto FleetCare vive nello schema Postgres `fleetcare`, non in `public`.
 *
 * Il database è dedicato (non quello di Cerbero, dove uno schema
 * `fleetcare` esiste già ed è del modulo TPL). Uno schema con nome resta
 * comunque una protezione a costo zero: se un giorno il database dovesse
 * ospitare altro, le tabelle non si pestano i piedi, e il ruolo
 * applicativo ha grant solo qui.
 */
export const fleetcareSchema = pgSchema("fleetcare");

/*
 * CHIAVI ESTERNE DENTRO L'ASSOCIAZIONE.
 *
 * Ogni riferimento fra tabelle di un'associazione è una chiave composta
 * (tenant_id, x_id) → (tenant_id, id). Con una chiave sul solo id, un
 * utente dell'associazione B potrebbe scrivere nel proprio spazio una riga
 * che punta a un mezzo, a una persona o a una scadenza di A: la RLS non lo
 * vede (il controllo delle chiavi esterne la ignora) e A ne subirebbe gli
 * effetti senza poterli vedere — credenziali agganciate a una sua persona,
 * km falsati, cancellazioni bloccate. Con la chiave composta il database
 * rifiuta il riferimento a monte.
 *
 * Il genitore espone `unique (tenant_id, id)` con `tenantKey`, il figlio
 * dichiara il riferimento con `tenantFk`. Una colonna nulla non viene
 * controllata (MATCH SIMPLE), come con una chiave normale.
 */

interface TenantScoped {
  tenantId: AnyPgColumn;
  id: AnyPgColumn;
}

/** `unique (tenant_id, id)`: rende la tabella referenziabile da `tenantFk`. */
export function tenantKey(table: string, t: TenantScoped) {
  return unique(`${table}_tenant_id_uq`).on(t.tenantId, t.id);
}

/** Riferimento (tenant_id, colonna) → genitore (tenant_id, id). */
export function tenantFk(
  name: string,
  tenantId: AnyPgColumn,
  column: AnyPgColumn,
  parent: TenantScoped,
  onDelete?: "cascade",
) {
  const fk = foreignKey({
    name,
    columns: [tenantId, column],
    foreignColumns: [parent.tenantId, parent.id],
  });
  return onDelete ? fk.onDelete(onDelete) : fk;
}
