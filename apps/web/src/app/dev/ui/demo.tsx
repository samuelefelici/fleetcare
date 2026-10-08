"use client";

/**
 * Le parti interattive di /dev/ui: i toast, il dialog di conferma vero e
 * un invio che resta in attesa per due secondi.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { useConfirm } from "@/components/confirm-dialog";

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => toast.success("Salvato")}>
        Successo
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast.error("Targa già presente in questa associazione", { duration: 8000 })}
      >
        Errore
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast.warning("Revisione in scadenza", { description: "AMB-03 · entro il 12/11/2026" })
        }
      >
        Avvertenza
      </Button>
      <Button variant="secondary" onClick={() => toast.info("Dati aggiornati alle 14:32")}>
        Informazione
      </Button>
      <Button variant="secondary" onClick={() => toast.loading("Salvataggio in corso…")}>
        Attesa
      </Button>
      <Button variant="ghost" onClick={() => toast.dismiss()}>
        Chiudi tutti
      </Button>
    </div>
  );
}

export function ConfirmDemo() {
  const { confirm, dialog } = useConfirm();
  const [esito, setEsito] = useState<string>("nessuna scelta");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Dismettere il mezzo AMB-03 · FX123AB?",
              description: "Esce dalla flotta; resta in archivio con letture e scadenze.",
              confirmLabel: "Dismetti il mezzo",
              tone: "destructive",
            });
            setEsito(ok ? "confermato" : "annullato");
          }}
        >
          Dismetti il mezzo
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            const ok = await confirm({
              title: "Riattivare Mario Rossi?",
              description: "Potrà entrare di nuovo nell'app.",
              confirmLabel: "Riattiva",
              tone: "primary",
            });
            setEsito(ok ? "confermato" : "annullato");
          }}
        >
          Riattiva (conferma non distruttiva)
        </Button>
      </div>
      <p className="text-13 text-fg-secondary" aria-live="polite">
        Ultima scelta: <span className="font-mono text-fg">{esito}</span>
      </p>
      {dialog}
    </div>
  );
}

export function LoadingDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      loading={loading}
      onClick={() => {
        setLoading(true);
        setTimeout(() => setLoading(false), 2000);
      }}
    >
      Salva (attesa di 2 s)
    </Button>
  );
}
