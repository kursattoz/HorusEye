ALTER TABLE files
  ADD COLUMN IF NOT EXISTS category    varchar(50)  DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS description text         DEFAULT NULL;
