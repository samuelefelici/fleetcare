-- ============================================================
-- Test delle policy RLS, eseguiti con il ruolo applicativo vero.
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/rls.test.sql
-- Tutto in una transazione chiusa da ROLLBACK: non lascia traccia.
-- Un'asserzione fallita ferma lo script con codice d'uscita ≠ 0.
--
-- Identificativi di prova (tutti a0000000-0000-0000-0000-…, tranne B):
--   tenant A …000000000000         tenant B b0000000-…-000000000000
--   persone: crew …c001, secondo volontario …c002, mezzi …f001,
--            materiale …e001, amministrazione …a001, direzione …ad01
--   mezzo A …d001                   mezzo B b…d001
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

insert into fleetcare.profiles (id, tenant_id, full_name, role) values
  ('a0000000-0000-0000-0000-00000000c001', 'a0000000-0000-0000-0000-000000000000', 'Equipaggio A', 'crew'),
  ('a0000000-0000-0000-0000-00000000c002', 'a0000000-0000-0000-0000-000000000000', 'Volontario Due', 'crew'),
  ('a0000000-0000-0000-0000-00000000f001', 'a0000000-0000-0000-0000-000000000000', 'Mezzi A', 'fleet_manager'),
  ('a0000000-0000-0000-0000-00000000e001', 'a0000000-0000-0000-0000-000000000000', 'Materiale A', 'equipment_manager'),
  ('a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-000000000000', 'Amministrazione A', 'admin_finance'),
  ('a0000000-0000-0000-0000-00000000ad01', 'a0000000-0000-0000-0000-000000000000', 'Direzione A', 'admin');

insert into fleetcare.profile_accounts (profile_id, tenant_id, email, phone, password_hash) values
  ('a0000000-0000-0000-0000-00000000c001', 'a0000000-0000-0000-0000-000000000000', 'crew@a.it', '333 1', 'hash-c001'),
  ('a0000000-0000-0000-0000-00000000c002', 'a0000000-0000-0000-0000-000000000000', 'due@a.it', '333 2', 'hash-c002'),
  ('a0000000-0000-0000-0000-00000000f001', 'a0000000-0000-0000-0000-000000000000', 'mezzi@a.it', null, 'hash-f001');

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
-- check-list compilata dal SECONDO volontario
insert into fleetcare.checklists (id, tenant_id, vehicle_id, template_id, template_version, performed_by_id, signed_name) values
  ('a0000000-0000-0000-0000-00000000b401', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000b301', 1,
   'a0000000-0000-0000-0000-00000000c002', 'Volontario Due');

-- una segnalazione del primo volontario, con una nota interna e una risposta pubblica
insert into fleetcare.fault_reports (id, tenant_id, number, vehicle_id, description, severity, reported_by_id) values
  ('a0000000-0000-0000-0000-00000000b901', 'a0000000-0000-0000-0000-000000000000', 'SGN-2026-00001',
   'a0000000-0000-0000-0000-00000000d001', 'Sirena intermittente', 'yellow', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.fault_report_comments (tenant_id, fault_report_id, author_id, body, internal) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
   'a0000000-0000-0000-0000-00000000f001', 'Mi mandi una foto?', false),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
   'a0000000-0000-0000-0000-00000000f001', 'Probabile relè, già visto sul 03', true);

insert into fleetcare.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c002', 'https://push.example/due', 'k', 'a');

-- scadenzario: un tipo con storico (…ca01) e uno mai usato (…ca02)
insert into fleetcare.deadline_types (id, tenant_id, code, label, subject, alert_days) values
  ('a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-000000000000', 'revisione', 'Revisione', 'vehicle', 60),
  ('a0000000-0000-0000-0000-00000000ca02', 'a0000000-0000-0000-0000-000000000000', 'prova', 'Prova', 'vehicle', 30);
insert into fleetcare.deadlines (id, tenant_id, deadline_type_id, vehicle_id, label, due_on, alert_days, blocking) values
  -- con storico
  ('a0000000-0000-0000-0000-00000000cb01', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-00000000d001', '', '2027-03-31', 60, true),
  -- stesso tipo, senza storico
  ('a0000000-0000-0000-0000-00000000cb03', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-00000000d001', 'seconda', null, 60, true),
  -- tipo mai usato, senza storico
  ('a0000000-0000-0000-0000-00000000cb02', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca02', 'a0000000-0000-0000-0000-00000000d001', '', null, 30, false);
insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb01', '2026-03-10', '2027-03-31');

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

-- il login trova l'utenza anche senza contesto (unica porta SECURITY DEFINER)
do $$ begin
  assert (select password_hash from fleetcare.auth_find_profile('test-a', 'CREW@a.it')) = 'hash-c001',
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

  -- la rubrica sì, i recapiti degli altri no
  assert (select count(*) from fleetcare.profiles) = 6, 'crew: legge la rubrica (i nomi)';
  assert (select count(*) from fleetcare.profile_accounts) = 1, 'crew: vede solo i propri recapiti';
  assert (select email from fleetcare.profile_accounts) = 'crew@a.it', 'crew: i recapiti visibili sono i suoi';

  assert (select count(*) from fleetcare.push_subscriptions) = 0, 'crew: non vede i dispositivi degli altri';
  assert (select count(*) from fleetcare.fault_report_comments) = 1, 'crew: non vede le note interne';
end $$;

-- crew registra a proprio nome: rifornimento, segnalazione, lettura km, iscrizione push
insert into fleetcare.fuel_logs (id, tenant_id, vehicle_id, refueled_at, liters, amount_eur, recorded_by_id) values
  ('a0000000-0000-0000-0000-00000000b501', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', '2026-09-10 08:30+02', 40, 70.00, 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.fault_reports (tenant_id, number, vehicle_id, description, severity, reported_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'SGN-2026-00002',
   'a0000000-0000-0000-0000-00000000d001', 'Pedana rumorosa', 'green', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 10000,
   '2026-09-10 08:00+02', 'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c001', 'https://push.example/crew', 'k', 'a');
insert into fleetcare.fault_report_comments (tenant_id, fault_report_id, author_id, body) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b901',
   'a0000000-0000-0000-0000-00000000c001', 'Ecco la foto');

do $$
declare n int;
begin
  assert (select unit_price_eur from fleetcare.fuel_logs
          where id = 'a0000000-0000-0000-0000-00000000b501') = 1.75,
    'fuel_logs: €/litro calcolato dal database';

  assert (select odometer_km from fleetcare.vehicles
          where id = 'a0000000-0000-0000-0000-00000000d001') = 10000,
    'odometro: la lettura dell''equipaggio aggiorna il mezzo';

  update fleetcare.profile_accounts set phone = '333 9' where profile_id = 'a0000000-0000-0000-0000-00000000c001';
  get diagnostics n = row_count;
  assert n = 1, 'crew: aggiorna il proprio telefono';

  update fleetcare.fuel_logs set liters = 1 where id = 'a0000000-0000-0000-0000-00000000b501';
  get diagnostics n = row_count;
  assert n = 0, 'crew: non corregge un rifornimento già registrato';

  update fleetcare.vehicles set status = 'grounded';
  get diagnostics n = row_count;
  assert n = 0, 'crew: non cambia lo stato dei mezzi';

  -- registrare a nome di un altro volontario
  begin
    insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', now(), 10,
            'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: ha registrato un rifornimento a nome di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.fault_reports (tenant_id, number, vehicle_id, description, severity, reported_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'SGN-2026-00099', 'a0000000-0000-0000-0000-00000000d001',
            'x', 'green', 'a0000000-0000-0000-0000-00000000c002');
    raise exception 'FAIL crew: ha segnalato a nome di un altro';
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
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 9000,
            '2026-09-11 08:00+02', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL odometro: accettata una lettura all''indietro';
  exception when check_violation then null;
  end;

  begin
    insert into fleetcare.audit_logs (tenant_id, table_name, action)
    values ('a0000000-0000-0000-0000-000000000000', 'x', 'INSERT');
    raise exception 'FAIL crew: ha scritto nell''audit';
  exception when insufficient_privilege then null;
  end;

  -- lo scadenzario non lo tocca l'equipaggio
  begin
    perform fleetcare.remove_deadline('a0000000-0000-0000-0000-00000000cb02');
    raise exception 'FAIL crew: ha eliminato una scadenza';
  exception when no_data_found then null;
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

  -- correzione di una lettura km battuta male: passa e aggiorna il mezzo
  insert into fleetcare.odometer_readings (id, tenant_id, vehicle_id, km, read_at, recorded_by_id) values
    ('a0000000-0000-0000-0000-00000000b801', 'a0000000-0000-0000-0000-000000000000',
     'a0000000-0000-0000-0000-00000000d001', 100500, '2026-09-12 08:00+02', 'a0000000-0000-0000-0000-00000000f001');
  update fleetcare.odometer_readings set km = 10500 where id = 'a0000000-0000-0000-0000-00000000b801';
  assert (select odometer_km from fleetcare.vehicles
          where id = 'a0000000-0000-0000-0000-00000000d001') = 10500,
    'odometro: la correzione dell''ultima lettura aggiorna il mezzo';
  begin
    update fleetcare.odometer_readings set km = 9000 where id = 'a0000000-0000-0000-0000-00000000b801';
    raise exception 'FAIL odometro: una correzione ha portato i km sotto la lettura precedente';
  exception when check_violation then null;
  end;
  -- cancellata l'ultima lettura, il mezzo torna alla precedente
  delete from fleetcare.odometer_readings where id = 'a0000000-0000-0000-0000-00000000b801';
  assert (select odometer_km from fleetcare.vehicles
          where id = 'a0000000-0000-0000-0000-00000000d001') = 10000,
    'odometro: cancellata l''ultima lettura, il mezzo riprende la precedente';

  update fleetcare.checklists set signed_name = 'altro';
  get diagnostics n = row_count;
  assert n = 0, 'fleet_manager: una check-list inviata non si modifica';

  update fleetcare.fault_report_comments set body = 'altro';
  get diagnostics n = row_count;
  assert n = 0, 'fleet_manager: un commento inviato non si modifica';

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

  -- ripristinare un'archiviata
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
  assert (select count(*) from fleetcare.audit_logs where table_name = 'deadline_types') > 0,
    'audit: le modifiche agli scadenzari lasciano traccia';
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
set app.user_id = 'b0000000-0000-0000-0000-00000000f001';
set app.role = 'admin';

do $$ begin
  assert (select count(*) from fleetcare.vehicles) = 1, 'B: vede solo il proprio mezzo';
  assert (select plate from fleetcare.vehicles) = 'BB111BB', 'B: il mezzo è il suo';
  assert (select count(*) from fleetcare.fuel_logs) = 0, 'B: non vede i rifornimenti di A';
  assert (select count(*) from fleetcare.fuel_invoices) = 0, 'B: non vede le fatture di A';
  assert (select count(*) from fleetcare.profiles) = 0, 'B: non vede le persone di A';
  assert (select count(*) from fleetcare.profile_accounts) = 0, 'B: non vede i recapiti di A';
  assert (select count(*) from fleetcare.tenants) = 1, 'B: vede solo la propria associazione';
end $$;

reset role;
rollback;

\echo 'RLS: tutti i controlli superati'
