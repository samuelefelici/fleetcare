-- ============================================================
-- Test dei permessi (RLS), eseguiti con il ruolo applicativo vero.
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/rls.test.sql
-- Tutto in una transazione chiusa da ROLLBACK: non lascia traccia.
-- Un'asserzione fallita ferma lo script con codice d'uscita ≠ 0.
-- Le regole che non sono permessi (contachilometri, check-list, adempimenti,
-- valori ereditati) stanno in rules.test.sql.
--
-- Identificativi di prova: tutti a0000000-0000-0000-0000-…, B usa b0000000-…
--   tenant A …000000000000         tenant B b…000000000000
--   persone A: crew …c001, secondo volontario …c002, mezzi …f001,
--              materiale …e001, amministrazione …a001, direzione …ad01
--   persone B: direzione b…ad01, crew b…c001
--   mezzo A …d001                   mezzo B b…d001
-- ============================================================
\set ON_ERROR_STOP on
begin;

-- ---------- struttura: ogni tabella ha RLS e un isolamento scritto giusto ----------
-- Non basta che esista una policy chiamata tenant_isolation: deve essere
-- permissiva, per tutti i comandi, del ruolo applicativo, e confrontare la
-- colonna giusta con il contesto. E non deve esistere nessun'altra policy
-- permissiva: andrebbe in OR con l'isolamento e lo allargherebbe.
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'fleetcare' and c.relkind = 'r'
     and (not c.relrowsecurity
          or not exists (
            select 1 from pg_policies p
             where p.schemaname = 'fleetcare' and p.tablename = c.relname
               and p.policyname = 'tenant_isolation'
               and p.permissive = 'PERMISSIVE' and p.cmd = 'ALL'
               and p.roles = '{fleetcare_app}'
               and p.qual = case when c.relname = 'tenants'
                                 then '(id = fleetcare.app_tenant_id())'
                                 else '(tenant_id = fleetcare.app_tenant_id())' end
               and p.with_check = p.qual));
  assert missing is null, 'tabelle senza RLS o con isolamento tenant sbagliato: ' || missing;

  select string_agg(tablename || '.' || policyname, ', ') into missing
    from pg_policies
   where schemaname = 'fleetcare' and permissive = 'PERMISSIVE' and policyname <> 'tenant_isolation';
  assert missing is null, 'policy permissive oltre l''isolamento: ' || missing;

  -- e su ogni tabella la restrittiva che chiude a un ruolo assente o sconosciuto
  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'fleetcare' and c.relkind = 'r'
     and not exists (
           select 1 from pg_policies p
            where p.schemaname = 'fleetcare' and p.tablename = c.relname
              and p.policyname = 'known_role' and p.permissive = 'RESTRICTIVE'
              and p.cmd = 'ALL' and p.roles = '{fleetcare_app}'
              and p.qual = 'fleetcare.app_has_role(VARIADIC ARRAY[''crew''::text, ''fleet_manager''::text, ''equipment_manager''::text, ''admin_finance''::text, ''admin''::text])'
              and p.with_check = p.qual);
  assert missing is null, 'tabelle senza known_role (o scritta diversa): ' || missing;
end $$;

-- ---------- dati di prova (ruolo owner, fuori dalla RLS) ----------
insert into fleetcare.tenants (id, name, slug) values
  ('a0000000-0000-0000-0000-000000000000', 'Associazione A', 'test-a'),
  ('b0000000-0000-0000-0000-000000000000', 'Associazione B', 'test-b');

insert into fleetcare.profiles (id, tenant_id, full_name, role) values
  ('a0000000-0000-0000-0000-00000000c001', 'a0000000-0000-0000-0000-000000000000', 'Equipaggio A', 'crew'),
  ('a0000000-0000-0000-0000-00000000c002', 'a0000000-0000-0000-0000-000000000000', 'Volontario Due', 'crew'),
  ('a0000000-0000-0000-0000-00000000f001', 'a0000000-0000-0000-0000-000000000000', 'Mezzi A', 'fleet_manager'),
  ('a0000000-0000-0000-0000-00000000e001', 'a0000000-0000-0000-0000-000000000000', 'Materiale A', 'equipment_manager'),
  ('a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-000000000000', 'Amministrazione A', 'admin_finance'),
  ('a0000000-0000-0000-0000-00000000ad01', 'a0000000-0000-0000-0000-000000000000', 'Direzione A', 'admin'),
  ('b0000000-0000-0000-0000-00000000ad01', 'b0000000-0000-0000-0000-000000000000', 'Direzione B', 'admin'),
  ('b0000000-0000-0000-0000-00000000c001', 'b0000000-0000-0000-0000-000000000000', 'Equipaggio B', 'crew');

insert into fleetcare.profile_accounts (profile_id, tenant_id, email, phone, password_hash) values
  ('a0000000-0000-0000-0000-00000000c001', 'a0000000-0000-0000-0000-000000000000', 'crew@a.it', '333 1', 'hash-c001'),
  ('a0000000-0000-0000-0000-00000000c002', 'a0000000-0000-0000-0000-000000000000', 'due@a.it', '333 2', 'hash-c002'),
  ('a0000000-0000-0000-0000-00000000f001', 'a0000000-0000-0000-0000-000000000000', 'mezzi@a.it', null, 'hash-f001'),
  ('b0000000-0000-0000-0000-00000000ad01', 'b0000000-0000-0000-0000-000000000000', 'admin@b.it', null, 'hash-badmin'),
  -- la stessa email in due associazioni: un volontario di due Croci
  ('b0000000-0000-0000-0000-00000000c001', 'b0000000-0000-0000-0000-000000000000', 'due@a.it', null, 'hash-bcrew');

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
insert into fleetcare.checklist_template_items (id, tenant_id, template_id, section, label) values
  ('a0000000-0000-0000-0000-00000000b311', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b301', 'Mezzo', 'Luci');
-- una bozza del SECONDO volontario
insert into fleetcare.checklists (id, tenant_id, vehicle_id, template_id, performed_by_id) values
  ('a0000000-0000-0000-0000-00000000b401', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000b301',
   'a0000000-0000-0000-0000-00000000c002');

-- una segnalazione del secondo volontario
insert into fleetcare.fault_reports (id, tenant_id, vehicle_id, description, severity, reported_by_id) values
  ('a0000000-0000-0000-0000-00000000b903', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'Cassetto rotto', 'green', 'a0000000-0000-0000-0000-00000000c002');

-- una segnalazione del primo volontario, con una nota interna e una risposta pubblica
insert into fleetcare.fault_reports (id, tenant_id, number, vehicle_id, description, severity, reported_by_id) values
  ('a0000000-0000-0000-0000-00000000b901', 'a0000000-0000-0000-0000-000000000000', 'SGN-2026-00001',
   'a0000000-0000-0000-0000-00000000d001', 'Sirena intermittente', 'yellow', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.fault_report_comments (tenant_id, fault_report_id, author_id, body, internal) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
   'a0000000-0000-0000-0000-00000000f001', 'Mi mandi una foto?', false),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
   'a0000000-0000-0000-0000-00000000f001', 'Probabile relè, già visto sul 03', true);

insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'fuel_invoice', 'a0000000-0000-0000-0000-00000000b101',
   'fattura.pdf', 'application/pdf', 1, 'x/fattura.pdf', 'a0000000-0000-0000-0000-00000000a001'),
  ('a0000000-0000-0000-0000-000000000000', 'maintenance_job', 'a0000000-0000-0000-0000-00000000b201',
   'officina.pdf', 'application/pdf', 1, 'x/officina.pdf', 'a0000000-0000-0000-0000-00000000f001'),
  ('a0000000-0000-0000-0000-000000000000', 'vehicle', 'a0000000-0000-0000-0000-00000000d001',
   'libretto.pdf', 'application/pdf', 1, 'x/libretto.pdf', 'a0000000-0000-0000-0000-00000000f001');

insert into fleetcare.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c002', 'https://push.example/due', 'k', 'a');

-- scadenzario: un tipo con storico (…ca01), uno mai usato (…ca02), uno che chiude l'equipaggio (…ca03)
insert into fleetcare.deadline_types (id, tenant_id, code, label, subject, alert_days, completed_by_crew) values
  ('a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-000000000000', 'revisione', 'Revisione', 'vehicle', 60, false),
  ('a0000000-0000-0000-0000-00000000ca02', 'a0000000-0000-0000-0000-000000000000', 'prova', 'Prova', 'vehicle', 30, false),
  ('a0000000-0000-0000-0000-00000000ca03', 'a0000000-0000-0000-0000-000000000000', 'sanificazione', 'Sanificazione', 'vehicle', 5, true);
update fleetcare.deadline_types set interval_days = 30 where id = 'a0000000-0000-0000-0000-00000000ca03';
insert into fleetcare.deadlines (id, tenant_id, deadline_type_id, vehicle_id, label, due_on) values
  ('a0000000-0000-0000-0000-00000000cb01', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-00000000d001', '', '2027-03-31'),
  ('a0000000-0000-0000-0000-00000000cb03', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-00000000d001', 'seconda', null),
  ('a0000000-0000-0000-0000-00000000cb02', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca02', 'a0000000-0000-0000-0000-00000000d001', '', null),
  ('a0000000-0000-0000-0000-00000000cb04', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca03', 'a0000000-0000-0000-0000-00000000d001', '', '2026-09-01');
insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on, recorded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb01', '2026-03-10', '2027-03-31',
   'a0000000-0000-0000-0000-00000000f001');

insert into fleetcare.notifications (tenant_id, recipient_id, title) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c001', 'per crew'),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000f001', 'per mezzi');

-- ---------- da qui in poi: ruolo applicativo ----------
set role fleetcare_app;

-- nessun contesto: non si vede niente
do $$ begin
  assert (select count(*) from fleetcare.vehicles) = 0, 'senza contesto tenant non si vede nessun mezzo';
  assert (select count(*) from fleetcare.profile_accounts) = 0, 'senza contesto non si vede nessun recapito';
end $$;

-- il login trova l'utenza anche senza contesto (unica porta SECURITY DEFINER in lettura)
do $$ begin
  assert (select password_hash from fleetcare.auth_find_profile('test-a', 'CREW@a.it')) = 'hash-c001',
    'auth_find_profile trova l''utenza ignorando le maiuscole';
  assert (select count(*) from fleetcare.auth_find_profile('test-b', 'crew@a.it')) = 0,
    'auth_find_profile non trova l''utenza in un''altra associazione';
  assert (select string_agg(tenant_slug || ':' || full_name, ',' order by tenant_slug)
            from fleetcare.auth_find_accounts('DUE@a.it')) = 'test-a:Volontario Due,test-b:Equipaggio B',
    'auth_find_accounts: la stessa email in due associazioni dà le due utenze, con l''associazione';
  assert (select count(*) from fleetcare.auth_find_accounts('nessuno@a.it')) = 0,
    'auth_find_accounts: email sconosciuta';
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
  assert (select count(*) from fleetcare.attachments) = 1, 'crew: degli allegati vede solo quelli senza denaro';
  assert (select entity_type from fleetcare.attachments) = 'vehicle', 'crew: l''allegato visibile è del mezzo';

  -- la rubrica sì, i recapiti degli altri no
  assert (select count(*) from fleetcare.profiles) = 6, 'crew: legge la rubrica (i nomi) della propria associazione';
  assert (select count(*) from fleetcare.profile_accounts) = 1, 'crew: vede solo i propri recapiti';
  assert (select email from fleetcare.profile_accounts) = 'crew@a.it', 'crew: i recapiti visibili sono i suoi';

  assert (select count(*) from fleetcare.push_subscriptions) = 0, 'crew: non vede i dispositivi degli altri';
  assert (select count(*) from fleetcare.fault_report_comments) = 1, 'crew: non vede le note interne';
end $$;

-- crew registra a proprio nome
insert into fleetcare.fuel_logs (id, tenant_id, vehicle_id, refueled_at, liters, amount_eur, recorded_by_id) values
  ('a0000000-0000-0000-0000-00000000b501', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', '2026-09-10 08:30+02', 40, 70.00, 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.fault_reports (tenant_id, number, vehicle_id, description, severity, reported_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'SGN-2026-00002',
   'a0000000-0000-0000-0000-00000000d001', 'Pedana rumorosa', 'green', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 10000,
   '2026-09-10 08:00+02', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.sanitizations (id, tenant_id, vehicle_id, kind, performed_by_id) values
  ('a0000000-0000-0000-0000-00000000b701', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'periodic', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'fault_report', 'a0000000-0000-0000-0000-00000000b901',
   'spia.jpg', 'image/jpeg', 1, 'x/spia.jpg', 'a0000000-0000-0000-0000-00000000c001');
-- la propria bozza di check-list, con la foto di un'anomalia
insert into fleetcare.checklists (id, tenant_id, vehicle_id, template_id, performed_by_id) values
  ('a0000000-0000-0000-0000-00000000b402', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000b301',
   'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'checklist', 'a0000000-0000-0000-0000-00000000b402',
   'luce.jpg', 'image/jpeg', 1, 'x/luce.jpg', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c001', 'https://push.example/crew', 'k', 'a');
insert into fleetcare.fault_report_comments (tenant_id, fault_report_id, author_id, body) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
   'a0000000-0000-0000-0000-00000000c001', 'Ecco la foto');
-- la sanificazione periodica la chiude l'equipaggio stesso. Date e costo
-- scelti dal client (2099, 99.999 €) si ignorano: decide il database
insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on, cost_eur, sanitization_id, recorded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb04', '2099-01-01', '2099-12-31', 99999,
   'a0000000-0000-0000-0000-00000000b701', 'a0000000-0000-0000-0000-00000000c001');

do $$
declare n int;
begin
  assert (select (due_on, last_done_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb04')
         = ((now() at time zone 'Europe/Rome')::date + 30, (now() at time zone 'Europe/Rome')::date),
    'crew: la sanificazione sposta la scadenza di 30 giorni dal giorno in cui è stata fatta, non dalla data mandata';
  assert (select cost_eur is null from fleetcare.deadline_completions
          where sanitization_id = 'a0000000-0000-0000-0000-00000000b701'),
    'crew: il costo di un adempimento dell''equipaggio non si scrive';
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb04', '2026-10-01',
            'a0000000-0000-0000-0000-00000000b701', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: la stessa sanificazione ha chiuso la scadenza due volte';
  exception when unique_violation then null;
  end;
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb04', '2026-10-01',
            'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: sanificazione periodica chiusa senza nessuna sanificazione';
  exception when insufficient_privilege then null;
  end;
  -- una propria sanificazione valida, ma l'adempimento a nome di un collega
  insert into fleetcare.sanitizations (id, tenant_id, vehicle_id, kind, performed_by_id)
  values ('a0000000-0000-0000-0000-00000000b702', 'a0000000-0000-0000-0000-000000000000',
          'a0000000-0000-0000-0000-00000000d001', 'periodic', 'a0000000-0000-0000-0000-00000000c001');
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb04', '2026-10-01',
            'a0000000-0000-0000-0000-00000000b702', 'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: adempimento registrato a nome di un collega';
  exception when insufficient_privilege then null;
  end;
  -- inviata la propria check-list, non le si allega più niente
  update fleetcare.checklists set submitted_at = now() where id = 'a0000000-0000-0000-0000-00000000b402';
  begin
    insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'checklist', 'a0000000-0000-0000-0000-00000000b402',
            'x.jpg', 'image/jpeg', 1, 'x/x.jpg', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: allegato a una check-list già inviata';
  exception when insufficient_privilege then null;
  end;

  update fleetcare.profile_accounts set phone = '333 9' where profile_id = 'a0000000-0000-0000-0000-00000000c001';
  get diagnostics n = row_count;
  assert n = 1, 'crew: aggiorna il proprio telefono';

  update fleetcare.fuel_logs set liters = 1 where id = 'a0000000-0000-0000-0000-00000000b501';
  get diagnostics n = row_count;
  assert n = 0, 'crew: non corregge un rifornimento già registrato';

  update fleetcare.vehicles set status = 'grounded';
  get diagnostics n = row_count;
  assert n = 0, 'crew: non cambia lo stato dei mezzi';

  -- cancellare tutte le notifiche cancella solo le proprie
  delete from fleetcare.notifications;
  get diagnostics n = row_count;
  assert n = 1, 'crew: cancella solo le proprie notifiche';

  -- ----- registrare a nome di un altro: rifiutato su ogni registro -----
  begin
    insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', now(), 10,
            'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: rifornimento a nome di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.fault_reports (tenant_id, number, vehicle_id, description, severity, reported_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'SGN-2026-00099', 'a0000000-0000-0000-0000-00000000d001',
            'x', 'green', 'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: segnalazione a nome di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 10100, now(),
            'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: lettura km a nome di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.sanitizations (tenant_id, vehicle_id, kind, performed_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 'routine',
            'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: sanificazione a nome di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.checklists (tenant_id, vehicle_id, template_id, performed_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001',
            'a0000000-0000-0000-0000-00000000b301', 'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: check-list a nome di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'fault_report', 'a0000000-0000-0000-0000-00000000b901',
            'x.jpg', 'image/jpeg', 1, 'x/x.jpg', 'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: allegato a nome di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.checklist_answers (tenant_id, checklist_id, template_item_id, outcome)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b401',
            'a0000000-0000-0000-0000-00000000b311', 'ok');
    raise exception 'FAIL crew: ha risposto alla check-list di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'checklist', 'a0000000-0000-0000-0000-00000000b401',
            'x.jpg', 'image/jpeg', 1, 'x/x.jpg', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: allegato alla check-list di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'fault_report', 'a0000000-0000-0000-0000-00000000b903',
            'x.jpg', 'image/jpeg', 1, 'x/x.jpg', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: allegato alla segnalazione di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'fault_report', 'a0000000-0000-0000-0000-00000000b101',
            'x.jpg', 'image/jpeg', 1, 'x/x.jpg', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: allegato «segnalazione» con l''id di una fattura';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  begin
    insert into fleetcare.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c002',
            'https://push.example/finto', 'k', 'a');
    raise exception 'FAIL crew: ha iscritto il dispositivo di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.fault_report_comments (tenant_id, fault_report_id, author_id, body, internal)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
            'a0000000-0000-0000-0000-00000000c001', 'x', true);
    raise exception 'FAIL crew: ha scritto una nota interna';
  exception when insufficient_privilege then null;
  end;

  -- ----- cose che l'equipaggio non fa -----
  begin
    insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'maintenance_job', 'a0000000-0000-0000-0000-00000000b201',
            'x.pdf', 'application/pdf', 1, 'x/x.pdf', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: allegato a un intervento';
  exception when insufficient_privilege or foreign_key_violation then null; -- non vede l'intervento
  end;
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb01', '2026-09-10',
            'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: ha registrato una revisione';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.notifications (tenant_id, recipient_id, title)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000f001', 'spam');
    raise exception 'FAIL crew: ha scritto una notifica';
  exception when insufficient_privilege then null;
  end;
  -- il numero lo assegna il database: quello mandato dall'app si ignora
  insert into fleetcare.fault_reports (id, tenant_id, number, vehicle_id, description, severity, reported_by_id)
  values ('a0000000-0000-0000-0000-00000000b902', 'a0000000-0000-0000-0000-000000000000', 'SGN-2026-99999',
          'a0000000-0000-0000-0000-00000000d001', 'Numero scelto da me', 'green', 'a0000000-0000-0000-0000-00000000c001');
  assert (select number from fleetcare.fault_reports where id = 'a0000000-0000-0000-0000-00000000b902')
         = 'SGN-' || extract(year from now() at time zone 'Europe/Rome')::int || '-00004',
    'numerazione: il database ignora il numero del client e assegna il successivo';
  begin
    insert into fleetcare.fault_reports (tenant_id, vehicle_id, description, severity, reported_by_id, status)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001',
            'Già risolta', 'green', 'a0000000-0000-0000-0000-00000000c001', 'resolved');
    raise exception 'FAIL crew: segnalazione nata già risolta';
  exception when insufficient_privilege then null;
  end;
  begin
    update fleetcare.document_counters set last_value = 0;
    raise exception 'FAIL crew: ha azzerato i contatori';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.vehicles (tenant_id, internal_code, plate, category)
    values ('a0000000-0000-0000-0000-000000000000', '99', 'ZZ999ZZ', 'service_car');
    raise exception 'FAIL crew: ha creato un mezzo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, recorded_by_id)
    values ('b0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000d001', now(), 10,
            'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL crew: ha scritto nell''associazione B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.audit_logs (tenant_id, table_name, action)
    values ('a0000000-0000-0000-0000-000000000000', 'x', 'INSERT');
    raise exception 'FAIL crew: ha scritto nell''audit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform fleetcare.remove_deadline('a0000000-0000-0000-0000-00000000cb02');
    raise exception 'FAIL crew: ha eliminato una scadenza';
  exception when no_data_found then null;
  end;
end $$;

-- ================= un segnale rosso avvisa i responsabili, da solo =================
insert into fleetcare.fault_reports (tenant_id, number, vehicle_id, description, severity, unsafe, area, reported_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'SGN-2026-00003', 'a0000000-0000-0000-0000-00000000d001',
   'Freni che non tengono', 'red', false, 'mechanical', 'a0000000-0000-0000-0000-00000000c001'),
  -- gialla, ma «il mezzo non è sicuro»: avvisa lo stesso
  ('a0000000-0000-0000-0000-000000000000', '', 'a0000000-0000-0000-0000-00000000d001',
   'Portellone che si apre in marcia', 'yellow', true, 'bodywork', 'a0000000-0000-0000-0000-00000000c001'),
  -- un'attrezzatura: avvisa anche il responsabile del materiale
  ('a0000000-0000-0000-0000-000000000000', '', 'a0000000-0000-0000-0000-00000000d001',
   'Aspiratore che non aspira', 'red', false, 'equipment', 'a0000000-0000-0000-0000-00000000c001'),
  -- gialla e sicura: nessun avviso
  ('a0000000-0000-0000-0000-000000000000', '', 'a0000000-0000-0000-0000-00000000d001',
   'Graffio sulla fiancata', 'yellow', false, 'bodywork', 'a0000000-0000-0000-0000-00000000c001');

-- ================= ruolo assente o sconosciuto: si chiude, non si apre =================
set app.role = 'qualcosa';
do $$ begin
  assert (select count(*) from fleetcare.vehicles) = 0, 'ruolo sconosciuto: non vede nemmeno i mezzi';
  assert (select count(*) from fleetcare.fault_report_comments) = 0, 'ruolo sconosciuto: nessun commento';
  begin
    insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', now(), 10,
            'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL: con un ruolo sconosciuto si registra (anche a proprio nome)';
  exception when insufficient_privilege then null;
  end;
end $$;
set app.role = '';
do $$ begin
  assert (select count(*) from fleetcare.vehicles) = 0, 'ruolo assente: non vede niente';
end $$;

-- ================= responsabile mezzi di A =================
set app.user_id = 'a0000000-0000-0000-0000-00000000f001';
set app.role = 'fleet_manager';

do $$
declare n int;
begin
  assert (select count(*) from fleetcare.notifications where kind = 'fault_red') = 3,
    'segnalazione rossa o «non sicuro»: il responsabile mezzi riceve l''avviso dal database';
  assert not exists (select 1 from fleetcare.notifications where body like 'Graffio%'),
    'segnalazione gialla e sicura: nessun avviso';
  assert (select count(*) from fleetcare.fuel_invoices) = 1, 'fleet_manager: legge le fatture per verificarle';
  assert (select count(*) from fleetcare.maintenance_jobs) = 1, 'fleet_manager: legge gli interventi';
  assert (select count(*) from fleetcare.attachments) = 5, 'fleet_manager: legge tutti gli allegati';
  assert (select count(*) from fleetcare.fault_report_comments) = 3, 'fleet_manager: vede anche le note interne';
  assert (select count(*) from fleetcare.push_subscriptions) = 2, 'fleet_manager: legge i dispositivi per gli avvisi';
  assert (select count(*) from fleetcare.profile_accounts) = 1, 'fleet_manager: vede solo i propri recapiti';

  -- registrare per conto di un volontario (il buono di carta portato in sede)
  insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, recorded_by_id)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001',
          '2026-09-15 10:00+02', 35, 'a0000000-0000-0000-0000-00000000c002');

  update fleetcare.vehicles set status = 'maintenance' where id = 'a0000000-0000-0000-0000-00000000d001';
  get diagnostics n = row_count;
  assert n = 1, 'fleet_manager: cambia lo stato del mezzo';

  update fleetcare.fuel_logs set liters = 41 where id = 'a0000000-0000-0000-0000-00000000b501';
  get diagnostics n = row_count;
  assert n = 1, 'fleet_manager: corregge un rifornimento';

  update fleetcare.fault_report_comments set body = 'altro';
  get diagnostics n = row_count;
  assert n = 0, 'fleet_manager: un commento inviato non si modifica';

  update fleetcare.attachments set entity_type = 'vehicle', entity_id = 'a0000000-0000-0000-0000-00000000d001'
   where entity_type = 'maintenance_job';
  get diagnostics n = row_count;
  assert n = 0, 'fleet_manager: un allegato non si modifica (si renderebbe visibile all''equipaggio)';
  delete from fleetcare.attachments where entity_type = 'fuel_invoice';
  get diagnostics n = row_count;
  assert n = 0, 'fleet_manager: i documenti delle fatture li toglie solo l''amministrazione';
  begin
    insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'vehicle', gen_random_uuid(),
            'x.pdf', 'application/pdf', 1, 'x/x.pdf', 'a0000000-0000-0000-0000-00000000f001');
    raise exception 'FAIL: allegato a un mezzo che non esiste';
  exception when foreign_key_violation then null;
  end;

  -- la check-list di un volontario: né la compila al suo posto né ci aggiunge risposte
  begin
    insert into fleetcare.checklists (tenant_id, vehicle_id, template_id, performed_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001',
            'a0000000-0000-0000-0000-00000000b301', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL fleet_manager: check-list a nome di un volontario';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.checklist_answers (tenant_id, checklist_id, template_item_id, outcome)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b401',
            'a0000000-0000-0000-0000-00000000b311', 'anomaly');
    raise exception 'FAIL fleet_manager: risposta nella check-list di un volontario';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.fault_report_comments (tenant_id, fault_report_id, author_id, body)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
            'a0000000-0000-0000-0000-00000000c001', 'x');
    raise exception 'FAIL fleet_manager: ha commentato a nome di un volontario';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.fuel_invoices (tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b001',
            '2026/10', '2026-10-31', '2026-10-01', '2026-10-31', 1);
    raise exception 'FAIL fleet_manager: ha registrato una fattura';
  exception when insufficient_privilege then null;
  end;

  -- ----- scadenzari: eliminare senza perdere lo storico -----
  assert fleetcare.remove_deadline('a0000000-0000-0000-0000-00000000cb02') = 'deleted',
    'scadenza senza storico: si cancella';
  assert not exists (select 1 from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb02'),
    'scadenza senza storico: non c''è più';

  assert fleetcare.remove_deadline('a0000000-0000-0000-0000-00000000cb01') = 'archived',
    'scadenza con storico: si archivia';
  assert (select archived_at is not null from fleetcare.deadlines
          where id = 'a0000000-0000-0000-0000-00000000cb01'), 'scadenza con storico: archiviata';
  assert (select count(*) from fleetcare.deadline_completions
          where deadline_id = 'a0000000-0000-0000-0000-00000000cb01') = 1, 'scadenza con storico: lo storico resta';
  assert fleetcare.remove_deadline('a0000000-0000-0000-0000-00000000cb01') = 'archived',
    'archiviare due volte non è un errore';

  begin
    delete from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb01';
    raise exception 'FAIL: cancellata a mano una scadenza con storico';
  exception when foreign_key_violation then null;
  end;

  update fleetcare.deadlines set archived_at = null where id = 'a0000000-0000-0000-0000-00000000cb01';
  get diagnostics n = row_count;
  assert n = 1, 'una scadenza archiviata si ripristina';

  assert fleetcare.remove_deadline_type('a0000000-0000-0000-0000-00000000ca02') = 'deleted',
    'tipo senza storico: si cancella';
  assert fleetcare.remove_deadline_type('a0000000-0000-0000-0000-00000000ca01') = 'archived',
    'tipo con storico: si archivia';
  assert (select count(*) from fleetcare.deadlines
          where deadline_type_id = 'a0000000-0000-0000-0000-00000000ca01' and archived_at is null) = 0,
    'tipo archiviato: si archiviano anche le sue scadenze';
end $$;

-- ================= responsabile materiale di A =================
set app.user_id = 'a0000000-0000-0000-0000-00000000e001';
set app.role = 'equipment_manager';

do $$
declare n int;
begin
  assert (select string_agg(body, ',') from fleetcare.notifications) = 'Aspiratore che non aspira',
    'equipment_manager: avvisato per l''attrezzatura, non per freni e portellone';
  insert into fleetcare.equipment_types (id, tenant_id, code, label, "group")
  values ('a0000000-0000-0000-0000-00000000b601', 'a0000000-0000-0000-0000-000000000000', 'dae', 'DAE', 'electromedical');
  insert into fleetcare.equipment (tenant_id, equipment_type_id, vehicle_id, serial_number)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b601',
          'a0000000-0000-0000-0000-00000000d001', 'SN-1');

  update fleetcare.vehicles set notes = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'equipment_manager: non modifica l''anagrafica mezzi';
end $$;

-- ================= amministrazione di A =================
set app.user_id = 'a0000000-0000-0000-0000-00000000a001';
set app.role = 'admin_finance';

do $$
declare n int;
begin
  delete from fleetcare.attachments where entity_type = 'vehicle';
  get diagnostics n = row_count;
  assert n = 0, 'admin_finance: i documenti dei mezzi li toglie il responsabile mezzi';
  delete from fleetcare.attachments where entity_type = 'fuel_invoice';
  get diagnostics n = row_count;
  assert n = 1, 'admin_finance: toglie i documenti delle fatture che carica';

  insert into fleetcare.fuel_invoices (tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b001',
          '2026/10', '2026-10-31', '2026-10-01', '2026-10-31', 1);
  assert (select count(*) from fleetcare.fuel_invoices) = 2, 'admin_finance: registra le fatture';
  assert (select count(*) from fleetcare.audit_logs where table_name = 'fuel_invoices') = 2,
    'audit: ogni fattura lascia traccia, anche quella scritta dall''app';
  -- l'archiviazione fatta dal responsabile mezzi, con il suo nome
  assert exists (select 1 from fleetcare.audit_logs
                  where table_name = 'deadline_types' and action = 'UPDATE'
                    and row_id = 'a0000000-0000-0000-0000-00000000ca01'
                    and actor_id = 'a0000000-0000-0000-0000-00000000f001'
                    and diff -> 'new' ->> 'archived_at' is not null),
    'audit: l''archiviazione di un tipo di scadenza resta, con chi l''ha fatta';
  assert (select count(*) from fleetcare.audit_logs where table_name = 'profile_accounts') = 0,
    'audit: le credenziali non finiscono nell''audit';
  assert (select count(*) from fleetcare.audit_logs where tenant_id <> fleetcare.app_tenant_id()) = 0,
    'audit: niente righe di altre associazioni';
  assert (select count(*) from fleetcare.profile_accounts) = 0, 'admin_finance: niente recapiti altrui';
end $$;

-- ================= direzione di A =================
set app.user_id = 'a0000000-0000-0000-0000-00000000ad01';
set app.role = 'admin';

do $$ begin
  assert (select count(*) from fleetcare.notifications where kind = 'fault_red') = 3,
    'segnalazione rossa o «non sicuro»: anche la direzione riceve l''avviso';
  assert (select count(*) from fleetcare.profile_accounts) = 3, 'admin: gestisce i recapiti di tutti';
  insert into fleetcare.profile_accounts (profile_id, tenant_id, email)
  values ('a0000000-0000-0000-0000-00000000e001', 'a0000000-0000-0000-0000-000000000000', 'materiale@a.it');
  begin
    insert into fleetcare.profile_accounts (profile_id, tenant_id, email)
    values ('a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-000000000000', 'MEZZI@a.it');
    raise exception 'FAIL: due persone con la stessa email (maiuscole diverse)';
  exception when unique_violation then null;
  end;
end $$;

-- ================= associazione B =================
set app.tenant_id = 'b0000000-0000-0000-0000-000000000000';
set app.user_id = 'b0000000-0000-0000-0000-00000000ad01';
set app.role = 'admin';

do $$
declare n int;
begin
  assert (select count(*) from fleetcare.vehicles) = 1, 'B: vede solo il proprio mezzo';
  assert (select plate from fleetcare.vehicles) = 'BB111BB', 'B: il mezzo è il suo';
  assert (select count(*) from fleetcare.fuel_logs) = 0, 'B: non vede i rifornimenti di A';
  assert (select count(*) from fleetcare.fuel_invoices) = 0, 'B: non vede le fatture di A';
  assert (select count(*) from fleetcare.profiles) = 2, 'B: vede solo le proprie persone';
  assert (select count(*) from fleetcare.profile_accounts) = 2, 'B: vede solo i propri recapiti';
  assert (select count(*) from fleetcare.tenants) = 1, 'B: vede solo la propria associazione';

  -- ----- riferimenti verso i dati di A: il database li rifiuta a monte -----
  -- credenziali agganciate alla direzione di A (che non ha ancora un'utenza):
  -- con una chiave sul solo id, B entrerebbe in A come admin
  begin
    insert into fleetcare.profile_accounts (profile_id, tenant_id, email, password_hash)
    values ('a0000000-0000-0000-0000-00000000ad01', 'b0000000-0000-0000-0000-000000000000', 'evil@b.it', 'x');
    raise exception 'FAIL B: credenziali su una persona di A';
  exception when foreign_key_violation then null;
  end;
  begin
    update fleetcare.profile_accounts set profile_id = 'a0000000-0000-0000-0000-00000000a001'
     where profile_id = 'b0000000-0000-0000-0000-00000000ad01';
    raise exception 'FAIL B: ha spostato la propria utenza su una persona di A';
  exception when foreign_key_violation then null;
  end;
  assert (select count(*) from fleetcare.auth_find_profile('test-a', 'evil@b.it')) = 0,
    'B: nessuna porta per entrare in A';
  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('b0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 999999,
            now(), 'b0000000-0000-0000-0000-00000000ad01');
    raise exception 'FAIL B: lettura km sul mezzo di A';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, recorded_by_id)
    values ('b0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb01', '2026-09-10',
            'b0000000-0000-0000-0000-00000000ad01');
    raise exception 'FAIL B: adempimento sulla scadenza di A';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into fleetcare.fault_reports (tenant_id, number, vehicle_id, description, severity, reported_by_id)
    values ('b0000000-0000-0000-0000-000000000000', 'SGN-2026-00001', 'a0000000-0000-0000-0000-00000000d001',
            'x', 'green', 'b0000000-0000-0000-0000-00000000ad01');
    raise exception 'FAIL B: segnalazione sul mezzo di A';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into fleetcare.fuel_invoices (id, tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur)
    values ('b0000000-0000-0000-0000-00000000b101', 'b0000000-0000-0000-0000-000000000000',
            'a0000000-0000-0000-0000-00000000b001', '1', '2026-09-30', '2026-09-01', '2026-09-30', 1);
    raise exception 'FAIL B: fattura sul fornitore di A';
  exception when foreign_key_violation then null;
  end;
end $$;

reset role;
rollback;

\echo 'RLS: tutti i controlli superati'
