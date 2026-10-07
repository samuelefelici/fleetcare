/**
 * Il testo di una conferma, separato dal componente perché si possa
 * provare senza DOM (tests/componenti.test.ts).
 */

export type ConfirmOptions = {
  /** la domanda: «Dismettere il mezzo AMB-03?» */
  title: string;
  /** cosa succede dopo, in una o due frasi */
  description?: string;
  /** il testo del pulsante che conferma: di solito quello del pulsante premuto */
  confirmLabel?: string;
  cancelLabel?: string;
  /** rosso per le azioni distruttive, arancio per le altre */
  tone?: "destructive" | "primary";
};

/**
 * Le pagine passano la conferma come una frase sola: «Dismettere il mezzo
 * X? Esce dalla flotta…». La domanda, fino al primo «?», diventa il titolo
 * del dialog e il resto la spiegazione. Una frase senza «?» è tutta titolo.
 */
export function splitQuestion(text: string): Pick<ConfirmOptions, "title" | "description"> {
  const t = text.trim();
  const i = t.indexOf("?");
  if (i === -1 || i === t.length - 1) return { title: t };
  const description = t.slice(i + 1).trim();
  return description ? { title: t.slice(0, i + 1), description } : { title: t.slice(0, i + 1) };
}

/**
 * La conferma che un modulo o un pulsante deve chiedere, o `null` se non ne
 * chiede. Un'azione distruttiva la chiede sempre: senza testo, con una
 * domanda generica.
 */
export function confirmFor({
  confirm,
  destructive,
  label,
}: {
  confirm: string | ConfirmOptions | undefined;
  destructive: boolean;
  /** il testo del pulsante premuto, che diventa quello del pulsante di conferma */
  label: string | undefined;
}): ConfirmOptions | null {
  if (confirm === undefined && !destructive) return null;
  const base: ConfirmOptions =
    confirm === undefined
      ? { title: "Confermi l'operazione?" }
      : typeof confirm === "string"
        ? splitQuestion(confirm)
        : confirm;
  return {
    ...base,
    confirmLabel: base.confirmLabel ?? label ?? "Conferma",
    tone: base.tone ?? (destructive ? "destructive" : "primary"),
  };
}
