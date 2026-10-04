import type { Metadata } from "next";
import { ActionForm } from "@/components/form";
import {
  ButtonLink,
  Card,
  Details,
  EmptyState,
  Field,
  inputClass,
  PageHeader,
} from "@/components/ui";
import { fmtDayTime } from "@/lib/format";
import { changeOwnPassword, updateOwnPhone } from "@/server/actions/persone";
import { ROLE_LABELS, run } from "@/server/db";
import { getPerson } from "@/server/queries/persone";

export const metadata: Metadata = { title: "Il mio profilo" };
export const dynamic = "force-dynamic";

/** I propri dati e la propria password: l'unica parte dell'app che ogni ruolo scrive su di sé. */
export default async function ProfilePage() {
  const { me, ctx } = await run(async (tx, ctx) => ({
    me: await getPerson(tx, ctx.userId),
    ctx,
  }));

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Il mio profilo"
        subtitle={ctx.tenantName}
        actions={
          <ButtonLink href="/persone" variant="secondary">
            Tutte le persone
          </ButtonLink>
        }
      />

      {!me ? (
        <EmptyState>La tua persona non è più in rubrica: chiedi alla direzione.</EmptyState>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold">I miei dati</h2>
            <Details
              items={[
                ["Nome", me.fullName],
                ["Ruolo", ROLE_LABELS[me.role]],
                ["Associazione", ctx.tenantName],
                ["Numero di tessera", me.badgeNumber],
                ["Autista", me.isDriver ? "Sì" : "No"],
                ["Email", me.email],
                ["Telefono", me.phone],
                ["Ultimo accesso", fmtDayTime(me.lastLoginAt)],
              ]}
            />
            <p className="mt-3 text-xs text-zinc-500">
              Nome, ruolo, tessera ed email li cambia la direzione.
            </p>
          </Card>

          {!me.hasAccount ? (
            <EmptyState>Non hai ancora un'utenza: chiedi alla direzione.</EmptyState>
          ) : (
            <>
              <Card className="p-5">
                <h2 className="mb-3 text-lg font-semibold">Telefono</h2>
                <ActionForm
                  action={updateOwnPhone}
                  submitLabel="Salva il telefono"
                  submitVariant="secondary"
                  successMessage="Telefono salvato"
                >
                  <Field label="Telefono" htmlFor="telefono" hint="Facoltativo">
                    <input
                      id="telefono"
                      name="telefono"
                      type="tel"
                      autoComplete="tel"
                      maxLength={40}
                      defaultValue={me.phone ?? ""}
                      className={inputClass}
                    />
                  </Field>
                </ActionForm>
              </Card>

              <Card className="p-5">
                <h2 className="mb-3 text-lg font-semibold">Cambia la password</h2>
                <ActionForm
                  action={changeOwnPassword}
                  submitLabel="Cambia la password"
                  successMessage="Password cambiata"
                >
                  <Field label="Password attuale" htmlFor="attuale" required>
                    <input
                      id="attuale"
                      name="attuale"
                      type="password"
                      required
                      autoComplete="current-password"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Password nuova" htmlFor="nuova" required hint="Almeno 10 caratteri">
                    <input
                      id="nuova"
                      name="nuova"
                      type="password"
                      required
                      autoComplete="new-password"
                      maxLength={200}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Ripeti la password nuova" htmlFor="conferma" required>
                    <input
                      id="conferma"
                      name="conferma"
                      type="password"
                      required
                      autoComplete="new-password"
                      maxLength={200}
                      className={inputClass}
                    />
                  </Field>
                </ActionForm>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
