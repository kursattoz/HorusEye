-- PRD-001 addendum: add columns used by auth flow but missing from initial migration
-- force_password_change: set to true for new users to enforce password reset on first login
-- color_theme: user-selected UI color accent

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color_theme VARCHAR(20) DEFAULT 'red'
    CHECK (color_theme IN ('red', 'pink', 'orange', 'blue'));
