CREATE TABLE IF NOT EXISTS privacy_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  usage_analytics_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (usage_analytics_enabled IN (0, 1)),
  notice_version TEXT NOT NULL,
  consent_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_daily_activity_date_idx
  ON analytics_daily(activity_date);

-- Existing rows predate explicit, versioned consent and therefore have no
-- reliable consent provenance. Start the opt-in system from a clean state.
DELETE FROM analytics_daily;

-- Enforce opt-in at the database boundary too. This prevents an older Worker
-- instance from recreating analytics rows during the migration/deploy window.
CREATE TRIGGER IF NOT EXISTS analytics_daily_requires_current_consent
BEFORE INSERT ON analytics_daily
WHEN NOT EXISTS (
  SELECT 1
    FROM privacy_preferences
   WHERE user_id = NEW.user_id
     AND usage_analytics_enabled = 1
     AND notice_version = '2026-07-31'
)
BEGIN
  SELECT RAISE(IGNORE);
END;

ALTER TABLE suggestions
  ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS suggestions_user_id_idx
  ON suggestions(user_id);

PRAGMA optimize;

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '2')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
