
-- public_files: read-only view of files marked as public (not soft-deleted)
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
    blurred_page,
    sort_order,
    metadata ->> 'category'    as category,
    metadata ->> 'description' as description,
    metadata ->> 'slug'        as slug
  from public.files
  where is_public = true
    and deleted_at is null
  order by coalesce(sort_order, 2147483647), created_at;
