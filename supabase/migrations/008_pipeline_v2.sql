-- Pipeline v2: Clean slate + new columns for discovery/extraction pipeline
-- This migration wipes all existing race data and adds columns for the new
-- 2-phase pipeline (discoverer → extractor).

-- 1. Truncate all tables (cascade clears FK-dependent tables)
TRUNCATE races CASCADE;
TRUNCATE missing_race_reports;

-- 2. Drop columns from old pipeline
ALTER TABLE races DROP COLUMN IF EXISTS source_count;

-- 3. Add new pipeline columns

-- The official race website URL (single source of truth for extraction)
ALTER TABLE races ADD COLUMN official_url text;

-- Pipeline status tracking
ALTER TABLE races ADD COLUMN extraction_status text NOT NULL DEFAULT 'pending'
  CHECK (extraction_status IN ('pending', 'extracted', 'failed', 'stale', 'no_url', 'complete'));

-- When LLM last extracted data from the official URL
ALTER TABLE races ADD COLUMN extracted_at timestamptz;

-- Which aggregator sources discovered this race (e.g. {'behej','ceskybeh'})
ALTER TABLE races ADD COLUMN discovery_sources text[] NOT NULL DEFAULT '{}';

-- Consecutive extraction failure count (mark stale after 3)
ALTER TABLE races ADD COLUMN extraction_failures integer NOT NULL DEFAULT 0;

-- 4. Indexes for the new pipeline

-- Unique constraint on official_url (primary dedup key)
CREATE UNIQUE INDEX idx_races_official_url ON races (official_url)
  WHERE official_url IS NOT NULL;

-- Find races needing extraction
CREATE INDEX idx_races_extraction_status ON races (extraction_status)
  WHERE extraction_status IN ('pending', 'failed');
