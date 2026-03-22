-- Postgres function to hard-delete files older than 30 days from soft-delete
-- Note: This only handles the DB side. Storage cleanup should be done via the API endpoint.
-- The API endpoint /api/files/purge handles both storage + DB deletion.

-- For environments with pg_cron (Supabase Pro+), uncomment below:
-- select cron.schedule(
--   'purge-deleted-files',
--   '0 3 * * *',  -- Run daily at 3 AM
--   $$delete from public.files where deleted_at is not null and deleted_at < now() - interval '30 days'$$
-- );
