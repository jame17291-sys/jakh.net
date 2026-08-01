-- Administrative security events must survive account deletion so the audit
-- trail remains useful.  The actor link is deliberately optional: deleting a
-- user removes the identifying account row while preserving the event itself.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE admin_audit_log_v8 (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT INTO admin_audit_log_v8 (
  id,
  actor_user_id,
  action,
  target_type,
  target_id,
  detail,
  created_at
)
SELECT
  id,
  actor_user_id,
  action,
  target_type,
  target_id,
  detail,
  created_at
FROM admin_audit_log;

DROP TABLE admin_audit_log;

ALTER TABLE admin_audit_log_v8 RENAME TO admin_audit_log;

CREATE INDEX admin_audit_log_created_at_idx
  ON admin_audit_log(created_at DESC);

-- The account-recovery and audit-retention disclosures materially change the
-- account privacy notice. Database enforcement must require the same current
-- notice version as the Worker before recording any new account analytics.
DROP TRIGGER IF EXISTS analytics_daily_requires_current_consent;

CREATE TRIGGER analytics_daily_requires_current_consent
BEFORE INSERT ON analytics_daily
WHEN NOT EXISTS (
  SELECT 1
    FROM privacy_preferences
   WHERE user_id = NEW.user_id
     AND usage_analytics_enabled = 1
     AND notice_version = '2026-08-01'
)
BEGIN
  SELECT RAISE(IGNORE);
END;

-- Fail the migration here if the rebuild left any unresolved reference.
PRAGMA defer_foreign_keys = OFF;

PRAGMA optimize;

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '8')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
