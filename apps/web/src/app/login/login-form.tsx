"use client";

/**
 * Il modulo di accesso. I campi, i nomi e l'azione sono quelli di sempre
 * (`loginAction`): il modulo funziona anche prima che arrivi il JavaScript,
 * con i controlli del browser. Con il JavaScript in più:
 * - i messaggi dei campi non validi stanno sotto il campo, in italiano, e
 *   il lettore di schermo li legge (spostando il focus sul campo, o con una
 *   regione live se il focus è già lì);
 * - il pulsante per mostrare o nascondere la password (senza JavaScript non
 *   comparirebbe a fare niente: c'è solo dopo l'idratazione, dentro il campo,
 *   senza spostare niente);
 * - lo spinner nel pulsante mentre l'accesso è in corso.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { IconEye, IconEyeOff } from "@/components/icons";
import { Alert, describedBy, Field, Input, Select } from "@/components/ui";
import type { TenantChoice } from "./choices";
import { fieldMessage, type LoginField } from "./validazione";

type Errors = Partial<Record<LoginField, string>>;

const LABELS: Record<LoginField, string> = {
  email: "Email",
  password: "Password",
  tenant: "Associazione",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Accesso in corso…" className="w-full">
      Entra
    </Button>
  );
}

export function LoginForm({
  action,
  email,
  choices,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  email: string;
  choices: TenantChoice[];
  /** l'errore generico, già in parole (credenziali, utenza disattivata) */
  error: string | null;
}) {
  const [errors, setErrors] = useState<Errors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const focusScheduled = useRef(false);
  const announceTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    setMounted(true);
    return () => window.clearTimeout(announceTimer.current);
  }, []);

  const fieldOf = (el: EventTarget): LoginField | null => {
    const name = (el as HTMLInputElement).name;
    return name === "email" || name === "password" || name === "tenant" ? name : null;
  };

  // il messaggio va detto anche a voce: svuotare la regione e riscriverla
  // poco dopo, così il lettore di schermo lo ripete anche se è lo stesso
  function announce(text: string) {
    window.clearTimeout(announceTimer.current);
    setAnnouncement("");
    announceTimer.current = window.setTimeout(() => setAnnouncement(text), 100);
  }

  // il browser segnala un campo non valido: il messaggio va sotto il campo,
  // al posto del fumetto, e il primo campo da correggere prende il focus
  // (col fumetto lo farebbe il browser). Se il focus è già lì (Invio nel
  // campo sbagliato) spostarlo non fa leggere niente: lo dice la regione live.
  function onInvalid(e: FormEvent<HTMLFormElement>) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const field = fieldOf(target);
    if (!field) return;
    e.preventDefault();
    const message = fieldMessage(field, target.validity);
    setErrors((prev) => ({ ...prev, [field]: message ?? undefined }));
    if (!focusScheduled.current) {
      focusScheduled.current = true;
      const form = e.currentTarget;
      queueMicrotask(() => {
        focusScheduled.current = false;
        const first = form.querySelector<HTMLInputElement | HTMLSelectElement>(":invalid");
        if (!first) return;
        if (document.activeElement !== first) {
          first.focus();
          return;
        }
        const f = fieldOf(first);
        const text = f && fieldMessage(f, first.validity);
        if (f && text) announce(`${LABELS[f]}: ${text}`);
      });
    }
  }

  // mentre si corregge, il messaggio sparisce appena non è più quello giusto
  // (il campo è valido, o «Scrivi l'email.» quando qualcosa c'è scritto); il
  // messaggio nuovo, se serve, arriva al prossimo invio, non mentre si scrive.
  // È onChange: in React ascolta sia `input` sia `change`, che è l'unico
  // evento di certi gestori di password quando riempiono i campi.
  function onChange(e: FormEvent<HTMLFormElement>) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const field = fieldOf(target);
    if (!field || !errors[field]) return;
    if (fieldMessage(field, target.validity) !== errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      window.clearTimeout(announceTimer.current);
      setAnnouncement("");
    }
  }

  const multi = choices.length > 1;

  return (
    <form
      action={action}
      onInvalidCapture={onInvalid}
      onChange={onChange}
      // la password parte come password anche se era mostrata: i gestori di
      // password riconoscono il campo dal tipo. Il FormData non cambia.
      onSubmit={() => setShowPassword(false)}
      className="space-y-5"
    >
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>
      {multi && (
        <Alert tone="info">
          Sei in più di un&apos;associazione: scegli quale, e rimetti la password.
        </Alert>
      )}
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={email}
          invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", { error: errors.email })}
        />
      </Field>
      {multi && (
        <Field label="Associazione" htmlFor="tenant" error={errors.tenant}>
          <Select
            id="tenant"
            name="tenant"
            required
            invalid={Boolean(errors.tenant)}
            aria-describedby={describedBy("tenant", { error: errors.tenant })}
          >
            {choices.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Password" htmlFor="password" error={errors.password}>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            invalid={Boolean(errors.password)}
            aria-describedby={describedBy("password", { error: errors.password })}
            className="pr-11 pointer-coarse:pr-12"
          />
          {mounted && (
            <button
              type="button"
              aria-pressed={showPassword}
              aria-controls="password"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-sm text-fg-secondary hover:text-fg pointer-coarse:w-11"
            >
              {showPassword ? <IconEyeOff className="size-5" /> : <IconEye className="size-5" />}
              <span className="sr-only">Mostra la password</span>
            </button>
          )}
        </div>
      </Field>
      {error && <Alert tone="critical">{error}</Alert>}
      <SubmitButton />
    </form>
  );
}
