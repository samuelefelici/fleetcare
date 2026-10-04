/**
 * Autocontrollo dell'installazione, con la connessione dell'app.
 *
 * Le regole su chi vede che cosa stanno nel database, legate al ruolo
 * `fleetcare_app`. Se l'app si collega come superutente (basta riusare la
 * stringa dell'amministratore) funziona identica, e le protezioni non
 * toccano nessuno: non si rompe niente, ed è proprio questo il pericolo.
 * Questo controllo lo rende visibile: lo esegue il container all'avvio
 * (che non parte se fallisce) e l'healthcheck.
 */
import type postgres from "postgres";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SelfCheck {
  ok: boolean;
  checks: Check[];
}

export async function selfCheck(sql: postgres.Sql): Promise<SelfCheck> {
  const checks: Check[] = [];
  try {
    const [who] = await sql<
      { user: string; db: string; superuser: boolean; bypassrls: boolean; temp: boolean }[]
    >`
      select current_user as user, current_database() as db,
             r.rolsuper as superuser, r.rolbypassrls as bypassrls,
             has_database_privilege(current_user, current_database(), 'TEMP') as temp
        from pg_roles r where r.rolname = current_user`;
    checks.push({ name: "database", ok: true, detail: `«${who!.db}» come «${who!.user}»` });
    checks.push({
      name: "ruolo applicativo",
      ok: who!.user === "fleetcare_app" && !who!.superuser && !who!.bypassrls,
      detail:
        who!.superuser || who!.bypassrls
          ? `«${who!.user}» scavalca la RLS: DATABASE_URL deve usare fleetcare_app`
          : who!.user === "fleetcare_app"
            ? "fleetcare_app, soggetto alla RLS"
            : `«${who!.user}» non è fleetcare_app: le policy valgono solo per quel ruolo`,
    });
    checks.push({
      name: "oggetti temporanei",
      ok: !who!.temp,
      detail: who!.temp
        ? "il ruolo può creare tabelle temporanee (e falsare pg_trigger_depth): manca il revoke"
        : "non consentiti",
    });

    const [rls] = await sql<{ tables: number; without: string | null }[]>`
      select count(*)::int as tables,
             string_agg(c.relname, ', ') filter (where not c.relrowsecurity) as without
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'fleetcare' and c.relkind = 'r'`;
    // dopo un restore fatto nell'ordine sbagliato (il ruolo creato dopo il
    // ripristino) mancano i grant e le policy legate a fleetcare_app: l'app
    // partirebbe e vedrebbe tutto vuoto
    const [grants] = await sql<{ usage: boolean; missing: string | null }[]>`
      select coalesce((select has_schema_privilege(current_user, oid, 'USAGE')
                         from pg_namespace where nspname = 'fleetcare'), false) as usage,
             (select string_agg(c.relname, ', ')
                from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'fleetcare' and c.relkind in ('r', 'v')
                 and c.relname <> 'document_counters'
                 and not has_table_privilege(current_user, c.oid, 'SELECT')) as missing`;
    checks.push({
      name: "permessi",
      ok: grants!.usage && grants!.missing === null,
      detail: !grants!.usage
        ? "nessun accesso allo schema fleetcare"
        : grants!.missing === null
          ? "lettura su tutte le tabelle"
          : `manca la lettura su: ${grants!.missing}`,
    });
    const [policies] = await sql<{ missing: string | null }[]>`
      select string_agg(c.relname, ', ') as missing
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'fleetcare' and c.relkind = 'r'
         and (select count(*) from pg_policies p
               where p.schemaname = 'fleetcare' and p.tablename = c.relname
                 and p.policyname in ('tenant_isolation', 'known_role')) < 2`;
    checks.push({
      name: "policy",
      ok: policies!.missing === null,
      detail:
        policies!.missing === null
          ? "isolamento e ruolo valido su ogni tabella"
          : `mancano su: ${policies!.missing}`,
    });
    checks.push({
      name: "RLS",
      ok: rls!.tables > 0 && rls!.without === null,
      detail:
        rls!.tables === 0
          ? "schema fleetcare vuoto: migration non applicate"
          : rls!.without === null
            ? `attiva su ${rls!.tables} tabelle`
            : `spenta su: ${rls!.without}`,
    });
  } catch (error) {
    checks.push({ name: "database", ok: false, detail: (error as Error).message });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

export function describeSelfCheck(result: SelfCheck): string {
  return result.checks.map((c) => `  ${c.ok ? "ok " : "NO "} ${c.name}: ${c.detail}`).join("\n");
}
