"use client";

/**
 * Il modulo della persona nuova. È un componente client solo per poter
 * dire ad ActionForm dove andare dopo (la scheda appena creata, che
 * dipende dall'id restituito dall'azione): una funzione non si passa da
 * una pagina server a un componente client.
 */
import { ActionForm } from "@/components/form";
import { Field, inputClass } from "@/components/ui";
import { createPerson } from "@/server/actions/persone";

export function ModuloNuovaPersona({
  roles,
}: {
  roles: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <ActionForm
      action={createPerson}
      submitLabel="Crea la persona"
      successMessage="Persona creata"
      redirectTo={(id) => (id ? `/persone/${id}` : "/persone")}
    >
      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-semibold">Scheda</legend>
        <Field label="Nome e cognome" htmlFor="nome" required>
          <input id="nome" name="nome" required maxLength={120} className={inputClass} />
        </Field>
        <Field label="Ruolo" htmlFor="ruolo" required>
          <select id="ruolo" name="ruolo" required defaultValue="crew" className={inputClass}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Numero di tessera"
          htmlFor="tessera"
          hint="Facoltativo, unico nell'associazione"
        >
          <input id="tessera" name="tessera" maxLength={40} className={inputClass} />
        </Field>
        <div className="flex items-center gap-3">
          <input id="autista" name="autista" type="checkbox" className="size-5 accent-brand" />
          <label htmlFor="autista" className="text-sm font-medium text-zinc-800">
            È abilitato alla guida dei mezzi
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-200 pt-4">
        <legend className="mb-2 text-base font-semibold">Utenza (facoltativa)</legend>
        <p className="text-sm text-zinc-500">
          Con l'email la persona ha l'accesso all'app. Telefono e password si salvano con l'utenza,
          quindi senza email non si possono scrivere.
        </p>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            maxLength={200}
            className={inputClass}
          />
        </Field>
        <Field label="Telefono" htmlFor="telefono">
          <input id="telefono" name="telefono" type="tel" maxLength={40} className={inputClass} />
        </Field>
        <Field
          label="Password iniziale"
          htmlFor="password"
          hint="Almeno 10 caratteri. La persona la cambia poi dal proprio profilo."
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            maxLength={200}
            className={inputClass}
          />
        </Field>
      </fieldset>
    </ActionForm>
  );
}
