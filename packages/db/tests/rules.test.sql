-- ============================================================
-- Test delle regole che il database impone da sé: contachilometri,
-- numerazione, check-list, adempimenti che spostano le scadenze (anche
-- quelli dell'equipaggio), valori ereditati (vista deadlines_effective,
-- confrontata con `effectiveDeadline` da tests/effective.dbtest.ts),
-- coerenza degli scadenzari, unicità normalizzate.
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/rules.test.sql
-- In una transazione chiusa da ROLLBACK. Gli identificativi usano
-- a0000000-0000-0000-0000-… come rls.test.sql.
-- ============================================================
\set ON_ERROR_STOP on
begin;

insert into fleetcare.tenants (id, name, slug) values
  ('a0000000-0000-0000-0000-000000000000', 'Associazione A', 'test-a');
insert into fleetcare.profiles (id, tenant_id, full_name, role) values
  ('a0000000-0000-0000-0000-00000000c001', 'a0000000-0000-0000-0000-000000000000', 'Mario Rossi', 'crew'),
  ('a0000000-0000-0000-0000-00000000c002', 'a0000000-0000-0000-0000-000000000000', 'Luca Bianchi', 'crew'),
  ('a0000000-0000-0000-0000-00000000f001', 'a0000000-0000-0000-0000-000000000000', 'Mezzi A', 'fleet_manager'),
  ('a0000000-0000-0000-0000-00000000ad01', 'a0000000-0000-0000-0000-000000000000', 'Direzione A', 'admin');
insert into fleetcare.vehicles (id, tenant_id, internal_code, plate, category, initial_odometer_km) values
  ('a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-000000000000', '01', 'AA111AA', 'emergency_ambulance', 50000),
  ('a0000000-0000-0000-0000-00000000d002', 'a0000000-0000-0000-0000-000000000000', '02', 'AA222AA', 'medical_car', 0);

-- ================= mezzi: unicità sui valori normalizzati =================
do $$ begin
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 50000,
    'un mezzo nuovo parte dai km d''ingresso';
  begin
    insert into fleetcare.vehicles (tenant_id, internal_code, plate, category)
    values ('a0000000-0000-0000-0000-000000000000', '1', 'ZZ999ZZ', 'service_car');
    raise exception 'FAIL: numero interno «1» accettato accanto a «01»';
  exception when unique_violation then null;
  end;
  begin
    insert into fleetcare.vehicles (tenant_id, internal_code, plate, category)
    values ('a0000000-0000-0000-0000-000000000000', '77', 'aa 111-aa', 'service_car');
    raise exception 'FAIL: targa «aa 111-aa» accettata accanto a «AA111AA»';
  exception when unique_violation then null;
  end;
  begin
    insert into fleetcare.vehicles (tenant_id, internal_code, plate, category, fuel_vehicle_code)
    values ('a0000000-0000-0000-0000-000000000000', '78', 'ZZ888ZZ', 'service_car', ' - ');
    raise exception 'FAIL: matricola fatta solo di separatori';
  exception when check_violation then null;
  end;
  update fleetcare.vehicles set fuel_vehicle_code = '0042' where id = 'a0000000-0000-0000-0000-00000000d001';
  begin
    insert into fleetcare.vehicles (tenant_id, internal_code, plate, category, fuel_vehicle_code)
    values ('a0000000-0000-0000-0000-000000000000', '79', 'ZZ777ZZ', 'service_car', '42');
    raise exception 'FAIL: matricola «42» accettata accanto a «0042» (in fattura sono lo stesso mezzo)';
  exception when unique_violation then null;
  end;
end $$;

-- ================= contachilometri =================
set role fleetcare_app;
set app.tenant_id = 'a0000000-0000-0000-0000-000000000000';
set app.user_id = 'a0000000-0000-0000-0000-00000000c001';
set app.role = 'crew';

do $$ begin
  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 49000,
            '2026-09-01 08:00+02', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL odometro: prima lettura sotto i km d''ingresso';
  exception when check_violation then null;
  end;
  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 51000,
            now() + interval '2 days', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL odometro: accettata una lettura nel futuro';
  exception when check_violation then null;
  end;
end $$;

insert into fleetcare.odometer_readings (id, tenant_id, vehicle_id, km, read_at, recorded_by_id) values
  ('a0000000-0000-0000-0000-00000000b801', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 51000, '2026-09-01 08:00+02', 'a0000000-0000-0000-0000-00000000c001');

set app.user_id = 'a0000000-0000-0000-0000-00000000f001';
set app.role = 'fleet_manager';

do $$ begin
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 51000,
    'odometro: la lettura aggiorna il mezzo';
  begin
    update fleetcare.vehicles set odometer_km = 1 where id = 'a0000000-0000-0000-0000-00000000d001';
    raise exception 'FAIL odometro: km del mezzo scritto a mano';
  exception when check_violation then null;
  end;
  -- il permesso del ricalcolo non viene da una variabile che l'app può impostare
  perform set_config('fleetcare.odometer_refresh', 'on', true);
  begin
    update fleetcare.vehicles set odometer_km = 1 where id = 'a0000000-0000-0000-0000-00000000d001';
    raise exception 'FAIL odometro: blocco aggirato con una variabile di sessione';
  exception when check_violation then null;
  end;

  -- 9.000 km in un giorno: è una cifra di troppo, e bloccherebbe le letture vere
  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 60000,
            '2026-09-02 08:00+02', 'a0000000-0000-0000-0000-00000000f001');
    raise exception 'FAIL odometro: salto di 9.000 km in un giorno';
  exception when check_violation then null;
  end;
  insert into fleetcare.odometer_readings (id, tenant_id, vehicle_id, km, read_at, recorded_by_id)
  values ('a0000000-0000-0000-0000-00000000b802', 'a0000000-0000-0000-0000-000000000000',
          'a0000000-0000-0000-0000-00000000d001', 54000, '2026-09-03 08:00+02', 'a0000000-0000-0000-0000-00000000f001');
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 54000,
    'odometro: 3.000 km in due giorni si accettano';
  begin
    update fleetcare.odometer_readings set km = 60000 where id = 'a0000000-0000-0000-0000-00000000b801';
    raise exception 'FAIL odometro: una correzione ha superato la lettura successiva';
  exception when check_violation then null;
  end;
  begin
    update fleetcare.vehicles set initial_odometer_km = 52000 where id = 'a0000000-0000-0000-0000-00000000d001';
    raise exception 'FAIL odometro: km d''ingresso sopra una lettura già registrata';
  exception when check_violation then null;
  end;
  delete from fleetcare.odometer_readings where id = 'a0000000-0000-0000-0000-00000000b802';
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 51000,
    'odometro: cancellata l''ultima lettura, torna la precedente';
  delete from fleetcare.odometer_readings where id = 'a0000000-0000-0000-0000-00000000b801';
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 50000,
    'odometro: cancellata l''unica lettura, il mezzo torna ai km d''ingresso';
  update fleetcare.vehicles set initial_odometer_km = 50500 where id = 'a0000000-0000-0000-0000-00000000d001';
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 50500,
    'odometro: senza letture, correggere i km d''ingresso corregge il mezzo';

  -- mezzo fermo un mese (stesso km): il salto si misura dall'ultima lettura, non dalla prima
  insert into fleetcare.odometer_readings (id, tenant_id, vehicle_id, km, read_at, recorded_by_id) values
    ('a0000000-0000-0000-0000-00000000b803', 'a0000000-0000-0000-0000-000000000000',
     'a0000000-0000-0000-0000-00000000d001', 51000, '2026-08-01 08:00+02', 'a0000000-0000-0000-0000-00000000f001'),
    ('a0000000-0000-0000-0000-00000000b804', 'a0000000-0000-0000-0000-000000000000',
     'a0000000-0000-0000-0000-00000000d001', 51000, '2026-09-05 08:00+02', 'a0000000-0000-0000-0000-00000000f001');
  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 57000,
            '2026-09-06 08:00+02', 'a0000000-0000-0000-0000-00000000f001');
    raise exception 'FAIL odometro: 6.000 km in un giorno dopo un mese fermo';
  exception when check_violation then null;
  end;
  delete from fleetcare.odometer_readings
   where id in ('a0000000-0000-0000-0000-00000000b803', 'a0000000-0000-0000-0000-00000000b804');

  -- la prima lettura, quando si sa di che giorno sono i km d'ingresso
  update fleetcare.vehicles set initial_odometer_km = 85000, initial_odometer_on = '2026-09-01'
   where id = 'a0000000-0000-0000-0000-00000000d002';
  begin
    insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d002', 850000,
            '2026-09-02 08:00+02', 'a0000000-0000-0000-0000-00000000f001');
    raise exception 'FAIL odometro: prima lettura con una cifra di troppo';
  exception when check_violation then null;
  end;
  insert into fleetcare.odometer_readings (id, tenant_id, vehicle_id, km, read_at, recorded_by_id)
  values ('a0000000-0000-0000-0000-00000000b805', 'a0000000-0000-0000-0000-000000000000',
          'a0000000-0000-0000-0000-00000000d002', 87000, '2026-09-02 08:00+02', 'a0000000-0000-0000-0000-00000000f001');
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d002') = 87000,
    'odometro: 2.000 km dal giorno dei km d''ingresso si accettano';
  delete from fleetcare.odometer_readings where id = 'a0000000-0000-0000-0000-00000000b805';
  update fleetcare.vehicles set initial_odometer_km = 0, initial_odometer_on = null
   where id = 'a0000000-0000-0000-0000-00000000d002';
end $$;

-- ================= numerazione dei documenti =================
do $$
declare
  y text := extract(year from now() at time zone 'Europe/Rome')::int::text;
  n1 text;
  n2 text;
begin
  insert into fleetcare.maintenance_jobs (tenant_id, number, vehicle_id, kind, title)
  values ('a0000000-0000-0000-0000-000000000000', 'MAN-2000-00042', 'a0000000-0000-0000-0000-00000000d001',
          'service', 'Tagliando')
  returning number into n1;
  insert into fleetcare.maintenance_jobs (tenant_id, vehicle_id, kind, title)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 'tyres', 'Gomme')
  returning number into n2;
  assert (n1, n2) = ('MAN-' || y || '-00001', 'MAN-' || y || '-00002'),
    'numerazione: il database assegna il numero, in ordine, e ignora quello del client';
  begin
    update fleetcare.maintenance_jobs set number = 'MAN-' || y || '-00099' where number = n1;
    raise exception 'FAIL numerazione: il numero di un intervento è cambiato';
  exception when check_violation then null;
  end;
  begin
    update fleetcare.document_counters set last_value = 0;
    raise exception 'FAIL numerazione: contatori scritti dall''app';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from fleetcare.document_counters;
    raise exception 'FAIL numerazione: contatori letti dall''app (quanti sinistri nell''anno)';
  exception when insufficient_privilege then null;
  end;
  -- pg_trigger_depth() è una prova solo se l'app non può creare trigger propri
  begin
    create temporary table furbo (x int);
    raise exception 'FAIL: l''app crea tabelle temporanee (e con un trigger falserebbe pg_trigger_depth)';
  exception when insufficient_privilege then null;
  end;
end $$;

-- oltre 99.999 le cifre crescono: un numero troncato si ripeterebbe e
-- bloccherebbe tutte le segnalazioni successive
reset role;
update fleetcare.document_counters set last_value = 99999
 where tenant_id = 'a0000000-0000-0000-0000-000000000000' and kind = 'MAN';
set role fleetcare_app;
do $$
declare
  y text := extract(year from now() at time zone 'Europe/Rome')::int::text;
  n1 text;
  n2 text;
begin
  insert into fleetcare.maintenance_jobs (tenant_id, vehicle_id, kind, title)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 'tyres', 'Gomme')
  returning number into n1;
  insert into fleetcare.maintenance_jobs (tenant_id, vehicle_id, kind, title)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', 'tyres', 'Gomme')
  returning number into n2;
  assert (n1, n2) = ('MAN-' || y || '-100000', 'MAN-' || y || '-100001'),
    'numerazione: dopo 99.999 si va a sei cifre, senza ripetere';
end $$;

-- ================= check-list: bozza → inviata =================
reset role;
insert into fleetcare.checklist_templates (id, tenant_id, name, version) values
  ('a0000000-0000-0000-0000-00000000b301', 'a0000000-0000-0000-0000-000000000000', 'Controllo', 3);
insert into fleetcare.checklist_template_items (id, tenant_id, template_id, section, label, kind, unit, min_value, safety_critical) values
  ('a0000000-0000-0000-0000-00000000b311', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b301', 'Ossigeno', 'Pressione O2', 'number', 'bar', 50, true),
  ('a0000000-0000-0000-0000-00000000b312', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b301', 'Mezzo', 'Luci', 'check', null, null, false),
  -- resta senza risposta: serve a provare una risposta aggiunta dopo l'invio
  ('a0000000-0000-0000-0000-00000000b313', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b301', 'Mezzo', 'Gomme', 'check', null, null, false);

set role fleetcare_app;
set app.user_id = 'a0000000-0000-0000-0000-00000000c001';
set app.role = 'crew';

-- la firma la scrive il database, qualunque cosa mandi l'app
insert into fleetcare.checklists (id, tenant_id, vehicle_id, template_id, performed_by_id, signed_name) values
  ('a0000000-0000-0000-0000-00000000b401', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000b301',
   'a0000000-0000-0000-0000-00000000c001', 'Un Altro Nome');
-- 30 bar con esito «ok»: sotto soglia, il database la fa anomalia
insert into fleetcare.checklist_answers (tenant_id, checklist_id, template_item_id, outcome, value_numeric) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b401',
   'a0000000-0000-0000-0000-00000000b311', 'ok', 30),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b401',
   'a0000000-0000-0000-0000-00000000b312', 'ok', null);

do $$
declare n int;
begin
  assert (select signed_name from fleetcare.checklists where id = 'a0000000-0000-0000-0000-00000000b401') = 'Mario Rossi',
    'check-list: firma = nome di chi la compila';
  assert (select template_version from fleetcare.checklists where id = 'a0000000-0000-0000-0000-00000000b401') = 3,
    'check-list: versione del modello presa dal modello';
  assert (select outcome from fleetcare.checklist_answers
          where template_item_id = 'a0000000-0000-0000-0000-00000000b311') = 'anomaly',
    'check-list: voce numerica sotto soglia = anomalia';

  update fleetcare.checklists set submitted_at = now() where id = 'a0000000-0000-0000-0000-00000000b401';
  assert (select has_anomalies and has_safety_anomalies from fleetcare.checklists
          where id = 'a0000000-0000-0000-0000-00000000b401'),
    'check-list: all''invio le anomalie si contano dalle risposte';

  -- inviata: non cambia più
  begin
    insert into fleetcare.checklist_answers (tenant_id, checklist_id, template_item_id, outcome)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b401',
            'a0000000-0000-0000-0000-00000000b313', 'anomaly');
    raise exception 'FAIL check-list: risposta aggiunta dopo l''invio';
  exception when insufficient_privilege then null;
  end;
  update fleetcare.checklist_answers set outcome = 'ok';
  get diagnostics n = row_count;
  assert n = 0, 'check-list: dopo l''invio le risposte non si correggono';
  update fleetcare.checklists set notes = 'x';
  get diagnostics n = row_count;
  assert n = 0, 'check-list: dopo l''invio la testata non si modifica';
  begin
    insert into fleetcare.checklists (tenant_id, vehicle_id, template_id, performed_by_id, submitted_at)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001',
            'a0000000-0000-0000-0000-00000000b301', 'a0000000-0000-0000-0000-00000000c001', now());
    raise exception 'FAIL check-list: nata già inviata';
  exception when check_violation then null;
  end;
end $$;

-- cancellata la propria bozza, se ne vanno anche gli allegati (non restano
-- righe orfane che il volontario non potrebbe togliere)
insert into fleetcare.checklists (id, tenant_id, vehicle_id, template_id, performed_by_id) values
  ('a0000000-0000-0000-0000-00000000b402', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'a0000000-0000-0000-0000-00000000b301',
   'a0000000-0000-0000-0000-00000000c001');
insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id) values
  ('a0000000-0000-0000-0000-000000000000', 'checklist', 'a0000000-0000-0000-0000-00000000b402',
   'luce.jpg', 'image/jpeg', 1, 'x/luce.jpg', 'a0000000-0000-0000-0000-00000000c001');
delete from fleetcare.checklists where id = 'a0000000-0000-0000-0000-00000000b402';
do $$ begin
  assert (select count(*) from fleetcare.attachments where entity_id = 'a0000000-0000-0000-0000-00000000b402') = 0,
    'allegati: cancellata la bozza, i suoi allegati se ne vanno con lei';
end $$;

-- una voce usata non si riscrive: si disattiva
set app.user_id = 'a0000000-0000-0000-0000-00000000f001';
set app.role = 'fleet_manager';
do $$
declare n int;
begin
  begin
    update fleetcare.checklist_template_items set min_value = 80 where id = 'a0000000-0000-0000-0000-00000000b311';
    raise exception 'FAIL check-list: soglia di una voce usata riscritta';
  exception when check_violation then null;
  end;
  update fleetcare.checklist_template_items set active = false where id = 'a0000000-0000-0000-0000-00000000b311';
  get diagnostics n = row_count;
  assert n = 1, 'check-list: una voce usata si disattiva';
end $$;

-- la direzione corregge una check-list inviata, ma non chi l'ha fatta
set app.user_id = 'a0000000-0000-0000-0000-00000000ad01';
set app.role = 'admin';
do $$ begin
  begin
    update fleetcare.checklists set performed_by_id = 'a0000000-0000-0000-0000-00000000c002'
     where id = 'a0000000-0000-0000-0000-00000000b401';
    raise exception 'FAIL check-list: cambiato chi l''ha compilata';
  exception when check_violation then null;
  end;
  begin
    update fleetcare.checklists set submitted_at = null where id = 'a0000000-0000-0000-0000-00000000b401';
    raise exception 'FAIL check-list: tornata in bozza';
  exception when check_violation then null;
  end;
  update fleetcare.checklists set signed_name = 'Altro Nome', has_anomalies = false
   where id = 'a0000000-0000-0000-0000-00000000b401';
  assert (select (signed_name, has_anomalies) from fleetcare.checklists where id = 'a0000000-0000-0000-0000-00000000b401')
         = ('Mario Rossi'::text, true),
    'check-list: firma e anomalie in testata non si scrivono';
  -- la lettura era sbagliata (60 bar, non 30): corretta la risposta, la testata si ricalcola
  update fleetcare.checklist_answers set value_numeric = 60, outcome = 'ok'
   where checklist_id = 'a0000000-0000-0000-0000-00000000b401'
     and template_item_id = 'a0000000-0000-0000-0000-00000000b311';
  assert (select not has_anomalies and not has_safety_anomalies from fleetcare.checklists
          where id = 'a0000000-0000-0000-0000-00000000b401'),
    'check-list: corretta la risposta, le anomalie in testata si ricalcolano';
  assert exists (select 1 from fleetcare.audit_logs where table_name = 'checklist_answers' and action = 'UPDATE'),
    'check-list: la correzione della direzione resta nell''audit';
  begin
    update fleetcare.checklist_answers set checklist_id = gen_random_uuid()
     where checklist_id = 'a0000000-0000-0000-0000-00000000b401';
    raise exception 'FAIL check-list: una risposta spostata su un''altra check-list';
  exception when check_violation then null;
  end;
end $$;

-- ================= scadenze: coerenza, valori effettivi, adempimenti =================
reset role;
insert into fleetcare.equipment_types (id, tenant_id, code, label, "group") values
  ('a0000000-0000-0000-0000-00000000b601', 'a0000000-0000-0000-0000-000000000000', 'dae', 'DAE', 'electromedical');
insert into fleetcare.equipment (id, tenant_id, equipment_type_id, vehicle_id, serial_number) values
  ('a0000000-0000-0000-0000-00000000b701', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b601', 'a0000000-0000-0000-0000-00000000d001', 'SN-1');
insert into fleetcare.deadline_types (id, tenant_id, code, label, subject, interval_months, interval_km, alert_days, alert_km, blocking, renew_from_due, month_end) values
  ('a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-000000000000', 'tagliando', 'Tagliando', 'vehicle', 12, 30000, 30, 2000, false, false, false),
  ('a0000000-0000-0000-0000-00000000ca02', 'a0000000-0000-0000-0000-000000000000', 'verifica', 'Verifica', 'equipment', 24, null, 30, null, false, false, false),
  ('a0000000-0000-0000-0000-00000000ca03', 'a0000000-0000-0000-0000-000000000000', 'rca', 'RCA', 'vehicle', 12, null, 30, null, true, true, false);
insert into fleetcare.deadline_types (id, tenant_id, code, label, subject, interval_days, alert_days, completed_by_crew) values
  ('a0000000-0000-0000-0000-00000000ca04', 'a0000000-0000-0000-0000-000000000000', 'sanificazione', 'Sanificazione', 'vehicle', 30, 5, true);
insert into fleetcare.deadline_types (id, tenant_id, code, label, subject, interval_months, alert_days, renew_from_due, month_end, is_vehicle_tax) values
  ('a0000000-0000-0000-0000-00000000ca05', 'a0000000-0000-0000-0000-000000000000', 'bollo', 'Bollo', 'vehicle', 12, 30, true, true, true);
insert into fleetcare.deadline_rules (tenant_id, deadline_type_id, vehicle_category, equipment_type_id, interval_months, alert_km, blocking) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca01', 'emergency_ambulance', null, 24, 1000, true),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca02', null, 'a0000000-0000-0000-0000-00000000b601', 12, null, null);

do $$ begin
  begin
    insert into fleetcare.deadline_rules (tenant_id, deadline_type_id, equipment_type_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca01',
            'a0000000-0000-0000-0000-00000000b601');
    raise exception 'FAIL: regola di un tipo «da mezzo» su un''attrezzatura';
  exception when check_violation then null;
  end;
  begin
    insert into fleetcare.deadlines (tenant_id, deadline_type_id, equipment_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca01',
            'a0000000-0000-0000-0000-00000000b701');
    raise exception 'FAIL: scadenza «da mezzo» su un''attrezzatura';
  exception when check_violation then null;
  end;
  begin
    insert into fleetcare.deadline_types (tenant_id, code, label, subject, interval_months, renew_from_due, completed_by_crew)
    values ('a0000000-0000-0000-0000-000000000000', 'x', 'X', 'vehicle', 12, true, true);
    raise exception 'FAIL: tipo chiuso dall''equipaggio con il rinnovo dalla scadenza';
  exception when check_violation then null;
  end;
  begin
    insert into fleetcare.deadlines (tenant_id, deadline_type_id, vehicle_id, label, due_on)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca01',
            'a0000000-0000-0000-0000-00000000d001', 'refuso', '0026-10-03');
    raise exception 'FAIL: scadenza nell''anno 26 (il motore TypeScript non la legge)';
  exception when check_violation then null;
  end;
  begin
    insert into fleetcare.deadlines (tenant_id, deadline_type_id, vehicle_id, label, due_on)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca01',
            'a0000000-0000-0000-0000-00000000d001', 'infinito', 'infinity');
    raise exception 'FAIL: scadenza «infinity»';
  exception when check_violation then null;
  end;
  begin
    insert into fleetcare.deadline_types (tenant_id, code, label, subject, interval_months)
    values ('a0000000-0000-0000-0000-000000000000', 'zero', 'Zero', 'vehicle', 0);
    raise exception 'FAIL: periodicità di 0 mesi (scadrebbe il giorno stesso dell''adempimento)';
  exception when check_violation then null;
  end;
  begin
    insert into fleetcare.deadline_rules (tenant_id, deadline_type_id, vehicle_category, alert_days)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca01', 'medical_car', -1);
    raise exception 'FAIL: preavviso negativo';
  exception when check_violation then null;
  end;
end $$;

-- le stesse catene dei test di `effectiveDeadline` (tests/deadlines.test.ts)
insert into fleetcare.deadlines (id, tenant_id, deadline_type_id, vehicle_id, equipment_id, label, interval_months, interval_days, interval_km, blocking) values
  -- ambulanza: regola (24 mesi, preavviso 1000 km, bloccante) + correzione a 40.000 km
  ('a0000000-0000-0000-0000-00000000cb01', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-00000000d001', null, '', null, null, 40000, null),
  -- ambulanza: correzione in giorni (toglie i mesi di regola e tipo) e blocco tolto a mano
  ('a0000000-0000-0000-0000-00000000cb02', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-00000000d001', null, 'giorni', null, 7, null, false),
  -- automedica: nessuna regola per la categoria → vale il tipo
  ('a0000000-0000-0000-0000-00000000cb03', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca01', 'a0000000-0000-0000-0000-00000000d002', null, '', null, null, null, null),
  -- attrezzatura: la regola del suo tipo
  ('a0000000-0000-0000-0000-00000000cb04', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca02', null, 'a0000000-0000-0000-0000-00000000b701', '', null, null, null, null),
  -- RCA dell'ambulanza
  ('a0000000-0000-0000-0000-00000000cb05', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca03', 'a0000000-0000-0000-0000-00000000d001', null, '', null, null, null, null),
  -- sanificazione periodica dell'ambulanza, chiusa dall'equipaggio
  ('a0000000-0000-0000-0000-00000000cb06', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca04', 'a0000000-0000-0000-0000-00000000d001', null, '', null, null, null, null),
  -- bollo dell'automedica
  ('a0000000-0000-0000-0000-00000000cb07', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000ca05', 'a0000000-0000-0000-0000-00000000d002', null, '', null, null, null, null);
update fleetcare.deadlines set due_on = '2026-10-05' where id = 'a0000000-0000-0000-0000-00000000cb05';
update fleetcare.deadlines set due_on = '2026-12-01', due_km = 40000 where id = 'a0000000-0000-0000-0000-00000000cb03';
update fleetcare.deadlines set due_on = '2026-09-01' where id = 'a0000000-0000-0000-0000-00000000cb06';

do $$
declare e record;
begin
  select * into e from fleetcare.deadlines_effective where id = 'a0000000-0000-0000-0000-00000000cb01';
  assert (e.interval_months, e.interval_days, e.interval_km, e.alert_days, e.alert_km, e.blocking, e.overridden)
         is not distinct from (24, null::int, 40000, 30, 1000, true, true),
    'effettivi: la regola corregge il tipo, la scadenza corregge la regola';

  select * into e from fleetcare.deadlines_effective where id = 'a0000000-0000-0000-0000-00000000cb02';
  assert e.interval_months is null and e.interval_days = 7 and e.interval_km = 30000 and not e.blocking,
    'effettivi: giorni sulla scadenza tolgono i mesi; il blocco più vicino vince';

  select * into e from fleetcare.deadlines_effective where id = 'a0000000-0000-0000-0000-00000000cb03';
  assert (e.interval_months, e.interval_km, e.alert_km, e.blocking, e.overridden)
         = (12, 30000, 2000, false, false),
    'effettivi: senza regola per la categoria vale il tipo';

  select * into e from fleetcare.deadlines_effective where id = 'a0000000-0000-0000-0000-00000000cb04';
  assert e.interval_months = 12 and e.subject = 'equipment',
    'effettivi: per un''attrezzatura vale la regola del suo tipo';

  assert (select (due_on, base_due_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05')
         = ('2026-10-05'::date, '2026-10-05'::date),
    'base: la data scritta a mano è la base della scadenza';

  -- la prossima scadenza calcolata dal database (quella degli adempimenti dell'equipaggio)
  assert fleetcare.compute_next_due('a0000000-0000-0000-0000-00000000cb03', '2024-02-29') = '2025-02-28',
    'compute_next_due: 12 mesi dal 29 febbraio finiscono il 28';
  assert fleetcare.compute_next_due('a0000000-0000-0000-0000-00000000cb02', '2026-12-28') = '2027-01-04',
    'compute_next_due: la correzione in giorni della scadenza';
  assert fleetcare.compute_next_due('a0000000-0000-0000-0000-00000000cb06', '2026-01-31') = '2026-03-02',
    'compute_next_due: 30 giorni';
  assert fleetcare.compute_next_due('a0000000-0000-0000-0000-00000000cb07', '2026-03-15') = '2027-03-31',
    'compute_next_due: il bollo scade a fine mese';
end $$;

-- cambiare la regola cambia tutte le scadenze che non sono state corrette a mano
update fleetcare.deadline_rules set alert_km = 1500
 where deadline_type_id = 'a0000000-0000-0000-0000-00000000ca01';
do $$ begin
  assert (select alert_km from fleetcare.deadlines_effective where id = 'a0000000-0000-0000-0000-00000000cb01') = 1500,
    'effettivi: una regola corretta arriva alle scadenze esistenti';
end $$;

-- ----- l'adempimento sposta la scadenza, anche quando lo registra chi non può modificarla -----
insert into fleetcare.profiles (id, tenant_id, full_name, role) values
  ('a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-000000000000', 'Amministrazione A', 'admin_finance');
set role fleetcare_app;
set app.user_id = 'a0000000-0000-0000-0000-00000000a001';
set app.role = 'admin_finance';

insert into fleetcare.deadline_completions (id, tenant_id, deadline_id, done_on, next_due_on, cost_eur, recorded_by_id) values
  ('a0000000-0000-0000-0000-00000000cc01', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000cb05', '2026-09-20', '2027-10-05', 1200, 'a0000000-0000-0000-0000-00000000a001');

do $$
declare n int;
begin
  assert (select (due_on, last_done_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05')
         = ('2027-10-05'::date, '2026-09-20'::date),
    'adempimento: il rinnovo RCA registrato dall''amministrazione sposta la scadenza';
  update fleetcare.deadlines set notes = 'x' where id = 'a0000000-0000-0000-0000-00000000cb05';
  get diagnostics n = row_count;
  assert n = 0, 'adempimento: l''amministrazione continua a non poter modificare la scadenza';
end $$;

-- un adempimento fallito non sposta niente; cancellare l'ultimo ripristina il precedente
insert into fleetcare.deadline_completions (id, tenant_id, deadline_id, done_on, next_due_on, outcome, recorded_by_id) values
  ('a0000000-0000-0000-0000-00000000cc02', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000cb05', '2026-09-25', '2028-10-05', 'failed', 'a0000000-0000-0000-0000-00000000a001'),
  ('a0000000-0000-0000-0000-00000000cc03', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000cb05', '2026-09-26', '2028-10-05', 'passed', 'a0000000-0000-0000-0000-00000000a001');
do $$ begin
  assert (select due_on from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05') = '2028-10-05',
    'adempimento: l''ultimo valido sposta la scadenza';
  delete from fleetcare.deadline_completions where id = 'a0000000-0000-0000-0000-00000000cc03';
  assert (select (due_on, last_done_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05')
         = ('2027-10-05'::date, '2026-09-20'::date),
    'adempimento: cancellato l''ultimo valido, torna il precedente (il fallito non conta)';

  -- lo storico caricato dopo (un rinnovo dell'anno scorso) non riporta indietro la scadenza
  insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on, recorded_by_id)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb05', '2025-09-20', '2026-10-05',
          'a0000000-0000-0000-0000-00000000a001');
  assert (select (due_on, last_done_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05')
         = ('2027-10-05'::date, '2026-09-20'::date),
    'adempimento: uno storico più vecchio non sposta la scadenza';

  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb05',
            (now() at time zone 'Europe/Rome')::date + 5, '2029-10-05', 'a0000000-0000-0000-0000-00000000a001');
    raise exception 'FAIL adempimento: registrato con una data futura';
  exception when check_violation then null;
  end;
end $$;

-- ----- la base: la data a mano non scende sotto ciò che l'adempimento ha fissato -----
set app.user_id = 'a0000000-0000-0000-0000-00000000f001';
set app.role = 'fleet_manager';
do $$ begin
  begin
    update fleetcare.deadlines set due_on = '2027-01-01' where id = 'a0000000-0000-0000-0000-00000000cb05';
    raise exception 'FAIL base: scadenza portata sotto quella fissata dal rinnovo';
  exception when check_violation then null;
  end;
  begin
    update fleetcare.deadlines set base_due_on = '2020-01-01' where id = 'a0000000-0000-0000-0000-00000000cb05';
    raise exception 'FAIL base: scritta direttamente';
  exception when check_violation then null;
  end;
  update fleetcare.deadlines set due_on = '2027-12-31' where id = 'a0000000-0000-0000-0000-00000000cb05';
  assert (select (due_on, base_due_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05')
         = ('2027-12-31'::date, '2027-12-31'::date),
    'base: una data più lontana scritta a mano diventa la nuova base';
  update fleetcare.deadlines set due_on = null where id = 'a0000000-0000-0000-0000-00000000cb05';
  assert (select (due_on, base_due_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05')
         is not distinct from ('2027-10-05'::date, null::date),
    'base: tolta la data a mano, resta quella fissata dal rinnovo';

  -- tagliando dell'automedica: base 1/12/2026 o 40.000 km
  insert into fleetcare.deadline_completions (id, tenant_id, deadline_id, done_on, done_km, next_due_on, next_due_km, recorded_by_id)
  values ('a0000000-0000-0000-0000-00000000cc11', 'a0000000-0000-0000-0000-000000000000',
          'a0000000-0000-0000-0000-00000000cb03', '2026-09-15', 20000, '2027-09-15', 50000,
          'a0000000-0000-0000-0000-00000000f001');
  assert (select (due_on, due_km) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb03')
         = ('2027-09-15'::date, 50000),
    'base: l''adempimento sposta data e km oltre la base';
  insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on, outcome, recorded_by_id)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb03', '2026-09-16', '2028-01-01',
          'failed', 'a0000000-0000-0000-0000-00000000f001');
  assert (select due_on from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb03') = '2027-09-15',
    'base: un adempimento fallito non sposta la scadenza';
  -- si corregge solo il km: la data resta quella dell'adempimento e la sua base non cambia
  update fleetcare.deadlines set due_km = 60000 where id = 'a0000000-0000-0000-0000-00000000cb03';
  assert (select (due_on, due_km, base_due_on, base_due_km) from fleetcare.deadlines
          where id = 'a0000000-0000-0000-0000-00000000cb03')
         = ('2027-09-15'::date, 60000, '2026-12-01'::date, 60000),
    'base: correggere i km non copia nella base la data fissata dall''adempimento';
  delete from fleetcare.deadline_completions where id = 'a0000000-0000-0000-0000-00000000cc11';
  assert (select (due_on, due_km, last_done_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb03')
         is not distinct from ('2026-12-01'::date, 60000, null::date),
    'base: cancellato l''unico adempimento valido, la scadenza torna alla base';
end $$;

-- ----- sanificazione periodica: la chiude l'equipaggio, ma decide il database -----
reset role;
insert into fleetcare.sanitizations (id, tenant_id, vehicle_id, kind, performed_by_id, performed_at) values
  -- propria, periodica, sullo stesso mezzo: valida
  ('a0000000-0000-0000-0000-00000000b951', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'periodic', 'a0000000-0000-0000-0000-00000000c001', now()),
  -- di un altro volontario
  ('a0000000-0000-0000-0000-00000000b952', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'periodic', 'a0000000-0000-0000-0000-00000000c002', now()),
  -- ordinaria, non periodica
  ('a0000000-0000-0000-0000-00000000b953', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'routine', 'a0000000-0000-0000-0000-00000000c001', now()),
  -- su un altro mezzo
  ('a0000000-0000-0000-0000-00000000b954', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d002', 'periodic', 'a0000000-0000-0000-0000-00000000c001', now()),
  -- di 40 giorni fa
  ('a0000000-0000-0000-0000-00000000b955', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000d001', 'periodic', 'a0000000-0000-0000-0000-00000000c001', now() - interval '40 days');
set role fleetcare_app;
set app.user_id = 'a0000000-0000-0000-0000-00000000c001';
set app.role = 'crew';

-- date e costo mandati dall'app (2020, 2099, 500 €) si ignorano
insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on, cost_eur, sanitization_id, recorded_by_id)
values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb06', '2020-01-01', '2099-01-01', 500,
        'a0000000-0000-0000-0000-00000000b951', 'a0000000-0000-0000-0000-00000000c001');

do $$
declare today date := (now() at time zone 'Europe/Rome')::date;
begin
  assert (select (done_on, next_due_on, cost_eur) from fleetcare.deadline_completions
          where sanitization_id = 'a0000000-0000-0000-0000-00000000b951')
         is not distinct from (today, today + 30, null::numeric),
    'equipaggio: data dalla sanificazione, prossima scadenza calcolata, nessun costo';
  assert (select (due_on, last_done_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb06')
         = (today + 30, today),
    'equipaggio: la sanificazione periodica sposta la scadenza di 30 giorni';

  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb06', today,
            'a0000000-0000-0000-0000-00000000b951', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL equipaggio: la stessa sanificazione usata due volte';
  exception when unique_violation then null;
  end;
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb06', today,
            'a0000000-0000-0000-0000-00000000b952', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL equipaggio: chiusa con la sanificazione di un altro';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb06', today,
            'a0000000-0000-0000-0000-00000000b953', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL equipaggio: chiusa con una sanificazione ordinaria';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb06', today,
            'a0000000-0000-0000-0000-00000000b954', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL equipaggio: chiusa con la sanificazione di un altro mezzo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb06', today,
            'a0000000-0000-0000-0000-00000000b955', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL equipaggio: chiusa con una sanificazione di 40 giorni fa';
  exception when check_violation then null;
  end;
  -- l'RCA non è affare dell'equipaggio, anche con una sanificazione valida
  begin
    insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, sanitization_id, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000cb05', today,
            'a0000000-0000-0000-0000-00000000b951', 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL equipaggio: ha rinnovato l''RCA';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ================= scadenzari: archiviare e ricreare =================
set app.user_id = 'a0000000-0000-0000-0000-00000000f001';
set app.role = 'fleet_manager';
do $$ begin
  assert fleetcare.remove_deadline('a0000000-0000-0000-0000-00000000cb05') = 'archived', 'RCA con storico archiviata';
  insert into fleetcare.deadlines (tenant_id, deadline_type_id, vehicle_id)
  values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000ca03',
          'a0000000-0000-0000-0000-00000000d001');
  assert fleetcare.remove_deadline_type('a0000000-0000-0000-0000-00000000ca03') = 'archived', 'tipo RCA archiviato';
  insert into fleetcare.deadline_types (tenant_id, code, label, subject)
  values ('a0000000-0000-0000-0000-000000000000', 'rca', 'RCA nuova', 'vehicle');
  begin
    update fleetcare.deadline_types set subject = 'equipment' where id = 'a0000000-0000-0000-0000-00000000ca01';
    raise exception 'FAIL: un tipo usato ha cambiato soggetto';
  exception when check_violation then null;
  end;
end $$;

-- ================= fatture e dispositivi =================
reset role;
insert into fleetcare.suppliers (id, tenant_id, name) values
  ('a0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-000000000000', 'Distributore');
insert into fleetcare.fuel_invoices (tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b001', '12', '2026-01-31', '2026-01-01', '2026-01-31', 1),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b001', '12', '2027-01-31', '2027-01-01', '2027-01-31', 1);
do $$ begin
  begin
    insert into fleetcare.fuel_invoices (tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000b001',
            '12', '2027-06-30', '2027-06-01', '2027-06-30', 1);
    raise exception 'FAIL: due fatture n. 12 dello stesso fornitore nello stesso anno';
  exception when unique_violation then null;
  end;
  begin
    insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, amount_eur, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', now(),
            0.01, 9999, 'a0000000-0000-0000-0000-00000000c001');
    -- passa: 9999 € / 0,01 L sta nella colonna calcolata; il limite è sui valori assurdi
  end;
  begin
    insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, recorded_by_id)
    values ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000d001', now(),
            5000, 'a0000000-0000-0000-0000-00000000c001');
    raise exception 'FAIL: rifornimento da 5.000 litri';
  exception when check_violation then null;
  end;
end $$;

-- lo stesso browser per due persone (chi esce e chi entra)
insert into fleetcare.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth) values
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000c001', 'https://push.example/x', 'k', 'a'),
  ('a0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000f001', 'https://push.example/x', 'k', 'a');

rollback;

\echo 'Regole: tutti i controlli superati'
