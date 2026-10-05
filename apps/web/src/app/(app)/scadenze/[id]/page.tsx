import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { evaluateDeadline, semaphore } from "@fleetcare/db/domain/deadlines";
import { ActionForm } from "@/components/form";
import {
  Badge,
  ButtonLink,
  Card,
  Details,
  Field,
  PageHeader,
  Semaphore,
  inputClass,
} from "@/components/ui";
import { fmtDay, fmtDayTime, fmtEur, fmtKm, todayRome } from "@/lib/format";
import { overrideDeadline, removeDeadline, setDeadlineDue } from "@/server/actions/scadenze";
import { EQUIPMENT, STAFF, hasRole, run } from "@/server/db";
import { getDeadline, listCompletions, listSuppliers } from "@/server/queries/scadenze";
import { CHI_GESTISCE, CHI_REGISTRA, RuoloNonAbilitato } from "../avvisi";
import {
  describeAlert,
  describeInterval,
  dueText,
  OUTCOME_LABELS,
  overriddenFields,
  stateText,
  subjectDismissed,
  subjectHref,
  subjectLabel,
  subjectListHref,
} from "../logica";
import { EliminaScadenza } from "./elimina";
import { RegistraAdempimento } from "./registra-adempimento";

export const metadata: Metadata = { title: "Scheda scadenza" };
export const dynamic = "force-dynamic";

const OUTCOME_TONE = { passed: "ok", conditional: "warn", failed: "danger" } as const;

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/**
 * La scheda di una scadenza: soggetto, tipo, valori effettivi (con le
 * correzioni a mano), scadenza attuale e base, storico degli adempimenti,
 * e i moduli: registrare un adempimento (STAFF), impostare la scadenza,
 * correggere a mano, eliminare (EQUIPMENT).
 */
export default async function DeadlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const data = await run(async (tx, ctx) => {
    const deadline = await getDeadline(tx, id);
    if (!deadline) return null;
    const completions = await listCompletions(tx, id);
    const canRecord = hasRole(ctx, STAFF);
    const suppliers = canRecord ? await listSuppliers(tx) : [];
    return { deadline, completions, suppliers, canRecord, canManage: hasRole(ctx, EQUIPMENT) };
  });
  if (!data) notFound();
  const { deadline: s, completions, suppliers, canRecord, canManage } = data;

  const today = todayRome();
  const isVehicle = s.vehicleId !== null;
  const odometerKm = isVehicle ? s.vehicleOdometerKm : null;
  const evaluation = evaluateDeadline(
    { dueOn: s.dueOn, dueKm: s.dueKm, alertDays: s.alertDays, alertKm: s.alertKm },
    today,
    odometerKm,
  );
  const { color } = semaphore([{ state: evaluation.state, blocking: s.blocking }]);
  const archived = s.archivedAt !== null;
  const hasKm = s.intervalKm !== null || s.dueKm !== null;
  const corrections = overriddenFields(s);
  const subject = subjectLabel(s);
  const backHref = subjectListHref(s);
  const yesNo = (b: boolean) => (b ? "Sì" : "No");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={backHref} className="underline">
          ← Scadenze di {subject}
        </Link>
        {" · "}
        <Link href="/scadenze" className="underline">
          Tutte le scadenze
        </Link>
      </p>
      <PageHeader
        title={s.label ? `${s.typeLabel} · ${s.label}` : s.typeLabel}
        subtitle={
          <>
            {isVehicle ? "Mezzo " : "Attrezzatura "}
            <Link href={subjectHref(s)} className="underline">
              {subject}
            </Link>
            {s.equipmentId && s.hostVehicleCode && (
              <>
                {" "}
                · a bordo di{" "}
                <Link href={`/mezzi/${s.hostVehicleId}`} className="underline">
                  {s.hostVehicleCode} · {s.hostVehiclePlate}
                </Link>
              </>
            )}
            {s.typeReference && ` · ${s.typeReference}`}
            {subjectDismissed(s) && (
              <span className="ml-2 align-middle">
                <Badge tone="neutral">{subjectDismissed(s)}</Badge>
              </span>
            )}
          </>
        }
        actions={
          <ButtonLink href={subjectHref(s)} variant="secondary">
            {isVehicle ? "Scheda del mezzo" : "Scheda dell'attrezzatura"}
          </ButtonLink>
        }
      />

      {archived && (
        <p role="status" className="mb-6 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-800">
          Scadenza archiviata il {fmtDayTime(s.archivedAt)}: non compare nello scadenzario né nel
          semaforo. Lo storico degli adempimenti resta qui sotto.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Stato</h2>
          <div className="mt-1 text-lg font-semibold">
            <Semaphore color={archived ? "grey" : color}>{stateText(evaluation)}</Semaphore>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Scadenza: {dueText(s.dueOn ? fmtDay(s.dueOn) : null, s.dueKm)}
          </p>
          {isVehicle && hasKm && (
            <p className="text-xs text-zinc-500">Km attuali del mezzo: {fmtKm(odometerKm)}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {s.blocking && (
              <Badge tone={evaluation.state === "expired" ? "danger" : "neutral"}>
                {isVehicle ? "Blocca il mezzo" : "Blocca l'attrezzatura"}
              </Badge>
            )}
            {corrections.length > 0 && <Badge tone="brand">Corretta a mano</Badge>}
            {s.completedByCrew && <Badge>La chiude l'equipaggio</Badge>}
            {s.documentRequired && <Badge>Serve il documento</Badge>}
          </div>
        </Card>

        <SectionCard title="Scadenza">
          <Details
            items={[
              ["Scadenza attuale", dueText(s.dueOn ? fmtDay(s.dueOn) : null, s.dueKm)],
              [
                "Base (scritta a mano)",
                s.baseDueOn || s.baseDueKm !== null
                  ? dueText(s.baseDueOn ? fmtDay(s.baseDueOn) : null, s.baseDueKm)
                  : null,
              ],
              [
                "Ultimo adempimento",
                s.lastDoneOn
                  ? `${fmtDay(s.lastDoneOn)}${s.lastDoneKm !== null ? ` · ${fmtKm(s.lastDoneKm)}` : ""}`
                  : null,
              ],
              ["Ultima modifica", fmtDayTime(s.updatedAt)],
            ]}
          />
          <p className="mt-3 text-xs text-zinc-500">
            La scadenza vale la più lontana fra la base scritta a mano e la prossima scadenza
            dell'ultimo adempimento valido.
          </p>
          {s.notes && (
            <div className="mt-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Note</div>
              <p className="text-sm whitespace-pre-line">{s.notes}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Regole in vigore">
          <Details
            items={[
              [
                "Periodicità",
                `${describeInterval(s, s.monthEnd)}${corrections.includes("periodicità") ? " (corretta a mano)" : ""}`,
              ],
              [
                "Preavviso",
                `${describeAlert(s.alertDays, s.alertKm, hasKm)}${corrections.includes("preavviso") ? " (corretto a mano)" : ""}`,
              ],
              [
                "Blocca se superata",
                `${yesNo(s.blocking)}${corrections.includes("blocco") ? " (corretto a mano)" : ""}`,
              ],
              [
                "Rinnovo",
                s.renewFromDue
                  ? `dall'anniversario della scadenza${
                      s.renewGraceDays !== null
                        ? `, con ${s.renewGraceDays} giorni di tolleranza`
                        : " (calendario fisso)"
                    }`
                  : "dal giorno dell'adempimento",
              ],
            ]}
          />
          <p className="mt-3 text-xs text-zinc-500">
            {corrections.length > 0
              ? "I valori corretti a mano vincono su regola e tipo; gli altri ereditano."
              : "Ereditati dalla regola della categoria o dal tipo di scadenza: correggere quelli corregge anche questa."}
          </p>
          {s.typeDescription && <p className="mt-2 text-sm text-zinc-600">{s.typeDescription}</p>}
        </SectionCard>
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-3 font-semibold">Storico degli adempimenti</h2>
        {completions.length === 0 ? (
          <p className="text-sm text-zinc-500">Nessun adempimento registrato.</p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {completions.map((c) => (
              <li
                key={c.id}
                className="grid gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr_1fr]"
              >
                <div>
                  <span className="font-medium">{fmtDay(c.doneOn)}</span>
                  {c.doneKm !== null && <span className="text-zinc-500"> · {fmtKm(c.doneKm)}</span>}
                  <div className="mt-1">
                    <Badge tone={OUTCOME_TONE[c.outcome]}>{OUTCOME_LABELS[c.outcome]}</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Prossima scadenza
                  </div>
                  {c.outcome === "failed"
                    ? "non sposta la scadenza"
                    : dueText(c.nextDueOn ? fmtDay(c.nextDueOn) : null, c.nextDueKm)}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Costo e documento
                  </div>
                  {fmtEur(c.costEur)}
                  {c.documentNumber && ` · n. ${c.documentNumber}`}
                  {c.supplierName && <div className="text-zinc-600">{c.supplierName}</div>}
                </div>
                <div className="text-zinc-600">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Registrato</div>
                  {fmtDayTime(c.createdAt)}
                  {c.recordedBy && <div className="text-xs text-zinc-500">{c.recordedBy}</div>}
                  {c.notes && <div className="mt-1 whitespace-pre-line">{c.notes}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!archived && (
        <>
          <Card className="mt-6 p-4">
            <h2 className="mb-1 font-semibold">Registra adempimento</h2>
            <p className="mb-3 text-sm text-zinc-500">
              Revisione passata, polizza rinnovata, bollo pagato, verifica fatta: la scadenza si
              sposta da sé alla prossima.
              {s.completedByCrew &&
                " Questa la chiude anche l'equipaggio, collegando la propria sanificazione: in questa versione dall'app la registrano i responsabili."}
            </p>
            {canRecord ? (
              <RegistraAdempimento
                key={completions.length}
                deadlineId={s.id}
                today={today}
                isVehicle={isVehicle}
                odometerKm={odometerKm}
                previousDueOn={s.dueOn}
                effective={{
                  intervalMonths: s.intervalMonths,
                  intervalDays: s.intervalDays,
                  intervalKm: s.intervalKm,
                  monthEnd: s.monthEnd,
                  renewFromDue: s.renewFromDue,
                  renewGraceDays: s.renewGraceDays,
                }}
                hasKm={isVehicle && hasKm}
                suppliers={suppliers}
                documentRequired={s.documentRequired}
              />
            ) : (
              <RuoloNonAbilitato cosa="Registrare un adempimento" chi={CHI_REGISTRA} />
            )}
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-1 font-semibold">Imposta la scadenza</h2>
              <p className="mb-3 text-sm text-zinc-500">
                La data (e i km) letti dal documento: diventano la base. La scadenza vale la più
                lontana fra la base e l'ultimo adempimento, quindi una data più vicina di quella
                fissata dall'adempimento viene rifiutata: si corregge l'adempimento. Vuoto = nessuna
                base.
              </p>
              {canManage ? (
                <ActionForm
                  action={setDeadlineDue}
                  submitLabel="Salva la scadenza"
                  successMessage="Scadenza salvata"
                >
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Data di scadenza" htmlFor="imposta-data">
                      <input
                        id="imposta-data"
                        name="data"
                        type="date"
                        defaultValue={s.dueOn ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    {isVehicle && (
                      <Field label="Scadenza in km" htmlFor="imposta-km">
                        <input
                          id="imposta-km"
                          name="km"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          defaultValue={s.dueKm ?? ""}
                          className={inputClass}
                        />
                      </Field>
                    )}
                  </div>
                  <Field label="Note" htmlFor="imposta-note">
                    <textarea
                      id="imposta-note"
                      name="note"
                      rows={3}
                      maxLength={2000}
                      defaultValue={s.notes ?? ""}
                      className={inputClass}
                    />
                  </Field>
                </ActionForm>
              ) : (
                <RuoloNonAbilitato cosa="Impostare la scadenza" chi={CHI_GESTISCE} />
              )}
            </Card>

            <Card className="p-4">
              <h2 className="mb-1 font-semibold">Correzione a mano</h2>
              <p className="mb-3 text-sm text-zinc-500">
                Periodicità, preavviso e blocco di questa sola scadenza (il tagliando di questo
                Ducato è a 40.000 km). Un campo vuoto eredita dalla regola della categoria o dal
                tipo.
              </p>
              {canManage ? (
                <ActionForm
                  action={overrideDeadline}
                  submitLabel="Salva la correzione"
                  successMessage="Correzione salvata"
                >
                  <input type="hidden" name="id" value={s.id} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      label="Periodicità in mesi"
                      htmlFor="correzione-mesi"
                      hint={`In vigore: ${s.intervalMonths !== null ? `${s.intervalMonths} mesi` : "—"}. Mesi oppure giorni, non entrambi.`}
                    >
                      <input
                        id="correzione-mesi"
                        name="mesi"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        defaultValue={s.ownIntervalMonths ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Periodicità in giorni"
                      htmlFor="correzione-giorni"
                      hint={`In vigore: ${s.intervalDays !== null ? `${s.intervalDays} giorni` : "—"}.`}
                    >
                      <input
                        id="correzione-giorni"
                        name="giorni"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        defaultValue={s.ownIntervalDays ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    {isVehicle && (
                      <>
                        <Field
                          label="Periodicità in km"
                          htmlFor="correzione-km"
                          hint={`In vigore: ${fmtKm(s.intervalKm)}.`}
                        >
                          <input
                            id="correzione-km"
                            name="km_periodo"
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            defaultValue={s.ownIntervalKm ?? ""}
                            className={inputClass}
                          />
                        </Field>
                        <Field
                          label="Preavviso in km"
                          htmlFor="correzione-preavviso-km"
                          hint={`In vigore: ${s.alertKm !== null ? fmtKm(s.alertKm) : "al raggiungimento"}.`}
                        >
                          <input
                            id="correzione-preavviso-km"
                            name="preavviso_km"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            defaultValue={s.ownAlertKm ?? ""}
                            className={inputClass}
                          />
                        </Field>
                      </>
                    )}
                    <Field
                      label="Preavviso in giorni"
                      htmlFor="correzione-preavviso-giorni"
                      hint={`In vigore: ${s.alertDays} giorni.`}
                    >
                      <input
                        id="correzione-preavviso-giorni"
                        name="preavviso_giorni"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        defaultValue={s.ownAlertDays ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Blocca se superata"
                      htmlFor="correzione-blocco"
                      hint={`In vigore: ${yesNo(s.blocking)}.`}
                    >
                      <select
                        id="correzione-blocco"
                        name="blocco"
                        defaultValue={s.ownBlocking === null ? "" : s.ownBlocking ? "si" : "no"}
                        className={inputClass}
                      >
                        <option value="">Eredita</option>
                        <option value="si">Sì</option>
                        <option value="no">No</option>
                      </select>
                    </Field>
                  </div>
                </ActionForm>
              ) : (
                <RuoloNonAbilitato cosa="Correggere periodicità e preavviso" chi={CHI_GESTISCE} />
              )}
            </Card>
          </div>

          {canManage && (
            <Card className="mt-6 p-4">
              <h2 className="mb-1 font-semibold">Elimina</h2>
              <EliminaScadenza
                action={removeDeadline.bind(null, s.id)}
                hasHistory={completions.length > 0}
                backHref={backHref}
              />
            </Card>
          )}
        </>
      )}
    </>
  );
}
