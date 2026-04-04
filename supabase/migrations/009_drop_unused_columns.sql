-- Drop unused columns: discovery_sources, fts, tags, venue

-- Drop fts index first (depends on the column)
DROP INDEX IF EXISTS idx_races_fts;

-- Drop columns
ALTER TABLE races DROP COLUMN IF EXISTS fts;
ALTER TABLE races DROP COLUMN IF EXISTS discovery_sources;
ALTER TABLE races DROP COLUMN IF EXISTS tags;
ALTER TABLE races DROP COLUMN IF EXISTS venue;
