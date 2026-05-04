-- public_files: read-only view of files marked as public (not soft-deleted)
-- Note: blurred_page/sort_order are added by 20260317210053 and the view is
-- later dropped + recreated with the blurred_pages array column by
-- 20260319094223. This file intentionally omits those columns so the
-- migration set applies cleanly from scratch (e.g. CI E2E supabase start).
create or replace view public.public_files as
  select
    id,
    display_name,
    file_type,
    public_url,
    storage_path,
    file_size_bytes,
    created_at,
    updated_at,
    metadata ->> 'category'    as category,
    metadata ->> 'description' as description,
    metadata ->> 'slug'        as slug
  from public.files
  where is_public = true
    and deleted_at is null
  order by created_at;
