-- 0002 · Identity and privileges.
-- One person may use this database: the verified email below, signed in through Supabase Auth.
-- The anon key alone reaches nothing. Sign-ups, anonymous sign-ins and email change are off in Auth settings.

create or replace function app.is_owner() returns boolean
language sql stable security invoker set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'fainshteinbar@gmail.com'
     and coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- Policies run as the signed-in role, so it needs to reach app.is_owner() and nothing else in app.
-- The app schema is not exposed by the API (only public is), so this grants no new endpoint.
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon, authenticated;
revoke all on all tables in schema app from public, anon, authenticated;
grant execute on function app.is_owner() to authenticated;

-- Functions created from now on are private until granted one by one.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;

-- Tables: nothing for anon, only what the app needs for authenticated.
revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.settings to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.document_items to authenticated;
grant select on public.audit_log to authenticated;
revoke all on all sequences in schema public from anon, authenticated;

insert into app.migrations (name) values ('0002_auth') on conflict do nothing;
