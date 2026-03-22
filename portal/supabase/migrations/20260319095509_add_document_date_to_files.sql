-- Add document_date column for user-selected document date (separate from created_at upload timestamp)
ALTER TABLE public.files ADD COLUMN document_date DATE;

-- Recreate public_files view to include document_date
DROP VIEW IF EXISTS public.public_files;
CREATE OR REPLACE VIEW public.public_files AS
  SELECT
    id,
    display_name,
    file_type,
    public_url,
    storage_path,
    file_size_bytes,
    created_at,
    updated_at,
    document_date,
    blurred_pages,
    sort_order,
    metadata ->> 'category'    AS category,
    metadata ->> 'description' AS description,
    metadata ->> 'slug'        AS slug
  FROM public.files
  WHERE is_public = true
    AND deleted_at IS null
  ORDER BY coalesce(sort_order, 2147483647), created_at;
