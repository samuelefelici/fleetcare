"use client";

/**
 * Il modulo di accesso. I campi, i nomi e l'azione sono quelli di sempre
 * (`loginAction`): il modulo funziona anche prima che arrivi il JavaScript,
 * con i controlli del browser. Con il JavaScript in più:
 * - i messaggi dei campi non validi stanno sotto il campo, in italiano;
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
  const focusScheduled = useRef(false);
  useEffect(() => setMounted(true), []);

  const fieldOf = (el: EventTarget): LoginField | null => {
    const name = (el as HTMLInputElement).name;
    return name === "email" || name === "password" || name === "tenant" ? name : null;
  };

  // il browser segnala un campo non valido: il messaggio va sotto il campo,
  // al posto del fumetto, e il primo campo da correggere prende il focus
  // (col fumetto lo farebbe il browser)
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
        form.querySelector<HTMLElement>(":invalid")?.focus();
      });
    }
  }

  // mentre si corregge, il messaggio sparisce appena il campo torna valido
  function onInput(e: FormEvent<HTMLFormElement>) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const field = fieldOf(target);
    if (!field || !errors[field]) return;
    if (target.validity.valid) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  const multi = choices.length > 1;

  return (
    <form action={action} onInvalidCapture={onInvalid} onInput={onInput} className="space-y-5">
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
