-- Rate-limit anonymous report submissions at the database level.
-- Prevents spam even if the client-side cooldown is bypassed.

-- race_reports: max 1 report per race per minute (by matching race_id + recency)
DROP POLICY IF EXISTS "Anyone can create a report" ON race_reports;
CREATE POLICY "Rate-limited report creation"
  ON race_reports FOR INSERT
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM race_reports r
      WHERE r.race_id = race_id
        AND r.created_at > now() - interval '1 minute'
    )
  );

-- missing_race_reports: max 1 report per URL per minute
DROP POLICY IF EXISTS "Anyone can create a missing race report" ON missing_race_reports;
CREATE POLICY "Rate-limited missing race report creation"
  ON missing_race_reports FOR INSERT
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM missing_race_reports r
      WHERE r.url = url
        AND r.created_at > now() - interval '1 minute'
    )
  );
