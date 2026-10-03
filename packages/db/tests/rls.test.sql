-- ============================================================
-- Test delle policy RLS, eseguiti con il ruolo applicativo vero.
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/rls.test.sql
-- Tutto in una transazione chiusa da ROLLBACK: non lascia traccia.
-- Un'asserzione fallita ferma lo script con codice d'uscita ≠ 0.
--
-- Identificativi di prova:
--   tenant A   a0000000-…-000000000000      tenant B   b0000000-…-000000000000
--   crew A     …c001   mezzi A …f001   materiale A …e001   amministrazione A …a001
--   mezzo A    …d001   mezzo B (b…)d001
-- ============================================================
\set ON_ERROR_STOP on
begin;

-- ---------- ogni tabella dello schema ha RLS e isolamento per associazione ----------
-- Una tabella nuova senza policy fa fallire questo test: la RLS non si dimentica.
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'fleetcare' and c.relkind = 'r'
     and (not c.relrowsecurity
          or not exists (select 1 from pg_policies p
                          where p.schemaname = 'fleetcare' and p.tablename = c.relname
                            and p.policyname = 'tenant_isolation'));
  assert missing is null, 'tabelle senza RLS o senza isolamento tenant: ' || missing;
end $$;

-- ---------- dati di prova (ruolo owner, fuori dalla RLS) ----------
insert into fleetcare.tenants (id, name, slug) values
  ('a0000000-0000-0000-0000-000000000000', 'Associazione A', 'test-a'),
  ('b0000000-0000-0000-0000-000000000000', 'Associazione B', 'test-b');

insert into fleetcare.profiles (id, tenant_id, email, full_name, role) values
  ('a0000000-0000-0000-0000-00000000c001', 'a0000000-0000-0000-0000-000000000000', 'crew@a.it', 'Equipaggio A', 'crew'),
  ('a0000000-0000-0000-0000-00000000f001', 'a0000000-0000-0000-0000-000000000000', 'mezzi@a.it', 'Mezzi A', 'fleet_manager'),
  ('a0000000-0000-0000-0000-00000000e001', 'a0000000-0000-0000-0000-000000000000', 'materiale@a.it', 'Materiale A', 'equipment_manager'),
  ('a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-000000000000', 'amm@a.it', 'Amministrazione A', 'admin_finance');

insert into fleetcare.vehicles (id, tenant_id, internal_code, plate, category) values
  ('a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-000000000000', '01', 'AA111AA', 'emergency_ambulance'),
  ('b0000000-0000-0000-0000-00000000d001', 'b0000000-0000-0000-0000-000000000000', '01', 'BB111BB', 'emergency_ambulance');

insert into fleetcare.suppliers (id, tenant_id, name, kinds) values
  ('a0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-000000000000', 'Distributore', '{fuel_station}');

insert into fleetcare.fuel_invoices (id, tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur) values
  ('a0000000-0000-0000-0000-00000000b101', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b001', '2026/09', '2026-09-30', '2026-09-01', '2026-09-30', 1234.56);

insert into fleetcare.maintenance_jobs (id, tenant_id, number, vehicle_id, kind, title, total_amount_eur) values
  ('a0000000-0000-0000-0000-00000000b201', 'a0000000-0000-0000-0000-000000000000', 'MAN-2026-00001',
   'a0000000-0000-0000-0000-00000000d001', 'service', 'Tagliando', 480.00);

insert into fleetcare.checklist_templates (id, tenant_id, name) values
  ('a0000000-0000-0000-0000-00000000b301', 'a0000000-0000-0000-0000-000000000000', 'Controllo');
insert into fleetcare.checklists (id, tenant_id, vehicle_id, template_id, template_version, signed_name) values
  ('a0000000-0000-0000-0000-00000000b401', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000b301', 1, 'Mario Rossi');

insert into fleetcare.notifications (tenant_id, recipient_id, title) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c001', 'per crew'),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000f001', 'per mezzi');

-- ---------- da qui in poi: ruolo applicativo ----------
set role fleetcare_app;

-- nessun contesto: non si vede niente
do $$ begin
  assert (select count(*) from fleetcare.vehicles) = 0, 'senza contesto tenant non si vede nessun mezzo';
end $$;

-- il login trova l'utenza anche senza contesto (unica porta SECURITY DEFINER)
do $$ begin
  assert (select count(*) from fleetcare.auth_find_profile('test-a', 'CREW@a.it')) = 1,
    'auth_find_profile trova l''utenza ignorando le maiuscole';
  assert (select count(*) from fleetcare.auth_find_profile('test-b', 'crew@a.it')) = 0,
    'auth_find_profile non trova l''utenza in un''altra associazione';
end $$;

-- ================= equipaggio (crew) di A =================
set app.tenant_id = 'a0000000-0000-0000-0000-000000000000';
set app.user_id = 'a0000000-0000-0000-0000-00000000c001';
set app.role = 'crew';

do $$ begin
  assert (select count(*) from fleetcare.vehicles) = 1, 'crew: vede solo i mezzi della propria associazione';
  assert (select count(*) from fleetcare.fuel_invoices) = 0, 'crew: non legge le fatture carburante';
  assert (select count(*) from fleetcare.maintenance_jobs) = 0, 'crew: non legge gli interventi (costi)';
  assert (select count(*) from fleetcare.audit_logs) = 0, 'crew: non legge l''audit';
  assert (select count(*) from fleetcare.notifications) = 1, 'crew: vede solo le proprie notifiche';
end $$;

-- crew registra un rifornimento, una segnalazione e una lettura km
insert into fleetcare.fuel_logs (id, tenant_id, vehicle_id, refueled_at, liters, amount_eur) values
  ('a0000000-0000-0000-0000-00000000b501', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', '2026-09-10 08:30+02', 40, 70.00);
insert into fleetcare.fault_reports (tenant_id, number, vehicle_id, description, severity) values
  ('a0000000-0000-0000-0000-000000000000', 'SGN-2026-00001',
   'a0000000-0000-0000-0000-00000000d001', 'Sirena intermittente', 'yellow');
insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 10000, '2026-09-10 08:00+02');

do $$
declare n int;
begin
  assert (select unit_price_eur from fleetcare.fuel_logs
          where id = 'a0000000-0000-0000-0000-00000000b501') = 1.75,
    'fuel_logs: €/litro calcolato dal database';

  assert (select odometer_km from fleetcare.vehicles
          where id = 'a0000000-0000-0000-0000-00000000d001') = 10000,
    'odometro: la lettura dell''equipaggio aggiorna il mezzo';

  update fleetcare.fuel_logs set liters = 1 where id = 'a0000000-0000-0000-0000-00000000b501';
  get diagnostics n = row_count;
  assert n = 0, 'crew: non corregge un rifornimento già registrato';

  update fleetcare.vehicles set status = 'grounded';
  get diagnostics n = row_count;
  assert n = 0, 'crew: non cambia lo stato dei mezzi';

  begin
    insert into fleetcare.vehicles (tenant_id, internal_code, plate, category)
    values ('a0000000-0000-0000-0000-000000000000', '99', 'ZZ999ZZ', 'service_car');
    raise exception 'FAIL crew: ha creato un mezzo';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters)
    values ('b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000d001', now(), 10);
    raise exception 'FAIL crew: ha scritto nell''associazione B';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 9000, '2026-09-11 08:00+02');
    raise exception 'FAIL odometro: accettata una lettura all''indietro';
  exception when check_violation then null;
  end;

  begin
    insert into fleetcare.audit_logs (tenant_id, table_name, action)
    values ('a0000000-0000-0000-0000-000000000000', 'x', 'INSERT');
    raise exception 'FAIL crew: ha scritto nell''audit';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ================= responsabile mezzi di A =================
set app.user_id = 'a0000000-0000-0000-0000-00000000f001';
set app.role = 'fleet_manager';

do $$
declare n int;
begin
  assert (select count(*) from fleetcare.fuel_invoices) = 1, 'fleet_manager: legge le fatture per verificarle';
  assert (select count(*) from fleetcare.maintenance_jobs) = 1, 'fleet_manager: legge gli interventi';

  update fleetcare.vehicles set status = 'maintenance' where id = 'a0000000-0000-0000-0000-00000000d001';
  get diagnostics n = row_count;
  assert n = 1, 'fleet_manager: cambia lo stato del mezzo';

  update fleetcare.fuel_logs set liters = 41 where id = 'a0000000-0000-0000-0000-00000000b501';
  get diagnostics n = row_count;
  assert n = 1, 'fleet_manager: corregge un rifornimento';

  -- correzione di una lettura km battuta male: passa e aggiorna il mezzo
  insert into fleetcare.odometer_readings (id, tenant_id, vehicle_id, km, read_at) values
    ('a0000000-0000-0000-0000-00000000b801', 'a0000000-0000-0000-0000-000000000000',
     'a0000000-0000-0000-0000-00000000d001', 100500, '2026-09-12 08:00+02');
  update fleetcare.odometer_readings set km = 10500 where id = 'a0000000-0000-0000-0000-00000000b801';
  assert (select odometer_km from fleetcare.vehicles
          where id = 'a0000000-0000-0000-0000-00000000d001') = 10500,
    'odometro: la correzione dell''ultima lettura aggiorna il mezzo';
  begin
    update fleetcare.odometer_readings set km = 9000 where id = 'a0000000-0000-0000-0000-00000000b801';
    raise exception 'FAIL odometro: una correzione ha portato i km sotto la lettura precedente';
  exception when check_violation then null;
  end;

  update fleetcare.checklists set signed_name = 'altro';
  get diagnostics n = row_count;
  assert n = 0, 'fleet_manager: una check-list inviata non si modifica';

  begin
    insert into fleetcare.fuel_invoices (tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b001',
            '2026/10', '2026-10-31', '2026-10-01', '2026-10-31', 1);
    raise exception 'FAIL fleet_manager: ha registrato una fattura';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ================= responsabile materiale di A =================
set app.user_id = 'a0000000-0000-0000-0000-00000000e001';
set app.role = 'equipment_manager';

do $$
declare n int;
begin
  insert into fleetcare.equipment_types (id, tenant_id, code, label, "group")
  values ('a0000000-0000-0000-0000-00000000b601', 'a0000000-0000-0000-0000-000000000000', 'dae', 'DAE', 'electromedical');
  insert into fleetcare.equipment (tenant_id, equipment_type_id, vehicle_id, serial_number)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b601',
          'a0000000-0000-0000-0000-00000000d001', 'SN-1');

  update fleetcare.vehicles set notes = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'equipment_manager: non modifica l''anagrafica mezzi';

  begin
    insert into fleetcare.equipment (tenant_id, equipment_type_id, vehicle_id, site_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b601',
            'a0000000-0000-0000-0000-00000000d001', gen_random_uuid());
    raise exception 'FAIL equipment: accettata un''attrezzatura su un mezzo e in una sede insieme';
  exception when check_violation then null;
  end;
end $$;

-- ================= amministrazione di A =================
set app.user_id = 'a0000000-0000-0000-0000-00000000a001';
set app.role = 'admin_finance';

do $$ begin
  insert into fleetcare.fuel_invoices (tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b001',
          '2026/10', '2026-10-31', '2026-10-01', '2026-10-31', 1);
  assert (select count(*) from fleetcare.fuel_invoices) = 2, 'admin_finance: registra le fatture';
  assert (select count(*) from fleetcare.audit_logs where table_name = 'fuel_invoices') = 2,
    'audit: ogni fattura lascia traccia, anche quella scritta dall''app';
  assert (select count(*) from fleetcare.audit_logs where tenant_id <> fleetcare.app_tenant_id()) = 0,
    'audit: niente righe di altre associazioni';
end $$;

-- ================= associazione B =================
set app.tenant_id = 'b0000000-0000-0000-0000-000000000000';
set app.user_id = 'b0000000-0000-0000-0000-00000000f001';
set app.role = 'admin';

do $$ begin
  assert (select count(*) from fleetcare.vehicles) = 1, 'B: vede solo il proprio mezzo';
  assert (select plate from fleetcare.vehicles) = 'BB111BB', 'B: il mezzo è il suo';
  assert (select count(*) from fleetcare.fuel_logs) = 0, 'B: non vede i rifornimenti di A';
  assert (select count(*) from fleetcare.fuel_invoices) = 0, 'B: non vede le fatture di A';
  assert (select count(*) from fleetcare.tenants) = 1, 'B: vede solo la propria associazione';
end $$;

reset role;
rollback;

\echo 'RLS: tutti i controlli superati'
