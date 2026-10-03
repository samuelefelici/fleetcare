-- ============================================================
-- Test delle regole che il database impone da sé: contachilometri,
-- check-list, adempimenti che spostano le scadenze, valori ereditati
-- (vista deadlines_effective, da tenere allineata a `effectiveDeadline`),
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
  ('a0000000-0000-0000-0000-00000000f001', 'a0000000-0000-0000-0000-000000000000', 'Mezzi A', 'fleet_manager');
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
  delete from fleetcare.odometer_readings where id = 'a0000000-0000-0000-0000-00000000b801';
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 50000,
    'odometro: cancellata l''unica lettura, il mezzo torna ai km d''ingresso';
  update fleetcare.vehicles set initial_odometer_km = 50500 where id = 'a0000000-0000-0000-0000-00000000d001';
  assert (select odometer_km from fleetcare.vehicles where id = 'a0000000-0000-0000-0000-00000000d001') = 50500,
    'odometro: senza letture, correggere i km d''ingresso corregge il mezzo';
end $$;

-- ================= check-list: bozza → inviata =================
reset role;
insert into fleetcare.checklist_templates (id, tenant_id, name, version) values
  ('a0000000-0000-0000-0000-00000000b301', 'a0000000-0000-0000-0000-000000000000', 'Controllo', 3);
insert into fleetcare.checklist_template_items (id, tenant_id, template_id, section, label, kind, unit, min_value, safety_critical) values
  ('a0000000-0000-0000-0000-00000000b311', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b301', 'Ossigeno', 'Pressione O2', 'number', 'bar', 50, true),
  ('a0000000-0000-0000-0000-00000000b312', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000b301', 'Mezzo', 'Luci', 'check', null, null, false);

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
            'a0000000-0000-0000-0000-00000000b312', 'anomaly');
    raise exception 'FAIL check-list: risposta aggiunta dopo l''invio';
  exception when insufficient_privilege or unique_violation then null;
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
   'a0000000-0000-0000-0000-00000000ca03', 'a0000000-0000-0000-0000-00000000d001', null, '', null, null, null, null);
update fleetcare.deadlines set due_on = '2026-10-05' where id = 'a0000000-0000-0000-0000-00000000cb05';

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
   'a0000000-0000-0000-0000-00000000cb05', '2027-10-01', '2028-10-05', 'failed', 'a0000000-0000-0000-0000-00000000a001'),
  ('a0000000-0000-0000-0000-00000000cc03', 'a0000000-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000cb05', '2027-10-02', '2028-10-05', 'passed', 'a0000000-0000-0000-0000-00000000a001');
do $$ begin
  assert (select due_on from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05') = '2028-10-05',
    'adempimento: l''ultimo valido sposta la scadenza';
  delete from fleetcare.deadline_completions where id = 'a0000000-0000-0000-0000-00000000cc03';
  assert (select (due_on, last_done_on) from fleetcare.deadlines where id = 'a0000000-0000-0000-0000-00000000cb05')
         = ('2027-10-05'::date, '2026-09-20'::date),
    'adempimento: cancellato l''ultimo valido, torna il precedente (il fallito non conta)';
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
