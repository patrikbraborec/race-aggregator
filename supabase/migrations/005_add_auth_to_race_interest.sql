-- Add user authentication support to race_interest
-- Backward compatible: existing anonymous rows (user_id = NULL) are preserved

-- Add user_id column (nullable for backward compat)
ALTER TABLE race_interest ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add referral tracking column
ALTER TABLE race_interest ADD COLUMN referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for "My Races" queries
CREATE INDEX idx_race_interest_user ON race_interest (user_id) WHERE user_id IS NOT NULL;

-- Prevent duplicate interest per user per race
CREATE UNIQUE INDEX idx_race_interest_user_race ON race_interest (user_id, race_id) WHERE user_id IS NOT NULL;

-- Update RLS policies
DROP POLICY "Anyone can register interest" ON race_interest;

-- Anonymous users can still insert (rows without user_id)
CREATE POLICY "Anonymous can register interest"
  ON race_interest FOR INSERT
  WITH CHECK (user_id IS NULL);

-- Authenticated users can insert their own interest
CREATE POLICY "Authenticated users can register interest"
  ON race_interest FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Keep existing read policy ("Anyone can read interest" remains)

-- Authenticated users can delete their own interest
CREATE POLICY "Users can delete own interest"
  ON race_interest FOR DELETE
  USING (auth.uid() = user_id);

-- Referral events table for analytics
CREATE TABLE referral_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  race_id     uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_events_referrer ON referral_events (referrer_id);

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own referrals"
  ON referral_events FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Referred user can insert referral"
  ON referral_events FOR INSERT
  WITH CHECK (auth.uid() = referred_id);
