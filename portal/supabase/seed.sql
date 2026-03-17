-- HorusEye seed data — LOCAL/STAGING ONLY
-- Creates one admin user in auth.users + user_profiles
-- Usage: supabase db seed (or paste in dashboard SQL editor)

-- NOTE: Supabase Auth users must be created through the API/dashboard, not raw SQL.
-- This seed creates the profile row only. Create the auth user first via:
--   supabase/dashboard > Authentication > Users > Add User
--   email: admin@horuseye.local  password: Admin1234!

-- INSERT profile after creating auth user (replace <uuid> with actual auth.users.id)
-- INSERT INTO public.user_profiles (id, email, full_name, role)
-- VALUES ('<uuid>', 'admin@horuseye.local', 'HorusEye Admin', 'admin');
