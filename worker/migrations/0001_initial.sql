CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  avatar TEXT NOT NULL DEFAULT '👤',
  role TEXT NOT NULL DEFAULT 'USER',
  is_banned INTEGER NOT NULL DEFAULT 0,
  streak_freeze_count INTEGER NOT NULL DEFAULT 0,
  streak_freeze_highest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  status TEXT NOT NULL,
  first_correct_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS progress_user_id_idx ON progress(user_id);
CREATE INDEX IF NOT EXISTS progress_score_idx ON progress(user_id, status);
CREATE INDEX IF NOT EXISTS progress_streak_idx ON progress(user_id, first_correct_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  email TEXT,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS suggestions_created_at_idx ON suggestions(created_at);

CREATE TABLE IF NOT EXISTS analytics_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_slug TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  time_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, page_slug, activity_date)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx ON rate_limits(expires_at);
