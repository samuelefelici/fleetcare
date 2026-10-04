/**
 * Variabili d'ambiente dell'app, validate all'avvio: se ne manca una il
 * processo non parte (invece di fallire alla prima richiesta). In
 * produzione vivono solo in Coolify (docs/deploy-coolify.md).
 * SKIP_ENV_VALIDATION=1 serve al `next build` nell'immagine, dove non ci sono.
 */
import { z } from "zod";

const envSchema = z.object({
  /** ruolo fleetcare_app, mai l'amministratore (lo controlla anche l'avvio del container) */
  DATABASE_URL: z.string().min(1),
  /** firma dei cookie di sessione: openssl rand -base64 32 */
  AUTH_SECRET: z.string().min(16),
  /**
   * L'indirizzo pubblico dell'app (https://fleetcare-….samuelefelici.com):
   * Auth.js lo usa per i redirect dopo l'accesso. Senza, si fida degli
   * header del proxy; con un indirizzo esplicito non c'è niente da
   * indovinare. La legge Auth.js da sola da process.env.
   */
  AUTH_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION) return process.env as unknown as Env;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "[fleetcare] variabili d'ambiente non valide:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Configurazione non valida");
  }
  return parsed.data;
}

export const env = loadEnv();
