
-- Add blurred_page: which PDF page to blur (e.g., exam questions)
alter table public.files add column if not exists blurred_page integer;

-- Add sort_order: admin manual ordering for public file list
alter table public.files add column if not exists sort_order integer;
