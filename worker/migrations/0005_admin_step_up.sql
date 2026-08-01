CREATE TABLE IF NOT EXISTS admin_step_ups (
  token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_step_ups_user_id_idx ON admin_step_ups(user_id);

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '5')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
