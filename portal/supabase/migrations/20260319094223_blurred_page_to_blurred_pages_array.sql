-- Convert blurred_page (single integer) to blurred_pages (integer array) for multi-page blur support

-- Drop dependent view first
DROP VIEW IF EXISTS public.public_files;

-- Add new array column
ALTER TABLE public.files ADD COLUMN blurred_pages INTEGER[];

-- Migrate existing data
UPDATE public.files SET blurred_pages = ARRAY[blurred_page] WHERE blurred_page IS NOT NULL;

-- Drop old column
ALTER TABLE public.files DROP COLUMN blurred_page;

-- Recreate view with new column
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
    blurred_pages,
    sort_order,
    metadata ->> 'category'    AS category,
    metadata ->> 'description' AS description,
    metadata ->> 'slug'        AS slug
  FROM public.files
  WHERE is_public = true
    AND deleted_at IS null
  ORDER BY coalesce(sort_order, 2147483647), created_at;
