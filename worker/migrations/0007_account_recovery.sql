-- Recovery codes are bearer credentials. Persist only a one-way digest and
-- keep exactly one current code per account so every successful use or
-- authenticated rotation invalidates the previous code.
CREATE TABLE account_recovery_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE CHECK (length(code_hash) = 43),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '7')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
