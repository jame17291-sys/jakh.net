-- Enrollment is explicit. Existing passwords/sessions are not changed by this
-- migration. The API requires a confirmed factor before privileged operations.
CREATE TABLE admin_totp (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  secret_ciphertext TEXT NOT NULL,
  last_used_step INTEGER NOT NULL DEFAULT -1,
  enabled_at TEXT NOT NULL
);
CREATE TABLE admin_totp_pending (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  previous_credential_id TEXT,
  secret_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE admin_mfa_sessions (
  token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  verified_at TEXT NOT NULL
);
CREATE TABLE admin_mfa_recovery_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_totp(user_id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX admin_mfa_recovery_user_idx ON admin_mfa_recovery_codes(user_id);
CREATE INDEX admin_totp_pending_expiry_idx ON admin_totp_pending(expires_at);
INSERT INTO schema_meta (key, value) VALUES ('schema_version', '10')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
