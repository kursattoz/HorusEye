-- PRD-001: user_profiles table (extends auth.users)
-- 'guest' role is NOT stored in DB — it's application-layer only

CREATE TABLE public.user_profiles (
  id          UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  full_name   VARCHAR(100),
  role        VARCHAR(20)  NOT NULL DEFAULT 'assistant'
                           CHECK (role IN ('admin', 'supervisor', 'assistant')),
  team_id     VARCHAR(50)  DEFAULT 'horuseye-team',
  is_active   BOOLEAN      DEFAULT true,
  avatar_url  TEXT,
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ  DEFAULT NULL  -- soft delete
);

-- RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON public.user_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "user_own_profile" ON public.user_profiles
  FOR SELECT USING (id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
