-- Move "ultra" from terrain to distance concept.
-- Ultra is a distance category (50+ km), not a terrain type.
-- Re-classify existing ultra races as trail (most ultra races are trail-based).

UPDATE races SET terrain = 'trail' WHERE terrain = 'ultra';

-- Recreate the enum without 'ultra'
ALTER TYPE terrain_type RENAME TO terrain_type_old;
CREATE TYPE terrain_type AS ENUM ('road', 'trail', 'cross', 'obstacle', 'mixed');

ALTER TABLE races
  ALTER COLUMN terrain TYPE terrain_type USING terrain::text::terrain_type;

DROP TYPE terrain_type_old;
