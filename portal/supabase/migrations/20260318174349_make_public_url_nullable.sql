-- Private files no longer store a permanent public_url;
-- they use short-lived signed URLs generated on demand via /d/[id].
ALTER TABLE files ALTER COLUMN public_url DROP NOT NULL;
