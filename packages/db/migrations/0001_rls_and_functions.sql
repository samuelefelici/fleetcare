-- ============================================================
-- FleetCare — ruolo applicativo, regole del database, RLS
--
-- L'app si connette con `fleetcare_app` (NON superuser, soggetto a RLS).
-- Ogni transazione apre il contesto con
--   set_config('app.tenant_id' | 'app.user_id' | 'app.role', …, true)
-- (vedi `withTenant` in src/client.ts).
--
-- Struttura delle policy, uguale per ogni tabella:
--   1. una policy PERMISSIVE di isolamento tenant (tenant_id = contesto);
--   2. policy RESTRICTIVE per comando che restringono per ruolo.
-- Una riga passa se soddisfa la permissiva E tutte le restrittive del
-- comando: l'isolamento tenant non si può dimenticare aggiungendo un ruolo.
-- I ruoli si controllano sempre per elenco positivo: un ruolo assente o
-- sconosciuto non ottiene niente (si chiude, non si apre).
--
-- Indice:
--   ruolo e grant · helper · updated_at · audit · contachilometri · login
--   numerazione · scadenze (coerenza, vista effettiva, adempimenti,
--   eliminazione) · check-list · notifiche · RLS
-- ============================================================

-- ---------- ruolo applicativo ----------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fleetcare_app') then
    -- password di sviluppo: in produzione cambiarla (ALTER ROLE fleetcare_app PASSWORD '…')
    create role fleetcare_app login password 'fleetcare_app';
  end if;
end
$$;

grant usage on schema fleetcare to fleetcare_app;
grant select, insert, update, delete on all tables in schema fleetcare to fleetcare_app;
alter default privileges in schema fleetcare
  grant select, insert, update, delete on tables to fleetcare_app;
-- l'audit si scrive solo dal trigger
revoke insert, update, delete on fleetcare.audit_logs from fleetcare_app;
-- i tenant si leggono e si aggiornano, non si creano né cancellano dall'app
revoke insert, delete on fleetcare.tenants from fleetcare_app;
-- la numerazione passa solo da next_document_number: un contatore azzerato
-- a mano farebbe fallire ogni segnalazione successiva
revoke insert, update, delete on fleetcare.document_counters from fleetcare_app;
alter role fleetcare_app set search_path = fleetcare, public;

-- ---------- helper contesto ----------
create or replace function fleetcare.app_tenant_id() returns uuid
  language sql stable as
$$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function fleetcare.app_user_id() returns uuid
  language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function fleetcare.app_role() returns text
  language sql stable as
$$ select nullif(current_setting('app.role', true), '') $$;

create or replace function fleetcare.app_has_role(variadic roles text[]) returns boolean
  language sql stable as
$$ select coalesce(fleetcare.app_role() = any(roles), false) $$;

-- i responsabili: tutti tranne l'equipaggio. Elenco positivo, mai «non crew».
create or replace function fleetcare.app_is_staff() returns boolean
  language sql stable as
$$ select fleetcare.app_has_role('fleet_manager', 'equipment_manager', 'admin_finance', 'admin') $$;

-- ---------- updated_at automatico, su ogni tabella che ce l'ha ----------
create or replace function fleetcare.set_updated_at() returns trigger
  language plpgsql as
$$
begin
  new.updated_at = now();
  return new;
end
$$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'fleetcare' and c.column_name = 'updated_at'
       and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on fleetcare.%1$I
       for each row execute function fleetcare.set_updated_at()', t);
  end loop;
end
$$;

-- ---------- audit log: SECURITY DEFINER per scrivere bypassando la RLS ----------
create or replace function fleetcare.audit_row_change() returns trigger
  language plpgsql security definer set search_path = fleetcare, public as
$$
begin
  if tg_op = 'DELETE' then
    insert into fleetcare.audit_logs (tenant_id, table_name, row_id, action, actor_id, diff)
    values (old.tenant_id, tg_table_name, old.id, tg_op, fleetcare.app_user_id(), to_jsonb(old));
    return old;
  end if;
  insert into fleetcare.audit_logs (tenant_id, table_name, row_id, action, actor_id, diff)
  values (new.tenant_id, tg_table_name, new.id, tg_op, fleetcare.app_user_id(),
          case when tg_op = 'UPDATE'
               then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
               else to_jsonb(new) end);
  return new;
end
$$;

-- le tabelle dove una modifica deve poter essere ricostruita: stato dei
-- mezzi, scadenze e adempimenti (documentazione ispettiva), la
-- configurazione degli scadenzari e delle check-list (ogni associazione la
-- cambia da sé), le check-list compilate, ruoli delle persone, costi, denaro.
-- `profile_accounts` NO: il diff finirebbe nell'audit con l'hash della password.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'vehicles', 'equipment',
    'deadline_types', 'deadline_rules', 'deadlines', 'deadline_completions',
    'checklist_templates', 'checklist_template_items', 'checklists',
    'maintenance_jobs', 'vehicle_downtimes', 'accidents',
    'fuel_logs', 'fuel_invoices', 'fuel_invoice_lines'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on fleetcare.%1$I
       for each row execute function fleetcare.audit_row_change()', t);
  end loop;
end
$$;

-- ============================================================
-- CONTACHILOMETRI
--
-- Il km di un mezzo è un dato DERIVATO: vale l'ultima lettura registrata,
-- o i km d'ingresso in flotta se non ce n'è nessuna. Tre trigger:
--  * prima di scrivere una lettura si valida: non nel futuro, non sotto
--    una precedente (né sotto i km d'ingresso), non sopra una successiva.
--    Vale anche per le correzioni, escludendo dal confronto la riga
--    stessa. Le letture dello stesso mezzo si mettono in fila (lock), così
--    due inserimenti concorrenti non si scavalcano;
--  * dopo ogni scrittura o cancellazione il km del mezzo si ricalcola;
--  * sul mezzo il km non si scrive a mano: si registra una lettura.
-- ============================================================
create or replace function fleetcare.check_odometer_reading() returns trigger
  language plpgsql as
$$
declare
  v_before int;
  v_after int;
  v_initial int;
begin
  if new.read_at > now() + interval '10 minutes' then
    raise exception 'Lettura con data futura (%): controllare l''orologio del dispositivo', new.read_at
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fleetcare.odometer:' || new.vehicle_id::text, 0));

  select initial_odometer_km into v_initial from fleetcare.vehicles
   where id = new.vehicle_id and tenant_id = new.tenant_id;
  select max(km) into v_before from fleetcare.odometer_readings
   where tenant_id = new.tenant_id and vehicle_id = new.vehicle_id
     and read_at <= new.read_at and id <> new.id;
  select min(km) into v_after from fleetcare.odometer_readings
   where tenant_id = new.tenant_id and vehicle_id = new.vehicle_id
     and read_at > new.read_at and id <> new.id;

  if new.km < greatest(coalesce(v_before, 0), coalesce(v_initial, 0)) then
    raise exception 'Lettura di % km inferiore alla precedente o ai km d''ingresso (% km)',
      new.km, greatest(coalesce(v_before, 0), coalesce(v_initial, 0))
      using errcode = 'check_violation';
  end if;
  if v_after is not null and new.km > v_after then
    raise exception 'Lettura di % km superiore a una successiva (% km)', new.km, v_after
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- SECURITY DEFINER: un volontario, che sui mezzi non ha scrittura, deve
-- comunque poter aggiornare il km. Tocca solo il mezzo della lettura e
-- legge solo le letture dello stesso tenant.
create or replace function fleetcare.refresh_vehicle_odometer() returns trigger
  language plpgsql security definer set search_path = fleetcare, public as
$$
declare
  v_vehicle uuid;
  v_tenant uuid;
begin
  for v_vehicle, v_tenant in
    select distinct x.vehicle_id, x.tenant_id from (
      select new.vehicle_id, new.tenant_id where tg_op <> 'DELETE'
      union all
      select old.vehicle_id, old.tenant_id where tg_op <> 'INSERT'
    ) x (vehicle_id, tenant_id)
  loop
    perform set_config('fleetcare.odometer_refresh', 'on', true);
    update fleetcare.vehicles v
       set odometer_km = coalesce(
             (select r.km from fleetcare.odometer_readings r
               where r.tenant_id = v_tenant and r.vehicle_id = v_vehicle
               order by r.read_at desc, r.km desc limit 1),
             v.initial_odometer_km),
           odometer_updated_at =
             (select r.read_at from fleetcare.odometer_readings r
               where r.tenant_id = v_tenant and r.vehicle_id = v_vehicle
               order by r.read_at desc, r.km desc limit 1)
     where v.id = v_vehicle and v.tenant_id = v_tenant;
    perform set_config('fleetcare.odometer_refresh', '', true);
  end loop;
  return null;
end
$$;

create or replace function fleetcare.guard_vehicle_odometer() returns trigger
  language plpgsql as
$$
begin
  if coalesce(current_setting('fleetcare.odometer_refresh', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.odometer_km := new.initial_odometer_km;
    new.odometer_updated_at := null;
    return new;
  end if;
  if new.odometer_km is distinct from old.odometer_km
     or new.odometer_updated_at is distinct from old.odometer_updated_at then
    raise exception 'Il km del mezzo non si scrive: si registra una lettura del contachilometri'
      using errcode = 'check_violation';
  end if;
  if new.initial_odometer_km is distinct from old.initial_odometer_km then
    new.odometer_km := coalesce(
      (select r.km from fleetcare.odometer_readings r
        where r.tenant_id = new.tenant_id and r.vehicle_id = new.id
        order by r.read_at desc, r.km desc limit 1),
      new.initial_odometer_km);
  end if;
  return new;
end
$$;

create trigger trg_odometer_check before insert or update of km, read_at, vehicle_id
  on fleetcare.odometer_readings
  for each row execute function fleetcare.check_odometer_reading();
create trigger trg_odometer_refresh after insert or update or delete
  on fleetcare.odometer_readings
  for each row execute function fleetcare.refresh_vehicle_odometer();
create trigger trg_vehicles_odometer_guard before insert or update
  on fleetcare.vehicles
  for each row execute function fleetcare.guard_vehicle_odometer();

-- ---------- login: trovare l'utenza prima che esista un contesto tenant ----------
-- Unica porta che attraversa la RLS in lettura: restituisce solo ciò che
-- serve ad Auth.js per verificare la password, per un'associazione e una
-- email. Utenza, persona e associazione devono essere della stessa
-- associazione (la chiave composta lo garantisce già; qui lo si ripete).
create or replace function fleetcare.auth_find_profile(p_tenant_slug text, p_email text)
  returns table (id uuid, tenant_id uuid, role fleetcare.profile_role, full_name text,
                 password_hash text, active boolean)
  language sql stable security definer set search_path = fleetcare, public as
$$
  select p.id, p.tenant_id, p.role, p.full_name, a.password_hash, p.active
    from fleetcare.profile_accounts a
    join fleetcare.profiles p on p.id = a.profile_id and p.tenant_id = a.tenant_id
    join fleetcare.tenants t on t.id = a.tenant_id
   where t.slug = p_tenant_slug and lower(a.email) = lower(p_email)
$$;
revoke all on function fleetcare.auth_find_profile(text, text) from public;
grant execute on function fleetcare.auth_find_profile(text, text) to fleetcare_app;

-- ---------- numerazione dei documenti ----------
-- SGN-2026-00001 (segnalazioni), MAN-… (interventi), SIN-… (sinistri):
-- atomica per associazione e anno. I contatori non si toccano dall'app:
-- passano solo da qui. Le segnalazioni le numera chiunque; interventi e
-- sinistri solo i responsabili, che sono gli unici a crearli.
create or replace function fleetcare.next_document_number(p_kind text, p_year int) returns text
  language plpgsql security definer set search_path = fleetcare, public as
$$
declare
  v_tenant uuid := fleetcare.app_tenant_id();
  v_value int;
begin
  if v_tenant is null then
    raise exception 'Nessuna associazione nel contesto' using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('SGN', 'MAN', 'SIN') then
    raise exception 'Tipo di documento sconosciuto: %', p_kind using errcode = 'invalid_parameter_value';
  end if;
  if p_kind <> 'SGN' and not fleetcare.app_is_staff() then
    raise exception 'Numerazione % riservata ai responsabili', p_kind using errcode = 'insufficient_privilege';
  end if;
  if p_year not between 2000 and 2999 then
    raise exception 'Anno non valido: %', p_year using errcode = 'invalid_parameter_value';
  end if;
  insert into fleetcare.document_counters (tenant_id, kind, year, last_value)
  values (v_tenant, p_kind, p_year, 1)
  on conflict (tenant_id, kind, year)
  do update set last_value = fleetcare.document_counters.last_value + 1
  returning last_value into v_value;
  return p_kind || '-' || p_year || '-' || lpad(v_value::text, 5, '0');
end
$$;
revoke all on function fleetcare.next_document_number(text, int) from public;
grant execute on function fleetcare.next_document_number(text, int) to fleetcare_app;

-- ============================================================
-- SCADENZE
-- ============================================================

-- ---------- coerenza: un tipo «da mezzo» non va su un'attrezzatura ----------
-- due funzioni, una per tabella: le colonne del bersaglio sono diverse
-- (`vehicle_category` sulla regola, `vehicle_id` sulla scadenza)
create or replace function fleetcare.check_rule_subject() returns trigger
  language plpgsql as
$$
declare v_subject fleetcare.deadline_subject;
begin
  select subject into v_subject from fleetcare.deadline_types
   where id = new.deadline_type_id and tenant_id = new.tenant_id;
  if (v_subject = 'vehicle') <> (new.vehicle_category is not null) then
    raise exception 'Regola incoerente: il tipo di scadenza è per %',
      case v_subject when 'vehicle' then 'mezzi' else 'attrezzature' end
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create or replace function fleetcare.check_item_subject() returns trigger
  language plpgsql as
$$
declare v_subject fleetcare.deadline_subject;
begin
  select subject into v_subject from fleetcare.deadline_types
   where id = new.deadline_type_id and tenant_id = new.tenant_id;
  if (v_subject = 'vehicle') <> (new.vehicle_id is not null) then
    raise exception 'Scadenza incoerente: il tipo di scadenza è per %',
      case v_subject when 'vehicle' then 'mezzi' else 'attrezzature' end
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger trg_deadline_rules_subject before insert or update of deadline_type_id, vehicle_category, equipment_type_id
  on fleetcare.deadline_rules
  for each row execute function fleetcare.check_rule_subject();
create trigger trg_deadlines_subject before insert or update of deadline_type_id, vehicle_id, equipment_id
  on fleetcare.deadlines
  for each row execute function fleetcare.check_item_subject();

-- e un tipo già usato non cambia soggetto sotto i piedi di regole e scadenze
create or replace function fleetcare.guard_deadline_type_subject() returns trigger
  language plpgsql as
$$
begin
  if new.subject is distinct from old.subject
     and (exists (select 1 from fleetcare.deadline_rules where tenant_id = old.tenant_id and deadline_type_id = old.id)
          or exists (select 1 from fleetcare.deadlines where tenant_id = old.tenant_id and deadline_type_id = old.id)) then
    raise exception 'Il tipo di scadenza «%» è già usato: non può passare da mezzi ad attrezzature o viceversa', old.label
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger trg_deadline_types_subject before update of subject
  on fleetcare.deadline_types
  for each row execute function fleetcare.guard_deadline_type_subject();

-- ---------- valori effettivi: scadenza → regola → tipo ----------
-- Un campo nullo sulla scadenza eredita dalla regola (per la categoria del
-- mezzo o il tipo dell'attrezzatura), poi dal tipo. Mesi e giorni
-- viaggiano insieme: vince il primo livello che ne fissa uno. È la stessa
-- catena di `effectiveDeadline` in src/domain/deadlines.ts (i test di
-- tests/deadlines.test.sql le tengono allineate).
-- security_invoker: chi legge la vista è soggetto alle policy delle tabelle.
create view fleetcare.deadlines_effective with (security_invoker = true) as
select
  d.id, d.tenant_id, d.deadline_type_id,
  t.code as type_code, t.label as type_label, t.subject,
  d.vehicle_id, d.equipment_id, d.label,
  d.due_on, d.due_km, d.last_done_on, d.last_done_km, d.archived_at,
  case when d.interval_months is not null or d.interval_days is not null then d.interval_months
       when r.interval_months is not null or r.interval_days is not null then r.interval_months
       else t.interval_months end as interval_months,
  case when d.interval_months is not null or d.interval_days is not null then d.interval_days
       when r.interval_months is not null or r.interval_days is not null then r.interval_days
       else t.interval_days end as interval_days,
  coalesce(d.interval_km, r.interval_km, t.interval_km) as interval_km,
  coalesce(d.alert_days, r.alert_days, t.alert_days) as alert_days,
  coalesce(d.alert_km, r.alert_km, t.alert_km) as alert_km,
  coalesce(d.blocking, r.blocking, t.blocking) as blocking,
  t.month_end, t.renew_from_due,
  (d.interval_months is not null or d.interval_days is not null or d.interval_km is not null
   or d.alert_days is not null or d.alert_km is not null or d.blocking is not null) as overridden
from fleetcare.deadlines d
join fleetcare.deadline_types t
  on t.tenant_id = d.tenant_id and t.id = d.deadline_type_id
left join fleetcare.vehicles v
  on v.tenant_id = d.tenant_id and v.id = d.vehicle_id
left join fleetcare.equipment e
  on e.tenant_id = d.tenant_id and e.id = d.equipment_id
left join fleetcare.deadline_rules r
  on r.tenant_id = d.tenant_id and r.deadline_type_id = d.deadline_type_id
 and ((d.vehicle_id is not null and r.vehicle_category = v.category)
      or (d.equipment_id is not null and r.equipment_type_id = e.equipment_type_id));
grant select on fleetcare.deadlines_effective to fleetcare_app;

-- ---------- un adempimento sposta la scadenza ----------
-- Dopo ogni adempimento registrato, corretto o cancellato, la scadenza
-- prende i dati dell'ultimo adempimento non fallito: ultimo fatto, e
-- prossima scadenza se l'adempimento la indica. SECURITY DEFINER perché
-- chi registra l'adempimento (l'amministrazione che paga l'RCA, il
-- volontario che sanifica) non ha scrittura sulle scadenze. Tocca solo la
-- scadenza dell'adempimento, nello stesso tenant.
create or replace function fleetcare.sync_deadline_from_completions() returns trigger
  language plpgsql security definer set search_path = fleetcare, public as
$$
declare
  v_deadline uuid;
  v_tenant uuid;
  r record;
begin
  for v_deadline, v_tenant in
    select distinct x.deadline_id, x.tenant_id from (
      select new.deadline_id, new.tenant_id where tg_op <> 'DELETE'
      union all
      select old.deadline_id, old.tenant_id where tg_op <> 'INSERT'
    ) x (deadline_id, tenant_id)
  loop
    select c.done_on, c.done_km, c.next_due_on, c.next_due_km into r
      from fleetcare.deadline_completions c
     where c.tenant_id = v_tenant and c.deadline_id = v_deadline and c.outcome <> 'failed'
     order by c.done_on desc, c.created_at desc
     limit 1;
    if found then
      update fleetcare.deadlines
         set last_done_on = r.done_on,
             last_done_km = r.done_km,
             due_on = coalesce(r.next_due_on, due_on),
             due_km = coalesce(r.next_due_km, due_km)
       where id = v_deadline and tenant_id = v_tenant;
    else
      update fleetcare.deadlines
         set last_done_on = null, last_done_km = null
       where id = v_deadline and tenant_id = v_tenant;
    end if;
  end loop;
  return null;
end
$$;
create trigger trg_deadline_completions_sync after insert or update or delete
  on fleetcare.deadline_completions
  for each row execute function fleetcare.sync_deadline_from_completions();

-- ---------- eliminare dagli scadenzari senza perdere lo storico ----------
-- Ogni associazione sceglie, aggiunge, modifica ed elimina le proprie
-- scadenze. L'unico limite: ciò che ha adempimenti registrati (una
-- revisione fatta, un certificato) è documentazione, e invece di sparire
-- si archivia. Il chiamante sa sempre cosa è successo dal valore di
-- ritorno: 'deleted' oppure 'archived'.
-- SECURITY INVOKER (il default): valgono le policy di chi chiama, quindi
-- un volontario non elimina niente.
create or replace function fleetcare.remove_deadline(p_id uuid) returns text
  language plpgsql as
$$
begin
  if exists (select 1 from fleetcare.deadline_completions where deadline_id = p_id) then
    update fleetcare.deadlines set archived_at = now()
     where id = p_id and archived_at is null;
    if not found and not exists (select 1 from fleetcare.deadlines
                                  where id = p_id and archived_at is not null) then
      raise exception 'Scadenza % non trovata o non modificabile', p_id using errcode = 'no_data_found';
    end if;
    return 'archived';
  end if;
  delete from fleetcare.deadlines where id = p_id;
  if not found then
    raise exception 'Scadenza % non trovata o non modificabile', p_id using errcode = 'no_data_found';
  end if;
  return 'deleted';
end
$$;

-- Un tipo di scadenza usato da scadenze con storico si archivia insieme a
-- tutte le sue scadenze; altrimenti si cancella tutto: le scadenze senza
-- storico, le regole (in cascata) e il tipo.
create or replace function fleetcare.remove_deadline_type(p_id uuid) returns text
  language plpgsql as
$$
begin
  if not exists (select 1 from fleetcare.deadline_types where id = p_id) then
    raise exception 'Tipo di scadenza % non trovato', p_id using errcode = 'no_data_found';
  end if;
  if exists (select 1 from fleetcare.deadline_completions c
               join fleetcare.deadlines d on d.tenant_id = c.tenant_id and d.id = c.deadline_id
              where d.deadline_type_id = p_id) then
    update fleetcare.deadlines set archived_at = now()
     where deadline_type_id = p_id and archived_at is null;
    update fleetcare.deadline_types set archived_at = now()
     where id = p_id and archived_at is null;
    if not found and not exists (select 1 from fleetcare.deadline_types
                                  where id = p_id and archived_at is not null) then
      raise exception 'Tipo di scadenza % non modificabile', p_id using errcode = 'insufficient_privilege';
    end if;
    return 'archived';
  end if;
  delete from fleetcare.deadlines where deadline_type_id = p_id;
  delete from fleetcare.deadline_types where id = p_id;
  if not found then
    raise exception 'Tipo di scadenza % non modificabile', p_id using errcode = 'insufficient_privilege';
  end if;
  return 'deleted';
end
$$;

-- ============================================================
-- CHECK-LIST
--
-- Una check-list nasce in bozza, riceve le risposte, si invia
-- (submitted_at). Da inviata non cambia più. Le cose che contano le decide
-- il database, non l'app: la firma è il nome di chi la compila, la voce
-- numerica fuori soglia è un'anomalia, le anomalie in testata si contano
-- all'invio dalle risposte. Una voce già usata non si riscrive: si
-- disattiva e se ne crea un'altra, così le check-list vecchie dicono
-- ancora cosa è stato controllato.
-- ============================================================
create or replace function fleetcare.prepare_checklist() returns trigger
  language plpgsql as
$$
begin
  if tg_op = 'INSERT' and new.submitted_at is not null then
    raise exception 'Una check-list nasce in bozza: si invia dopo aver scritto le risposte'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null and new.submitted_at is null then
    raise exception 'Una check-list inviata non torna in bozza' using errcode = 'check_violation';
  end if;

  select p.full_name into new.signed_name from fleetcare.profiles p
   where p.id = new.performed_by_id and p.tenant_id = new.tenant_id;
  if tg_op = 'INSERT' then
    select tp.version into new.template_version from fleetcare.checklist_templates tp
     where tp.id = new.template_id and tp.tenant_id = new.tenant_id;
  end if;

  if new.submitted_at is not null and (tg_op = 'INSERT' or old.submitted_at is null) then
    new.has_anomalies := exists (
      select 1 from fleetcare.checklist_answers a
       where a.checklist_id = new.id and a.outcome = 'anomaly');
    new.has_safety_anomalies := exists (
      select 1 from fleetcare.checklist_answers a
        join fleetcare.checklist_template_items i on i.tenant_id = a.tenant_id and i.id = a.template_item_id
       where a.checklist_id = new.id and a.outcome = 'anomaly' and i.safety_critical);
  elsif tg_op = 'INSERT' then
    new.has_anomalies := false;
    new.has_safety_anomalies := false;
  end if;
  return new;
end
$$;
create trigger trg_checklists_prepare before insert or update
  on fleetcare.checklists
  for each row execute function fleetcare.prepare_checklist();

create or replace function fleetcare.check_checklist_answer() returns trigger
  language plpgsql as
$$
declare
  i record;
  v_template uuid;
begin
  select it.kind, it.min_value, it.max_value, it.template_id into i
    from fleetcare.checklist_template_items it
   where it.id = new.template_item_id and it.tenant_id = new.tenant_id;
  select c.template_id into v_template from fleetcare.checklists c
   where c.id = new.checklist_id and c.tenant_id = new.tenant_id;
  if i.template_id is distinct from v_template then
    raise exception 'La voce non appartiene al modello di questa check-list' using errcode = 'check_violation';
  end if;
  if i.kind = 'number' and new.value_numeric is not null
     and ((i.min_value is not null and new.value_numeric < i.min_value)
          or (i.max_value is not null and new.value_numeric > i.max_value)) then
    new.outcome := 'anomaly';
  end if;
  return new;
end
$$;
create trigger trg_checklist_answers_check before insert or update
  on fleetcare.checklist_answers
  for each row execute function fleetcare.check_checklist_answer();

create or replace function fleetcare.guard_used_checklist_item() returns trigger
  language plpgsql as
$$
begin
  if (new.label, new.section, new.kind, new.unit, new.min_value, new.max_value,
      new.safety_critical, new.equipment_type_id, new.supply_item_id, new.template_id)
     is distinct from
     (old.label, old.section, old.kind, old.unit, old.min_value, old.max_value,
      old.safety_critical, old.equipment_type_id, old.supply_item_id, old.template_id)
     and exists (select 1 from fleetcare.checklist_answers a
                  where a.tenant_id = old.tenant_id and a.template_item_id = old.id) then
    raise exception 'La voce «%» è già stata usata in check-list compilate: disattivala e creane una nuova', old.label
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger trg_checklist_items_guard before update
  on fleetcare.checklist_template_items
  for each row execute function fleetcare.guard_used_checklist_item();

-- ============================================================
-- NOTIFICHE
--
-- Una segnalazione rossa o «il mezzo non è sicuro» avvisa i responsabili
-- dal database, senza dipendere dall'app: è l'avviso che non si deve
-- perdere. SECURITY DEFINER perché nasce da un'azione dell'equipaggio, che
-- non può scrivere notifiche.
-- ============================================================
create or replace function fleetcare.notify_red_fault() returns trigger
  language plpgsql security definer set search_path = fleetcare, public as
$$
begin
  if new.severity = 'red' or new.unsafe then
    insert into fleetcare.notifications (tenant_id, recipient_id, kind, title, body, href)
    select new.tenant_id, p.id, 'fault_red',
           'Segnalazione urgente sul mezzo ' || v.internal_code,
           left(new.description, 280),
           '/segnalazioni/' || new.id
      from fleetcare.profiles p
      join fleetcare.vehicles v on v.tenant_id = new.tenant_id and v.id = new.vehicle_id
     where p.tenant_id = new.tenant_id and p.active
       and p.role in ('admin', 'fleet_manager')
       and p.id <> new.reported_by_id;
  end if;
  return null;
end
$$;
create trigger trg_fault_reports_notify after insert
  on fleetcare.fault_reports
  for each row execute function fleetcare.notify_red_fault();

-- ============================================================
-- RLS
-- ============================================================

-- 1. RLS attiva su ogni tabella dello schema + isolamento tenant
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'fleetcare'
  loop
    execute format('alter table fleetcare.%I enable row level security', t);
    if t = 'tenants' then
      execute 'create policy tenant_isolation on fleetcare.tenants to fleetcare_app
               using (id = fleetcare.app_tenant_id())
               with check (id = fleetcare.app_tenant_id())';
    else
      execute format(
        'create policy tenant_isolation on fleetcare.%I to fleetcare_app
         using (tenant_id = fleetcare.app_tenant_id())
         with check (tenant_id = fleetcare.app_tenant_id())', t);
    end if;
  end loop;
end
$$;

-- helper per le policy restrittive per ruolo
create or replace function fleetcare._restrict(
  p_table text, p_cmd text, p_roles text[]
) returns void language plpgsql as
$$
declare
  v_cond text := format('fleetcare.app_has_role(variadic %L::text[])', p_roles);
begin
  if p_cmd = 'insert' then
    execute format('create policy %1$s_insert_role on fleetcare.%1$I as restrictive
                    for insert to fleetcare_app with check (%2$s)', p_table, v_cond);
  elsif p_cmd = 'update' then
    execute format('create policy %1$s_update_role on fleetcare.%1$I as restrictive
                    for update to fleetcare_app using (%2$s) with check (%2$s)', p_table, v_cond);
  elsif p_cmd = 'delete' then
    execute format('create policy %1$s_delete_role on fleetcare.%1$I as restrictive
                    for delete to fleetcare_app using (%2$s)', p_table, v_cond);
  elsif p_cmd = 'select' then
    execute format('create policy %1$s_select_role on fleetcare.%1$I as restrictive
                    for select to fleetcare_app using (%2$s)', p_table, v_cond);
  else
    raise exception 'comando sconosciuto: %', p_cmd;
  end if;
end
$$;

do $$
declare
  t text;
  c text;
  -- gruppi di ruoli
  ops constant text[] := array['admin', 'fleet_manager'];
  equip constant text[] := array['admin', 'fleet_manager', 'equipment_manager'];
  staff constant text[] := array['admin', 'fleet_manager', 'equipment_manager', 'admin_finance'];
  finance constant text[] := array['admin', 'admin_finance'];
begin
  -- 2a. anagrafiche e operativo del parco: tutti leggono, scrive il responsabile mezzi
  foreach t in array array[
    'sites', 'suppliers', 'vehicles', 'vehicle_downtimes',
    'checklist_templates', 'checklist_template_items'
  ] loop
    foreach c in array array['insert', 'update', 'delete'] loop
      perform fleetcare._restrict(t, c, ops);
    end loop;
  end loop;

  -- 2b. attrezzature, materiale, scadenze: anche il responsabile del materiale
  foreach t in array array[
    'equipment_types', 'equipment', 'equipment_movements',
    'supply_items', 'supply_lots', 'kit_requirements',
    'deadline_types', 'deadline_rules', 'deadlines'
  ] loop
    foreach c in array array['insert', 'update', 'delete'] loop
      perform fleetcare._restrict(t, c, equip);
    end loop;
  end loop;

  -- adempimenti: correggerli e cancellarli spetta ai responsabili (chi può
  -- inserirli è più sotto, 2e)
  perform fleetcare._restrict('deadline_completions', 'update', staff);
  perform fleetcare._restrict('deadline_completions', 'delete', staff);

  -- 2c. interventi e sinistri: contengono costi, l'equipaggio non li legge
  foreach t in array array['maintenance_jobs', 'accidents'] loop
    perform fleetcare._restrict(t, 'select', staff);
    perform fleetcare._restrict(t, 'insert', equip);
    perform fleetcare._restrict(t, 'update', staff);
    perform fleetcare._restrict(t, 'delete', ops);
  end loop;

  -- 2d. registri dell'equipaggio: chiunque inserisce (a proprio nome, 2e),
  -- solo i responsabili correggono o cancellano
  foreach t in array array['fault_reports', 'fuel_logs', 'odometer_readings', 'attachments'] loop
    perform fleetcare._restrict(t, 'update', staff);
    perform fleetcare._restrict(t, 'delete', ops);
  end loop;
  -- le sanificazioni sono documentazione: le corregge solo la direzione
  perform fleetcare._restrict('sanitizations', 'update', array['admin']);
  perform fleetcare._restrict('sanitizations', 'delete', array['admin']);

  -- 2f. fatture carburante: le legge chi deve verificarle, le gestisce l'amministrazione
  foreach t in array array['fuel_invoices', 'fuel_invoice_lines'] loop
    perform fleetcare._restrict(t, 'select', array['admin', 'admin_finance', 'fleet_manager']);
    foreach c in array array['insert', 'update', 'delete'] loop
      perform fleetcare._restrict(t, c, finance);
    end loop;
  end loop;

  -- 2g. persone e associazione: le gestisce la direzione
  foreach c in array array['insert', 'update', 'delete'] loop
    perform fleetcare._restrict('profiles', c, array['admin']);
  end loop;
  perform fleetcare._restrict('tenants', 'update', array['admin']);

  -- 2h. audit: lo legge solo direzione e amministrazione
  perform fleetcare._restrict('audit_logs', 'select', finance);
end
$$;
drop function fleetcare._restrict(text, text, text[]);

-- 2e. ognuno registra solo a proprio nome. I volontari usano i propri
-- dispositivi: senza questo vincolo chiunque potrebbe firmare un
-- rifornimento o una segnalazione per un altro. I responsabili possono
-- invece registrare per conto di qualcuno (il buono di carta portato in
-- sede da chi non ha usato l'app).
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('fault_reports', 'reported_by_id'),
      ('fuel_logs', 'recorded_by_id'),
      ('odometer_readings', 'recorded_by_id'),
      ('sanitizations', 'performed_by_id')
    ) v (tbl, col)
  loop
    execute format(
      'create policy %1$s_insert_self on fleetcare.%1$I as restrictive
       for insert to fleetcare_app
       with check (fleetcare.app_is_staff() or %2$I = fleetcare.app_user_id())',
      r.tbl, r.col);
  end loop;
end
$$;

-- adempimenti: li registrano i responsabili; l'equipaggio solo per i tipi
-- che lo prevedono (la sanificazione periodica) e a proprio nome
create policy deadline_completions_insert_role on fleetcare.deadline_completions as restrictive
  for insert to fleetcare_app
  with check (
    fleetcare.app_is_staff()
    or (recorded_by_id = fleetcare.app_user_id()
        and exists (select 1 from fleetcare.deadlines d
                      join fleetcare.deadline_types t on t.tenant_id = d.tenant_id and t.id = d.deadline_type_id
                     where d.id = deadline_id and t.completed_by_crew))
  );

-- check-list: la compila e la firma chi la fa, per chiunque; in bozza la
-- modifica solo lui, inviata solo la direzione
create policy checklists_insert_self on fleetcare.checklists as restrictive
  for insert to fleetcare_app
  with check (performed_by_id = fleetcare.app_user_id());
create policy checklists_update_role on fleetcare.checklists as restrictive
  for update to fleetcare_app
  using (fleetcare.app_has_role('admin')
         or (submitted_at is null and performed_by_id = fleetcare.app_user_id()))
  with check (fleetcare.app_has_role('admin') or performed_by_id = fleetcare.app_user_id());
create policy checklists_delete_role on fleetcare.checklists as restrictive
  for delete to fleetcare_app
  using (fleetcare.app_has_role('admin')
         or (submitted_at is null and performed_by_id = fleetcare.app_user_id()));

-- risposte: solo su una bozza propria (o dalla direzione)
create policy checklist_answers_insert_role on fleetcare.checklist_answers as restrictive
  for insert to fleetcare_app
  with check (
    fleetcare.app_has_role('admin')
    or exists (select 1 from fleetcare.checklists c
                where c.id = checklist_id and c.submitted_at is null
                  and c.performed_by_id = fleetcare.app_user_id()));
create policy checklist_answers_update_role on fleetcare.checklist_answers as restrictive
  for update to fleetcare_app
  using (
    fleetcare.app_has_role('admin')
    or exists (select 1 from fleetcare.checklists c
                where c.id = checklist_id and c.submitted_at is null
                  and c.performed_by_id = fleetcare.app_user_id()))
  with check (
    fleetcare.app_has_role('admin')
    or exists (select 1 from fleetcare.checklists c
                where c.id = checklist_id and c.submitted_at is null
                  and c.performed_by_id = fleetcare.app_user_id()));
create policy checklist_answers_delete_role on fleetcare.checklist_answers as restrictive
  for delete to fleetcare_app
  using (
    fleetcare.app_has_role('admin')
    or exists (select 1 from fleetcare.checklists c
                where c.id = checklist_id and c.submitted_at is null
                  and c.performed_by_id = fleetcare.app_user_id()));

-- allegati: chi li vede dipende da cosa documentano. Fatture, interventi e
-- sinistri contengono denaro: l'equipaggio non li vede e non ne carica.
-- L'equipaggio allega solo alle proprie segnalazioni e check-list.
create policy attachments_select_role on fleetcare.attachments as restrictive
  for select to fleetcare_app
  using (case entity_type
           when 'fuel_invoice' then fleetcare.app_has_role('admin', 'admin_finance', 'fleet_manager')
           when 'maintenance_job' then fleetcare.app_is_staff()
           when 'accident' then fleetcare.app_is_staff()
           else true end);
create policy attachments_insert_role on fleetcare.attachments as restrictive
  for insert to fleetcare_app
  with check (
    (fleetcare.app_is_staff()
     and (entity_type <> 'fuel_invoice' or fleetcare.app_has_role('admin', 'admin_finance')))
    or (uploaded_by_id = fleetcare.app_user_id()
        and entity_type in ('fault_report', 'checklist')));

-- commenti alle segnalazioni: l'equipaggio non vede né scrive le note
-- interne; ognuno scrive a proprio nome; non si modificano, li cancella
-- solo la direzione
create policy fault_report_comments_select_role on fleetcare.fault_report_comments as restrictive
  for select to fleetcare_app
  using (not internal or fleetcare.app_is_staff());
create policy fault_report_comments_insert_self on fleetcare.fault_report_comments as restrictive
  for insert to fleetcare_app
  with check (author_id = fleetcare.app_user_id()
              and (not internal or fleetcare.app_is_staff()));
create policy fault_report_comments_update_role on fleetcare.fault_report_comments as restrictive
  for update to fleetcare_app using (false);
create policy fault_report_comments_delete_role on fleetcare.fault_report_comments as restrictive
  for delete to fleetcare_app using (fleetcare.app_has_role('admin'));

-- recapiti e credenziali: ognuno i propri, la direzione tutti
create policy profile_accounts_select_role on fleetcare.profile_accounts as restrictive
  for select to fleetcare_app
  using (profile_id = fleetcare.app_user_id() or fleetcare.app_has_role('admin'));
create policy profile_accounts_update_role on fleetcare.profile_accounts as restrictive
  for update to fleetcare_app
  using (profile_id = fleetcare.app_user_id() or fleetcare.app_has_role('admin'))
  with check (profile_id = fleetcare.app_user_id() or fleetcare.app_has_role('admin'));
create policy profile_accounts_insert_role on fleetcare.profile_accounts as restrictive
  for insert to fleetcare_app with check (fleetcare.app_has_role('admin'));
create policy profile_accounts_delete_role on fleetcare.profile_accounts as restrictive
  for delete to fleetcare_app using (fleetcare.app_has_role('admin'));

-- iscrizioni push: ognuno registra i propri dispositivi; i responsabili le
-- leggono per mandare l'avviso a chi ha segnalato, e cancellano quelle
-- scadute quando un invio fallisce
create policy push_subscriptions_select_role on fleetcare.push_subscriptions as restrictive
  for select to fleetcare_app
  using (profile_id = fleetcare.app_user_id() or fleetcare.app_is_staff());
create policy push_subscriptions_insert_self on fleetcare.push_subscriptions as restrictive
  for insert to fleetcare_app with check (profile_id = fleetcare.app_user_id());
create policy push_subscriptions_update_self on fleetcare.push_subscriptions as restrictive
  for update to fleetcare_app
  using (profile_id = fleetcare.app_user_id()) with check (profile_id = fleetcare.app_user_id());
create policy push_subscriptions_delete_role on fleetcare.push_subscriptions as restrictive
  for delete to fleetcare_app
  using (profile_id = fleetcare.app_user_id() or fleetcare.app_is_staff());

-- notifiche: ognuno vede, segna come lette e cancella solo le proprie; le
-- scrivono i responsabili (l'avviso rosso lo scrive il trigger)
create policy notifications_select_own on fleetcare.notifications as restrictive
  for select to fleetcare_app using (recipient_id = fleetcare.app_user_id());
create policy notifications_update_own on fleetcare.notifications as restrictive
  for update to fleetcare_app
  using (recipient_id = fleetcare.app_user_id())
  with check (recipient_id = fleetcare.app_user_id());
create policy notifications_insert_role on fleetcare.notifications as restrictive
  for insert to fleetcare_app with check (fleetcare.app_is_staff());
create policy notifications_delete_own on fleetcare.notifications as restrictive
  for delete to fleetcare_app
  using (recipient_id = fleetcare.app_user_id() or fleetcare.app_has_role('admin'));
