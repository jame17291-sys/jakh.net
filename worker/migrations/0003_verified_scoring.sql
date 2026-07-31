CREATE TABLE IF NOT EXISTS verified_score_sessions (
  id TEXT PRIMARY KEY CHECK (length(id) = 24),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  challenge_token_hash TEXT NOT NULL UNIQUE CHECK (length(challenge_token_hash) = 43),
  card_ids_json TEXT NOT NULL CHECK (json_valid(card_ids_json)),
  answer_hashes_json TEXT NOT NULL CHECK (json_valid(answer_hashes_json)),
  question_count INTEGER NOT NULL CHECK (question_count BETWEEN 5 AND 30),
  started_at INTEGER NOT NULL,
  not_before_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  correct_count INTEGER,
  score INTEGER,
  elapsed_ms INTEGER,
  completed_at TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (not_before_at > started_at),
  CHECK (expires_at > not_before_at),
  CHECK (verified = 0 OR status = 'completed'),
  CHECK (
    (
      status = 'completed'
      AND verified = 1
      AND correct_count BETWEEN 0 AND question_count
      AND score BETWEEN 0 AND (question_count * 1000 + 300)
      AND elapsed_ms >= (not_before_at - started_at)
      AND elapsed_ms <= (expires_at - started_at)
      AND completed_at IS NOT NULL
    )
    OR (
      status IN ('pending', 'expired')
      AND verified = 0
      AND correct_count IS NULL
      AND score IS NULL
      AND elapsed_ms IS NULL
      AND completed_at IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS verified_score_sessions_user_idx
  ON verified_score_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS verified_score_sessions_pending_idx
  ON verified_score_sessions(status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS verified_score_sessions_one_pending_idx
  ON verified_score_sessions(user_id, category_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS verified_score_sessions_leaderboard_idx
  ON verified_score_sessions(
    category_id,
    verified,
    status,
    score DESC,
    elapsed_ms ASC,
    completed_at ASC
  );

CREATE INDEX IF NOT EXISTS verified_score_sessions_global_leaderboard_idx
  ON verified_score_sessions(
    verified,
    status,
    score DESC,
    elapsed_ms ASC,
    completed_at ASC
  );

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '3')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
