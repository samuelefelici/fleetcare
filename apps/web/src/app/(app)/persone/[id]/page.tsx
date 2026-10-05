import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import * as schema from "@fleetcare/db";
import { ActionButton, ActionForm } from "@/components/form";
import { Badge, ButtonLink, Card, Details, Field, inputClass, PageHeader } from "@/components/ui";
import { fmtDay, fmtDayTime } from "@/lib/format";
import {
  setPersonActive,
  setPersonEmail,
  setPersonPassword,
  updatePerson,
} from "@/server/actions/persone";
import { hasRole, ROLE_LABELS, run } from "@/server/db";
import { getPerson } from "@/server/queries/persone";

export const metadata: Metadata = { title: "Persona" };
export const dynamic = "force-dynamic";

/**
 * La scheda di una persona. La rubrica la vedono tutti; la modifica, il
 * «Disattiva» e l'utenza sono della direzione. L'utenza la vede anche la
 * persona stessa (RLS: la propria riga), con il rimando al profilo.
 */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { person, ctx } = await run(async (tx, ctx) => ({
    person: await getPerson(tx, id),
    ctx,
  }));
  if (!person) notFound();

  const isAdmin = hasRole(ctx, ["admin"]);
  const isSelf = person.id === ctx.userId;
  // senza riga dell'utenza: per la direzione e per sé «non ce l'ha», per gli altri «non la vedi»
  const canSeeAccount = isAdmin || isSelf;

  const details: Array<[string, ReactNode]> = [
    ["Ruolo", ROLE_LABELS[person.role]],
    ["Numero di tessera", person.badgeNumber],
    ["Autista", person.isDriver ? "Sì" : "No"],
    ["Stato", person.active ? "Attiva" : "Disattivata"],
    ["In rubrica dal", fmtDay(person.createdAt)],
  ];
  if (canSeeAccount && person.hasAccount) {
    details.push(["Email", person.email], ["Telefono", person.phone]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={person.fullName}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {ROLE_LABELS[person.role]}
            {isSelf && <Badge tone="brand">sei tu</Badge>}
            {person.active ? (
              <Badge tone="ok">Attiva</Badge>
            ) : (
              <Badge tone="danger">Disattivata</Badge>
            )}
          </span>
        }
        actions={
          <>
            <ButtonLink href="/persone" variant="secondary">
              Tutte le persone
            </ButtonLink>
            {isAdmin && !isSelf && (
              <ActionButton
                action={setPersonActive.bind(null, person.id, !person.active)}
                variant={person.active ? "danger" : "primary"}
                confirm={
                  person.active
                    ? `Disattivare ${person.fullName}? Resta in rubrica ma non potrà più entrare nell'app.`
                    : `Riattivare ${person.fullName}? Potrà entrare di nuovo nell'app.`
                }
                successMessage={person.active ? "Persona disattivata" : "Persona riattivata"}
              >
                {person.active ? "Disattiva" : "Riattiva"}
              </ActionButton>
            )}
          </>
        }
      />

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold">Scheda</h2>
          <Details items={details} />
        </Card>

        {isAdmin && (
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Modifica la scheda</h2>
            <ActionForm action={updatePerson} successMessage="Scheda salvata">
              <input type="hidden" name="id" value={person.id} />
              <Field label="Nome e cognome" htmlFor="nome" required>
                <input
                  id="nome"
                  name="nome"
                  required
                  maxLength={120}
                  defaultValue={person.fullName}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Ruolo"
                htmlFor="ruolo"
                required
                hint={
                  isSelf ? "Il tuo ruolo lo cambia un altro membro della direzione." : undefined
                }
              >
                <select
                  id="ruolo"
                  name="ruolo"
                  required
                  defaultValue={person.role}
                  className={inputClass}
                >
                  {schema.profileRole.enumValues.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Numero di tessera"
                htmlFor="tessera"
                hint="Facoltativo, unico nell'associazione"
              >
                <input
                  id="tessera"
                  name="tessera"
                  maxLength={40}
                  defaultValue={person.badgeNumber ?? ""}
                  className={inputClass}
                />
              </Field>
              <div className="flex items-center gap-3">
                <input
                  id="autista"
                  name="autista"
                  type="checkbox"
                  defaultChecked={person.isDriver}
                  className="size-5 accent-brand"
                />
                <label htmlFor="autista" className="text-sm font-medium text-zinc-800">
                  È abilitato alla guida dei mezzi
                </label>
              </div>
              {person.hasAccount ? (
                <Field label="Telefono" htmlFor="telefono" hint="Si salva nell'utenza">
                  <input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    maxLength={40}
                    defaultValue={person.phone ?? ""}
                    className={inputClass}
                  />
                </Field>
              ) : (
                <p className="text-sm text-zinc-500">
                  Il telefono si salva nell'utenza: crea prima l'utenza con l'email, qui sotto.
                </p>
              )}
            </ActionForm>
          </Card>
        )}

        {canSeeAccount && (
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold">Utenza</h2>
            {person.hasAccount ? (
              <Details
                items={[
                  ["Email", person.email],
                  ["Telefono", person.phone],
                  ["Password", person.hasPassword ? "Impostata" : "Non ancora impostata"],
                  ["Ultimo accesso", fmtDayTime(person.lastLoginAt)],
                ]}
              />
            ) : (
              <p className="text-zinc-600">
                {isSelf ? "Non hai" : "Non ha"} ancora accesso all'app.
                {isAdmin && " Con un'email nasce l'utenza; poi imposta una password."}
              </p>
            )}

            {isSelf && person.hasAccount && (
              <p className="mt-4 text-sm">
                <ButtonLink href="/profilo" variant="secondary">
                  Cambia la tua password dal profilo
                </ButtonLink>
              </p>
            )}

            {isAdmin && (
              <div className="mt-5 space-y-6 border-t border-zinc-200 pt-5">
                <section>
                  <h3 className="mb-2 font-semibold">
                    {person.hasAccount ? "Cambia l'email" : "Crea l'utenza"}
                  </h3>
                  <ActionForm
                    action={setPersonEmail}
                    submitLabel={person.hasAccount ? "Cambia l'email" : "Crea l'utenza"}
                    submitVariant="secondary"
                    successMessage={person.hasAccount ? "Email cambiata" : "Utenza creata"}
                  >
                    <input type="hidden" name="id" value={person.id} />
                    <Field
                      label="Email"
                      htmlFor="utenza-email"
                      required
                      hint="Unica nell'associazione, maiuscole e minuscole non contano"
                    >
                      <input
                        id="utenza-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="off"
                        maxLength={200}
                        defaultValue={person.email ?? ""}
                        className={inputClass}
                      />
                    </Field>
                  </ActionForm>
                </section>

                {person.hasAccount && (
                  <section>
                    <h3 className="mb-2 font-semibold">Imposta una password nuova</h3>
                    <p className="mb-3 text-sm text-zinc-500">
                      Una password temporanea da comunicare alla persona, che poi la cambia dal
                      proprio profilo.
                    </p>
                    <ActionForm
                      action={setPersonPassword}
                      submitLabel="Imposta la password"
                      submitVariant="secondary"
                      successMessage="Password impostata"
                    >
                      <input type="hidden" name="id" value={person.id} />
                      <Field
                        label="Password temporanea"
                        htmlFor="utenza-password"
                        required
                        hint="Almeno 10 caratteri"
                      >
                        <input
                          id="utenza-password"
                          name="password"
                          type="password"
                          required
                          autoComplete="new-password"
                          maxLength={200}
                          className={inputClass}
                        />
                      </Field>
                    </ActionForm>
                  </section>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
