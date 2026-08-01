-- Public account sessions may live longer for a low-friction learning experience.
-- Privileged console access has a separate, server-maintained activity window.
ALTER TABLE sessions ADD COLUMN admin_last_active_at TEXT;

CREATE INDEX IF NOT EXISTS sessions_admin_last_active_idx
ON sessions(admin_last_active_at);

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '6')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
