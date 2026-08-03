-- D1-backed editorial drafts and immutable revision snapshots. Public clients
-- read only published_snapshot_json, so saving a new draft never changes the
-- last approved production wording.
CREATE TABLE content_question_edits (
  question_id TEXT PRIMARY KEY,
  category_slug TEXT NOT NULL,
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  workflow_status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (workflow_status IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  published_version INTEGER CHECK (published_version IS NULL OR published_version >= 1),
  published_snapshot_json TEXT CHECK (
    published_snapshot_json IS NULL OR json_valid(published_snapshot_json)
  ),
  editor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  CHECK (
    (published_version IS NULL AND published_snapshot_json IS NULL AND published_at IS NULL)
    OR
    (published_version IS NOT NULL AND published_snapshot_json IS NOT NULL AND published_at IS NOT NULL)
  ),
  CHECK (
    workflow_status != 'PUBLISHED'
    OR (published_version IS NOT NULL AND published_snapshot_json IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE INDEX content_question_edits_category_idx
  ON content_question_edits(category_slug, workflow_status, updated_at DESC);

CREATE INDEX content_question_edits_published_idx
  ON content_question_edits(category_slug, published_at DESC)
  WHERE published_snapshot_json IS NOT NULL;

CREATE TABLE content_question_revisions (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES content_question_edits(question_id) ON DELETE CASCADE,
  category_slug TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  action TEXT NOT NULL CHECK (action IN ('CREATED', 'UPDATED', 'SUBMITTED', 'PUBLISHED', 'RESTORED', 'UNPUBLISHED')),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE(question_id, version, action)
);

CREATE INDEX content_question_revisions_question_idx
  ON content_question_revisions(question_id, created_at DESC);

PRAGMA optimize;

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '9')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
