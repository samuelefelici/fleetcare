-- ============================================================
-- La matrice dei permessi di docs/analisi-campi.md §9, eseguita.
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f packages/db/tests/matrix.test.sql
--
-- Per ogni tabella, ogni ruolo (più uno sconosciuto) e ogni comando prova
-- davvero, con il ruolo applicativo: conta le righe che legge, inserisce
-- una riga (la copia di una esistente, a nome di chi agisce), modifica e
-- cancella «alla cieca» (senza WHERE, come farebbe chi volesse colpire
-- tutto) ciò che può. Ogni scrittura si annulla subito. L'esito si
-- confronta con l'atteso qui sotto, che è la tabella del §9: se una policy
-- sparisce o cambia, o se la documentazione dice altro, il test fallisce.
--
-- I casi fini (solo a proprio nome, solo sulla propria bozza, solo sui
-- propri documenti, le regole dei trigger) li verificano rls.test.sql e
-- rules.test.sql. In una transazione chiusa da ROLLBACK.
-- ============================================================
\set ON_ERROR_STOP on
begin;

-- ---------- dati di prova: almeno una riga per tabella, e righe di persone diverse ----------
insert into fleetcare.tenants (id, name, slug) values
  ('90000000-0000-0000-0000-000000000000', 'Associazione M', 'test-matrice');

insert into fleetcare.profiles (id, tenant_id, full_name, role) values
  ('90000000-0000-0000-0000-00000000c001', '90000000-0000-0000-0000-000000000000', 'Volontario Uno', 'crew'),
  ('90000000-0000-0000-0000-00000000c002', '90000000-0000-0000-0000-000000000000', 'Volontario Due', 'crew'),
  ('90000000-0000-0000-0000-00000000f001', '90000000-0000-0000-0000-000000000000', 'Responsabile mezzi', 'fleet_manager'),
  ('90000000-0000-0000-0000-00000000e001', '90000000-0000-0000-0000-000000000000', 'Responsabile materiale', 'equipment_manager'),
  ('90000000-0000-0000-0000-00000000a001', '90000000-0000-0000-0000-000000000000', 'Amministrazione', 'admin_finance'),
  ('90000000-0000-0000-0000-0000000000ad', '90000000-0000-0000-0000-000000000000', 'Direzione', 'admin');

-- ogni persona ha utenza, un dispositivo e una notifica: «propri» vuol dire uno su sei
insert into fleetcare.profile_accounts (profile_id, tenant_id, email)
select id, tenant_id, right(id::text, 4) || '@m.it' from fleetcare.profiles
 where tenant_id = '90000000-0000-0000-0000-000000000000';
insert into fleetcare.push_subscriptions (tenant_id, profile_id, endpoint, p256dh, auth)
select tenant_id, id, 'https://push.example/' || id, 'k', 'a' from fleetcare.profiles
 where tenant_id = '90000000-0000-0000-0000-000000000000';
insert into fleetcare.notifications (tenant_id, recipient_id, title)
select tenant_id, id, 'Avviso' from fleetcare.profiles
 where tenant_id = '90000000-0000-0000-0000-000000000000';

insert into fleetcare.sites (id, tenant_id, name) values
  ('90000000-0000-0000-0000-000000000501', '90000000-0000-0000-0000-000000000000', 'Sede');
insert into fleetcare.suppliers (id, tenant_id, name) values
  ('90000000-0000-0000-0000-000000000601', '90000000-0000-0000-0000-000000000000', 'Distributore');
insert into fleetcare.vehicles (id, tenant_id, internal_code, plate, category) values
  ('90000000-0000-0000-0000-00000000d001', '90000000-0000-0000-0000-000000000000', '01', 'MM111MM', 'emergency_ambulance'),
  ('90000000-0000-0000-0000-00000000d002', '90000000-0000-0000-0000-000000000000', '02', 'MM222MM', 'medical_car');
insert into fleetcare.vehicle_downtimes (tenant_id, vehicle_id, cause) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d002', 'maintenance');

insert into fleetcare.equipment_types (id, tenant_id, code, label, "group") values
  ('90000000-0000-0000-0000-000000000701', '90000000-0000-0000-0000-000000000000', 'dae', 'DAE', 'electromedical');
insert into fleetcare.equipment (id, tenant_id, equipment_type_id, vehicle_id, serial_number) values
  ('90000000-0000-0000-0000-000000000702', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-000000000701', '90000000-0000-0000-0000-00000000d001', 'SN-1');
insert into fleetcare.equipment_movements (tenant_id, equipment_id, to_vehicle_id) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000702',
   '90000000-0000-0000-0000-00000000d001');
insert into fleetcare.supply_items (id, tenant_id, code, name) values
  ('90000000-0000-0000-0000-000000000801', '90000000-0000-0000-0000-000000000000', 'garze', 'Garze');
insert into fleetcare.supply_lots (tenant_id, supply_item_id, vehicle_id, quantity) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000801',
   '90000000-0000-0000-0000-00000000d001', 10);
insert into fleetcare.kit_requirements (tenant_id, vehicle_category, supply_item_id, min_quantity) values
  ('90000000-0000-0000-0000-000000000000', 'emergency_ambulance', '90000000-0000-0000-0000-000000000801', 5);

insert into fleetcare.deadline_types (id, tenant_id, code, label, subject, interval_months) values
  ('90000000-0000-0000-0000-000000000901', '90000000-0000-0000-0000-000000000000', 'revisione', 'Revisione', 'vehicle', 12);
insert into fleetcare.deadline_rules (tenant_id, deadline_type_id, vehicle_category) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000901', 'emergency_ambulance');
insert into fleetcare.deadlines (id, tenant_id, deadline_type_id, vehicle_id, due_on) values
  ('90000000-0000-0000-0000-000000000902', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-000000000901', '90000000-0000-0000-0000-00000000d001', '2026-12-31'),
  ('90000000-0000-0000-0000-000000000903', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-000000000901', '90000000-0000-0000-0000-00000000d002', '2026-12-31');
insert into fleetcare.deadline_completions (tenant_id, deadline_id, done_on, next_due_on, recorded_by_id) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000902', '2026-09-01', '2027-09-30',
   '90000000-0000-0000-0000-00000000f001');

insert into fleetcare.maintenance_jobs (id, tenant_id, vehicle_id, kind, title) values
  ('90000000-0000-0000-0000-000000000a01', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-00000000d002', 'service', 'Tagliando');
insert into fleetcare.accidents (tenant_id, vehicle_id, occurred_at, description) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d002', '2026-09-01 10:00+02', 'Specchietto');

-- registri dell'equipaggio: una riga per ciascuno dei due volontari
insert into fleetcare.fault_reports (id, tenant_id, vehicle_id, description, severity, reported_by_id) values
  ('90000000-0000-0000-0000-000000000b01', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-00000000d001', 'Spia', 'green', '90000000-0000-0000-0000-00000000c001'),
  ('90000000-0000-0000-0000-000000000b02', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-00000000d001', 'Luce', 'green', '90000000-0000-0000-0000-00000000c002');
insert into fleetcare.fault_report_comments (tenant_id, fault_report_id, author_id, body, internal) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000b01',
   '90000000-0000-0000-0000-00000000c001', 'Foto', false),
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000b01',
   '90000000-0000-0000-0000-00000000f001', 'Nota interna', true);
insert into fleetcare.fuel_logs (tenant_id, vehicle_id, refueled_at, liters, recorded_by_id) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d001', '2026-09-01 08:00+02', 40,
   '90000000-0000-0000-0000-00000000c001'),
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d001', '2026-09-02 08:00+02', 40,
   '90000000-0000-0000-0000-00000000c002');
insert into fleetcare.odometer_readings (tenant_id, vehicle_id, km, read_at, recorded_by_id) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d001', 10000, '2026-09-01 08:00+02',
   '90000000-0000-0000-0000-00000000c001'),
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d001', 10100, '2026-09-02 08:00+02',
   '90000000-0000-0000-0000-00000000c002');
insert into fleetcare.sanitizations (tenant_id, vehicle_id, kind, performed_by_id) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d001', 'routine',
   '90000000-0000-0000-0000-00000000c001'),
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-00000000d001', 'routine',
   '90000000-0000-0000-0000-00000000c002');

-- check-list: una bozza del primo volontario, una inviata del secondo
insert into fleetcare.checklist_templates (id, tenant_id, name) values
  ('90000000-0000-0000-0000-000000000c01', '90000000-0000-0000-0000-000000000000', 'Controllo');
insert into fleetcare.checklist_template_items (id, tenant_id, template_id, section, label) values
  ('90000000-0000-0000-0000-000000000c11', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-000000000c01', 'Mezzo', 'Luci'),
  ('90000000-0000-0000-0000-000000000c12', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-000000000c01', 'Mezzo', 'Gomme');
insert into fleetcare.checklists (id, tenant_id, vehicle_id, template_id, performed_by_id) values
  ('90000000-0000-0000-0000-000000000c21', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-00000000d001', '90000000-0000-0000-0000-000000000c01',
   '90000000-0000-0000-0000-00000000c001'),
  ('90000000-0000-0000-0000-000000000c22', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-00000000d001', '90000000-0000-0000-0000-000000000c01',
   '90000000-0000-0000-0000-00000000c002');
insert into fleetcare.checklist_answers (tenant_id, checklist_id, template_item_id, outcome) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000c21',
   '90000000-0000-0000-0000-000000000c11', 'ok'),
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000c22',
   '90000000-0000-0000-0000-000000000c11', 'ok');
update fleetcare.checklists set submitted_at = now() where id = '90000000-0000-0000-0000-000000000c22';

insert into fleetcare.fuel_invoices (id, tenant_id, supplier_id, number, issued_on, period_from, period_to, total_amount_eur) values
  ('90000000-0000-0000-0000-000000000d01', '90000000-0000-0000-0000-000000000000',
   '90000000-0000-0000-0000-000000000601', '1', '2026-09-30', '2026-09-01', '2026-09-30', 70);
insert into fleetcare.fuel_invoice_lines (tenant_id, invoice_id, line_no, refueled_on, amount_eur) values
  ('90000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000d01', 1, '2026-09-01', 70);

-- allegati: uno per tipo di documento che conta per i permessi
insert into fleetcare.attachments (tenant_id, entity_type, entity_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_id) values
  ('90000000-0000-0000-0000-000000000000', 'vehicle', '90000000-0000-0000-0000-00000000d001',
   'libretto.pdf', 'application/pdf', 1, 'm/1', '90000000-0000-0000-0000-00000000f001'),
  ('90000000-0000-0000-0000-000000000000', 'fault_report', '90000000-0000-0000-0000-000000000b01',
   'spia.jpg', 'image/jpeg', 1, 'm/2', '90000000-0000-0000-0000-00000000c001'),
  ('90000000-0000-0000-0000-000000000000', 'maintenance_job', '90000000-0000-0000-0000-000000000a01',
   'officina.pdf', 'application/pdf', 1, 'm/3', '90000000-0000-0000-0000-00000000f001'),
  ('90000000-0000-0000-0000-000000000000', 'fuel_invoice', '90000000-0000-0000-0000-000000000d01',
   'fattura.pdf', 'application/pdf', 1, 'm/4', '90000000-0000-0000-0000-00000000a001');

-- ---------- la matrice ----------
-- Per ogni tabella e comando, cinque lettere nell'ordine
--   crew · fleet_manager · equipment_manager · admin_finance · admin
-- lettura, modifica, cancellazione: a = tutte le righe dell'associazione,
--   o = solo alcune (le proprie, o quelle che il ruolo può toccare), - = nessuna
-- inserimento: y = la policy lo consente (a proprio nome), - = no
-- Un ruolo sconosciuto non ottiene niente, ovunque.
do $$
declare
  tenant constant uuid := '90000000-0000-0000-0000-000000000000';
  roles constant text[] := array['crew', 'fleet_manager', 'equipment_manager', 'admin_finance', 'admin', 'qualcosa'];
  users constant uuid[] := array[
    '90000000-0000-0000-0000-00000000c001', '90000000-0000-0000-0000-00000000f001',
    '90000000-0000-0000-0000-00000000e001', '90000000-0000-0000-0000-00000000a001',
    '90000000-0000-0000-0000-0000000000ad', '90000000-0000-0000-0000-00000000c001']::uuid[];
  e record;
  info jsonb := '{}';
  t text;
  i int;
  cmd text;
  got text;
  want text;
  n bigint;
  total bigint;
  cols text;
  key text;
  src jsonb;
  over jsonb;
  mismatches text[] := '{}';
  covered text[] := '{}';
  matrix jsonb;
begin
  -- l'atteso
  create temporary table expected (tbl text primary key, sel text, ins text, upd text, del text) on commit drop;
  insert into expected values
    -- anagrafiche e operativo del parco: scrive il responsabile mezzi
    ('vehicles',                 'aaaaa', '-y--y', '-a--a', '-a--a'),
    ('sites',                    'aaaaa', '-y--y', '-a--a', '-a--a'),
    ('suppliers',                'aaaaa', '-y--y', '-a--a', '-a--a'),
    ('vehicle_downtimes',        'aaaaa', '-y--y', '-a--a', '-a--a'),
    ('checklist_templates',      'aaaaa', '-y--y', '-a--a', '-a--a'),
    ('checklist_template_items', 'aaaaa', '-y--y', '-a--a', '-a--a'),
    -- attrezzature, materiale, scadenze: anche il responsabile del materiale
    ('equipment_types',          'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('equipment',                'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('equipment_movements',      'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('supply_items',             'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('supply_lots',              'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('kit_requirements',         'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('deadline_types',           'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('deadline_rules',           'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    ('deadlines',                'aaaaa', '-yy-y', '-aa-a', '-aa-a'),
    -- adempimenti: i responsabili (l'equipaggio solo con una propria sanificazione, rls/rules)
    ('deadline_completions',     'aaaaa', '-yyyy', '-aaaa', '-aaaa'),
    -- interventi e sinistri: contengono costi
    ('maintenance_jobs',         '-aaaa', '-yy-y', '-aaaa', '-a--a'),
    ('accidents',                '-aaaa', '-yy-y', '-aaaa', '-a--a'),
    -- registri dell'equipaggio: tutti inseriscono a proprio nome, correggono i responsabili
    ('fault_reports',            'aaaaa', 'yyyyy', '-aaaa', '-a--a'),
    ('fuel_logs',                'aaaaa', 'yyyyy', '-aaaa', '-a--a'),
    ('odometer_readings',        'aaaaa', 'yyyyy', '-aaaa', '-a--a'),
    ('sanitizations',            'aaaaa', 'yyyyy', '----a', '----a'),
    -- allegati: l'equipaggio non vede fatture, interventi, sinistri; il
    -- responsabile del materiale non vede le fatture; le fatture le toglie
    -- l'amministrazione, il resto il responsabile mezzi (inserimento: rls.test.sql)
    ('attachments',              'oaoaa', null,    '----a', '-o-oa'),
    -- commenti: l'equipaggio non vede le note interne; non si modificano
    ('fault_report_comments',    'oaaaa', 'yyyyy', '-----', '----a'),
    -- check-list: a proprio nome; la bozza la tocca chi la compila, il resto la direzione
    ('checklists',               'aaaaa', 'yyyyy', 'o---a', 'o---a'),
    ('checklist_answers',        'aaaaa', 'y---y', 'o---a', 'o---a'),
    -- fatture carburante
    ('fuel_invoices',            '-a-aa', '---yy', '---aa', '---aa'),
    ('fuel_invoice_lines',       '-a-aa', '---yy', '---aa', '---aa'),
    -- persone
    ('profiles',                 'aaaaa', '----y', '----a', '----a'),
    ('profile_accounts',         'ooooa', '----y', 'ooooa', '----a'),
    ('push_subscriptions',       'oaaaa', 'yyyyy', 'ooooo', 'oaaaa'),
    ('notifications',            'ooooo', '-yyyy', 'ooooo', 'ooooo'),
    -- associazione, audit, contatori
    ('tenants',                  'aaaaa', '-----', '----a', '-----'),
    ('audit_logs',               '---aa', '-----', '-----', '-----'),
    ('document_counters',        '-----', '-----', '-----', '-----');

  -- ogni tabella dello schema ha la sua riga di atteso
  select string_agg(c.relname, ', ') into t
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'fleetcare' and c.relkind = 'r'
     and not exists (select 1 from expected x where x.tbl = c.relname);
  assert t is null, 'tabelle senza riga nella matrice: ' || t;
  -- la tabella temporanea l'app non la legge: l'atteso passa in una variabile
  select jsonb_agg(to_jsonb(x) order by x.tbl) into matrix from expected x;

  -- per ogni tabella, da owner: righe dell'associazione, colonne scrivibili,
  -- la riga da copiare per l'inserimento (di preferenza del primo volontario)
  for e in select * from expected loop
    execute format('select count(*) from fleetcare.%I where %I = $1', e.tbl,
                   case e.tbl when 'tenants' then 'id' else 'tenant_id' end)
      into total using tenant;
    assert total > 0, 'nessuna riga di prova in ' || e.tbl;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a
     where a.attrelid = ('fleetcare.' || e.tbl)::regclass and a.attnum > 0
       and not a.attisdropped and a.attgenerated = '';
    src := null;
    if e.tbl not in ('tenants', 'audit_logs', 'document_counters') then
      execute format(
        'select to_jsonb(x) from fleetcare.%I x where tenant_id = $1
          order by (to_jsonb(x) ->> %L = $2::text) desc, (to_jsonb(x) ->> ''internal'')::boolean nulls first
          limit 1',
        e.tbl,
        case e.tbl
          when 'fault_reports' then 'reported_by_id'
          when 'fault_report_comments' then 'author_id'
          when 'checklists' then 'performed_by_id'
          when 'sanitizations' then 'performed_by_id'
          when 'push_subscriptions' then 'profile_id'
          when 'checklist_answers' then 'checklist_id'
          else 'recorded_by_id' end)
        into src
        using tenant,
              case e.tbl when 'checklist_answers' then '90000000-0000-0000-0000-000000000c21'
                         else '90000000-0000-0000-0000-00000000c001' end;
    else
      execute format('select to_jsonb(x) from fleetcare.%I x where %I = $1 limit 1', e.tbl,
                     case e.tbl when 'tenants' then 'id' else 'tenant_id' end)
        into src using tenant;
    end if;
    info := info || jsonb_build_object(e.tbl, jsonb_build_object('total', total, 'cols', cols, 'src', src));
  end loop;

  for i in 1 .. array_length(roles, 1) loop
    perform set_config('app.tenant_id', tenant::text, true);
    perform set_config('app.user_id', users[i]::text, true);
    perform set_config('app.role', roles[i], true);
    execute 'set role fleetcare_app';

    for e in select * from jsonb_to_recordset(matrix) as (tbl text, sel text, ins text, upd text, del text) loop
      total := (info -> e.tbl ->> 'total')::bigint;
      cols := info -> e.tbl ->> 'cols';
      key := case e.tbl when 'profile_accounts' then 'profile_id' else 'id' end;

      foreach cmd in array array['sel', 'ins', 'upd', 'del'] loop
        want := case cmd when 'sel' then e.sel when 'ins' then e.ins when 'upd' then e.upd else e.del end;
        continue when want is null;
        want := case when i > 5 then '-' else substr(want, i, 1) end;
        begin
          if cmd = 'sel' then
            execute format('select count(*) from fleetcare.%I', e.tbl) into n;
          elsif cmd = 'ins' then
            -- copia di una riga esistente, nuova chiave, a nome di chi agisce
            over := jsonb_build_object(key, case when key = 'id' then gen_random_uuid() else users[i] end)
                    || (select coalesce(jsonb_object_agg(c, users[i]), '{}')
                          from unnest(array['reported_by_id', 'recorded_by_id', 'performed_by_id',
                                            'uploaded_by_id', 'author_id']) c
                         where (info -> e.tbl -> 'src') ? c);
            if e.tbl = 'push_subscriptions' then over := over || jsonb_build_object('profile_id', users[i]); end if;
            if e.tbl = 'checklists' then over := over || '{"submitted_at": null}'; end if;
            execute format('insert into fleetcare.%I (%s) select %s from jsonb_populate_record(null::fleetcare.%I, $1)',
                           e.tbl, cols, cols, e.tbl)
              using (info -> e.tbl -> 'src') || over;
            get diagnostics n = row_count;
          elsif cmd = 'upd' then
            -- «alla cieca»: senza leggere colonne, così valgono solo le policy
            -- di UPDATE (con `set x = x` varrebbero anche quelle di lettura, e
            -- una policy di modifica mancante non si vedrebbe)
            execute format('update fleetcare.%I set %I = $1', e.tbl,
                           case e.tbl when 'tenants' then 'id' else 'tenant_id' end)
              using tenant;
            get diagnostics n = row_count;
          else
            execute format('delete from fleetcare.%I', e.tbl);
            get diagnostics n = row_count;
          end if;
          -- annulla la scrittura (e la lettura non ha niente da annullare)
          raise sqlstate 'ZZ001' using message = n::text;
        exception
          when sqlstate 'ZZ001' then
            n := sqlerrm::bigint;
            got := case
                     when cmd = 'ins' then case when n > 0 then 'y' else '-' end
                     when n = 0 then '-'
                     when n >= total then 'a'
                     else 'o' end;
          when insufficient_privilege then
            got := '-';
          when foreign_key_violation or unique_violation or check_violation or not_null_violation then
            -- la policy ha lasciato passare: si è fermato dopo, su un vincolo
            -- (un mezzo con rifornimenti non si cancella, una copia ha lo stesso codice)
            got := case cmd when 'ins' then 'y' when 'sel' then '?' else 'v' end;
        end;
        if not (got = want or (got = 'v' and want in ('a', 'o'))) then
          mismatches := mismatches || format('%s %s %s: atteso %s, ottenuto %s', roles[i], cmd, e.tbl, want, got);
        end if;
        covered := covered || format('%s/%s/%s', roles[i], cmd, e.tbl);
      end loop;
    end loop;
    execute 'reset role';
  end loop;

  assert cardinality(mismatches) = 0,
    E'la matrice dei permessi non corrisponde:\n  ' || array_to_string(mismatches, E'\n  ');
  raise notice 'matrice: % controlli', cardinality(covered);
end $$;

rollback;

\echo 'Matrice dei permessi: tutti i controlli superati'
