-- ============================================================
-- FleetCare — ruolo applicativo, RLS, audit, trigger
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
    select table_name from information_schema.columns
    where table_schema = 'fleetcare' and column_name = 'updated_at'
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
-- mezzi, scadenze e adempimenti (documentazione ispettiva), costi, denaro
do $$
declare t text;
begin
  foreach t in array array[
    'vehicles', 'equipment', 'deadlines', 'deadline_completions',
    'maintenance_jobs', 'vehicle_downtimes', 'accidents',
    'fuel_logs', 'fuel_invoices', 'fuel_invoice_lines'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on fleetcare.%1$I
       for each row execute function fleetcare.audit_row_change()', t);
  end loop;
end
$$;

-- ---------- contachilometri: niente letture all'indietro ----------
-- Vale anche per le correzioni (UPDATE), escludendo dal confronto la riga
-- stessa: correggere un 100.000 battuto al posto di 10.000 deve passare,
-- spostare una lettura sotto quella del giorno prima no.
-- SECURITY DEFINER perché aggiorna `vehicles.odometer_km` anche quando la
-- lettura la inserisce un volontario, che sui mezzi non ha scrittura.
-- Tocca solo il mezzo della lettura, nello stesso tenant.
create or replace function fleetcare.check_odometer_reading() returns trigger
  language plpgsql security definer set search_path = fleetcare, public as
$$
declare
  v_before int;
  v_after int;
begin
  select max(km) into v_before from fleetcare.odometer_readings
   where vehicle_id = new.vehicle_id and read_at <= new.read_at and id <> new.id;
  select min(km) into v_after from fleetcare.odometer_readings
   where vehicle_id = new.vehicle_id and read_at > new.read_at and id <> new.id;

  if new.km < coalesce(v_before, 0) then
    raise exception 'Lettura di % km inferiore alla precedente (% km)', new.km, v_before
      using errcode = 'check_violation';
  end if;
  if v_after is not null and new.km > v_after then
    raise exception 'Lettura di % km superiore a una successiva (% km)', new.km, v_after
      using errcode = 'check_violation';
  end if;

  update fleetcare.vehicles
     set odometer_km = new.km, odometer_updated_at = new.read_at
   where id = new.vehicle_id
     and tenant_id = new.tenant_id
     and (odometer_updated_at is null or odometer_updated_at <= new.read_at);

  return new;
end
$$;

create trigger trg_odometer_check before insert or update of km, read_at, vehicle_id
  on fleetcare.odometer_readings
  for each row execute function fleetcare.check_odometer_reading();

-- ---------- login: trovare l'utenza prima che esista un contesto tenant ----------
-- Unica porta che attraversa la RLS: restituisce solo ciò che serve ad
-- Auth.js per verificare la password, per un'associazione e una email.
create or replace function fleetcare.auth_find_profile(p_tenant_slug text, p_email text)
  returns table (id uuid, tenant_id uuid, role fleetcare.profile_role, full_name text,
                 password_hash text, active boolean)
  language sql stable security definer set search_path = fleetcare, public as
$$
  select p.id, p.tenant_id, p.role, p.full_name, p.password_hash, p.active
    from fleetcare.profiles p
    join fleetcare.tenants t on t.id = p.tenant_id
   where t.slug = p_tenant_slug and lower(p.email) = lower(p_email)
$$;
revoke all on function fleetcare.auth_find_profile(text, text) from public;
grant execute on function fleetcare.auth_find_profile(text, text) to fleetcare_app;

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

-- helper per le policy restrittive: chi può scrivere (insert/update/delete)
-- e, se serve, chi può leggere. `roles` è la lista di ruoli ammessi.
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
    'sites', 'crew_members', 'suppliers', 'vehicles', 'vehicle_downtimes',
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

  -- gli adempimenti li registra anche l'amministrazione (premio RCA, bollo pagato)
  foreach c in array array['insert', 'update', 'delete'] loop
    perform fleetcare._restrict('deadline_completions', c, staff);
  end loop;

  -- 2c. interventi e sinistri: contengono costi, l'equipaggio non li legge
  foreach t in array array['maintenance_jobs', 'accidents'] loop
    perform fleetcare._restrict(t, 'select', staff);
    perform fleetcare._restrict(t, 'insert', array['admin', 'fleet_manager', 'equipment_manager']);
    perform fleetcare._restrict(t, 'update', staff);
    perform fleetcare._restrict(t, 'delete', ops);
  end loop;

  -- 2d. registri dell'equipaggio: chiunque inserisce, solo i responsabili
  -- correggono o cancellano. Check-list e sanificazioni sono
  -- documentazione: una volta inviate le corregge solo la direzione.
  foreach t in array array['fault_reports', 'fuel_logs', 'odometer_readings', 'attachments'] loop
    perform fleetcare._restrict(t, 'update', staff);
    perform fleetcare._restrict(t, 'delete', ops);
  end loop;
  foreach t in array array['checklists', 'checklist_answers', 'sanitizations'] loop
    perform fleetcare._restrict(t, 'update', array['admin']);
    perform fleetcare._restrict(t, 'delete', array['admin']);
  end loop;

  -- 2e. fatture carburante: le legge chi deve verificarle, le gestisce l'amministrazione
  foreach t in array array['fuel_invoices', 'fuel_invoice_lines'] loop
    perform fleetcare._restrict(t, 'select', array['admin', 'admin_finance', 'fleet_manager']);
    foreach c in array array['insert', 'update', 'delete'] loop
      perform fleetcare._restrict(t, c, finance);
    end loop;
  end loop;

  -- 2f. utenze e associazione: le gestisce la direzione
  foreach c in array array['insert', 'update', 'delete'] loop
    perform fleetcare._restrict('profiles', c, array['admin']);
  end loop;
  perform fleetcare._restrict('tenants', 'update', array['admin']);

  -- 2g. audit: lo legge solo direzione e amministrazione
  perform fleetcare._restrict('audit_logs', 'select', finance);
end
$$;

-- 2h. notifiche: ognuno vede e segna come lette solo le proprie
create policy notifications_select_own on fleetcare.notifications as restrictive
  for select to fleetcare_app using (recipient_id = fleetcare.app_user_id());
create policy notifications_update_own on fleetcare.notifications as restrictive
  for update to fleetcare_app
  using (recipient_id = fleetcare.app_user_id())
  with check (recipient_id = fleetcare.app_user_id());

drop function fleetcare._restrict(text, text, text[]);
