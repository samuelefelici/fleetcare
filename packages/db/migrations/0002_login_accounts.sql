-- ============================================================
-- Login con email e password, dall'app web.
--
-- `auth_find_accounts(email)` cerca l'utenza in TUTTE le associazioni:
-- l'email è unica dentro un'associazione, ma la stessa persona può stare
-- in due (un volontario di due Croci). Se ne trova più di una, l'app
-- chiede quale. È, con auth_find_profile, l'unica porta che attraversa la
-- RLS: SECURITY DEFINER, e restituisce solo ciò che serve a verificare la
-- password e ad aprire la sessione.
-- ============================================================
create or replace function fleetcare.auth_find_accounts(p_email text)
  returns table (profile_id uuid, tenant_id uuid, tenant_slug text, tenant_name text,
                 role fleetcare.profile_role, full_name text, password_hash text, active boolean)
  language sql stable security definer set search_path = fleetcare, public as
$$
  select p.id, p.tenant_id, t.slug, t.name, p.role, p.full_name, a.password_hash, p.active
    from fleetcare.profile_accounts a
    join fleetcare.profiles p on p.id = a.profile_id and p.tenant_id = a.tenant_id
    join fleetcare.tenants t on t.id = a.tenant_id
   where lower(a.email) = lower(p_email)
   order by t.name
$$;

-- I permessi del ruolo applicativo, con la funzione nuova: è la stessa
-- funzione della 0001 (create or replace), che il container riapplica a
-- ogni avvio e dopo un ripristino.
create or replace function fleetcare.apply_app_privileges() returns void
  language plpgsql as
$$
begin
  grant usage on schema fleetcare to fleetcare_app;
  grant select, insert, update, delete on all tables in schema fleetcare to fleetcare_app;
  alter default privileges in schema fleetcare
    grant select, insert, update, delete on tables to fleetcare_app;
  revoke insert, update, delete on fleetcare.audit_logs from fleetcare_app;
  revoke insert, delete on fleetcare.tenants from fleetcare_app;
  revoke all on fleetcare.document_counters from fleetcare_app;
  -- il login: le uniche funzioni che attraversano la RLS, solo per l'app
  revoke all on function fleetcare.auth_find_profile(text, text) from public;
  grant execute on function fleetcare.auth_find_profile(text, text) to fleetcare_app;
  revoke all on function fleetcare.auth_find_accounts(text) from public;
  grant execute on function fleetcare.auth_find_accounts(text) to fleetcare_app;
  revoke all on function fleetcare.apply_app_privileges() from public;
  execute format('revoke temporary on database %I from public', current_database());
  alter role fleetcare_app set search_path = fleetcare, public;
end
$$;
select fleetcare.apply_app_privileges();
