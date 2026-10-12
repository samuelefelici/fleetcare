/**
 * I messaggi sotto i campi della login, quando il browser li trova non
 * validi (vuoti, email scritta male). Sono gli stessi controlli di sempre
 * (`required`, `type="email"`): cambia solo che il messaggio sta sotto il
 * campo, in italiano, invece che nel fumetto del browser. Funzione pura,
 * provata in tests/login.test.ts.
 */

export type LoginField = "email" | "password" | "tenant";

/** Le parti di `ValidityState` che servono qui. */
export type Validity = { valid: boolean; valueMissing: boolean; typeMismatch: boolean };

export function fieldMessage(field: LoginField, v: Validity): string | null {
  if (v.valid) return null;
  if (v.valueMissing) {
    return field === "email"
      ? "Scrivi l'email."
      : field === "password"
        ? "Scrivi la password."
        : "Scegli l'associazione.";
  }
  if (field === "email" && v.typeMismatch)
    return "Non sembra un'email: manca qualcosa prima o dopo la @.";
  return "Controlla questo campo.";
}

/** Il messaggio generico sopra il pulsante, dall'errore che l'azione mette nell'indirizzo. */
export function loginError(code: string | undefined): string | null {
  if (!code) return null;
  return code === "disattivata"
    ? "La tua utenza è stata disattivata: chiedi alla direzione."
    : "Email o password non giuste. Riprova.";
}
