/**
 * I componenti dell'interfaccia, per la parte che si prova senza DOM: il
 * testo delle conferme e la regola dei colori (solo token) nei file che
 * hanno già finito il passaggio al tema nuovo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmFor, splitQuestion } from "@/components/confirm-text";
import { buttonClass, describedBy, isDestructive } from "@/components/ui";

describe("splitQuestion", () => {
  it("la domanda fino al primo «?» è il titolo, il resto la spiegazione", () => {
    expect(
      splitQuestion(
        "Dismettere il mezzo AMB-03 · FX123AB? Esce dalla flotta; resta in archivio con letture e scadenze.",
      ),
    ).toEqual({
      title: "Dismettere il mezzo AMB-03 · FX123AB?",
      description: "Esce dalla flotta; resta in archivio con letture e scadenze.",
    });
  });

  it("una sola domanda, o una frase senza «?», è tutta titolo", () => {
    expect(splitQuestion("Riattivare Mario Rossi?")).toEqual({ title: "Riattivare Mario Rossi?" });
    expect(splitQuestion("  Procedo con la dismissione  ")).toEqual({
      title: "Procedo con la dismissione",
    });
    expect(splitQuestion("Archiviare?   ")).toEqual({ title: "Archiviare?" });
  });
});

describe("confirmFor", () => {
  it("niente conferma se non è chiesta e l'azione non è distruttiva", () => {
    expect(confirmFor({ confirm: undefined, destructive: false, label: "Salva" })).toBeNull();
  });

  it("un'azione distruttiva la chiede sempre, anche senza testo", () => {
    expect(confirmFor({ confirm: undefined, destructive: true, label: "Dismetti" })).toEqual({
      title: "Confermi l'operazione?",
      confirmLabel: "Dismetti",
      tone: "destructive",
    });
  });

  it("il pulsante di conferma prende il testo del pulsante premuto e il tono dall'azione", () => {
    expect(
      confirmFor({
        confirm: "Riattivare Mario Rossi? Potrà entrare di nuovo nell'app.",
        destructive: false,
        label: "Riattiva",
      }),
    ).toEqual({
      title: "Riattivare Mario Rossi?",
      description: "Potrà entrare di nuovo nell'app.",
      confirmLabel: "Riattiva",
      tone: "primary",
    });
    expect(
      confirmFor({ confirm: "Disattivare Anna?", destructive: true, label: undefined }),
    ).toMatchObject({ confirmLabel: "Conferma", tone: "destructive" });
  });

  it("le opzioni passate per esteso vincono", () => {
    expect(
      confirmFor({
        confirm: { title: "Archiviare?", confirmLabel: "Archivia", tone: "primary" },
        destructive: true,
        label: "Elimina",
      }),
    ).toEqual({ title: "Archiviare?", confirmLabel: "Archivia", tone: "primary" });
  });
});

describe("pulsanti e campi", () => {
  it("«danger», il nome di prima, è la variante distruttiva", () => {
    expect(buttonClass("danger")).toBe(buttonClass("destructive"));
    expect(isDestructive("danger")).toBe(true);
    expect(isDestructive("destructive")).toBe(true);
    expect(isDestructive("secondary")).toBe(false);
  });

  it("aria-describedby punta solo ai testi che ci sono", () => {
    expect(describedBy("targa", {})).toBeUndefined();
    expect(describedBy("targa", { hint: "Senza spazi" })).toBe("targa-aiuto");
    expect(describedBy("targa", { hint: "x", error: "y" })).toBe("targa-aiuto targa-errore");
  });
});

/**
 * I file che usano solo i token: nessun esadecimale, nessuna classe della
 * tavolozza di Tailwind, nessun alias del ponte (`brand`, `danger` come
 * colore). La lista cresce con le PR; con la PR7 la copre tutta `src`.
 */
const SOLO_TOKEN = [
  "src/components/ui.tsx",
  "src/components/button.tsx",
  "src/components/icons.tsx",
  "src/components/form.tsx",
  "src/components/data-table.tsx",
  "src/components/confirm-dialog.tsx",
  "src/app/dev/ui/page.tsx",
  "src/app/dev/ui/demo.tsx",
  "src/app/(app)/scadenze/[id]/elimina.tsx",
];

const PALETTE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to|accent|caret|decoration|placeholder|shadow)-(?:white|black|brand|brand-ink|danger|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;

describe("solo token nei file passati al tema nuovo", () => {
  it.each(SOLO_TOKEN)("%s", (file) => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const lines = source.split("\n");
    const offending = lines
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => PALETTE.test(line) || HEX.test(line));
    expect(offending).toEqual([]);
  });
});
