import { pgSchema } from "drizzle-orm/pg-core";

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
