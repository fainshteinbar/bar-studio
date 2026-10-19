-- Seed · the single settings row. Run once per project, after install.sql.
-- Every value here is public on the website already. The supplier address is typed in the app
-- (Settings screen) and lives only in Supabase. Running this again changes nothing.

insert into public.settings (id) values (true) on conflict (id) do nothing;
