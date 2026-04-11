-- Fix: replace partial unique index on official_url with a proper unique
-- constraint so that Supabase upsert (ON CONFLICT) can match it.
-- PostgreSQL allows multiple NULLs in a unique column, so rows without
-- official_url are unaffected.

DROP INDEX IF EXISTS idx_races_official_url;

ALTER TABLE races ADD CONSTRAINT races_official_url_key UNIQUE (official_url);
