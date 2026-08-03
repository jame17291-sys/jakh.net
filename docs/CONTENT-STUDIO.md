# Content Studio operations

Content Studio lets an administrator correct bilingual questions without editing deployment files. It is intentionally a controlled publication system rather than a direct database editor.

## Workflow

1. Open **Admin → Content Studio**, choose a category, and select a static question.
2. Edit the English and Arabic question, answer, optional explanation, and authoritative HTTPS sources.
3. **Save draft** stores a private version. **Submit for review** marks it ready for approval. Neither action changes the public site.
4. **Publish** requires a recent administrator password confirmation. It copies the reviewed draft into an immutable public snapshot and records the reviewer, time, version, and audit event.
5. **Unpublish** immediately returns visitors to the static version. **Restore** copies a historic snapshot into a new draft; it does not silently republish history.

The public API exposes only published snapshots. Category pages, daily content, server-checked scoring, and Battle mode consume the same published answer. Unsupported and quarantined categories remain unavailable. Schema 8 continues serving the static corpus during rollout; schema 9 enables Content Studio.

## Release and recovery

Migration `0009_content_studio.sql` runs only after the compatibility Worker is live and healthy on schema 8. The protected release workflow exports D1, encrypts the backup, verifies its checksum, restores it into an isolated database, stores the tested encrypted backup off-account, and only then authorizes the schema mutation.

The recurring recovery workflow performs the same encrypted export/restore verification every Sunday at 01:17 UTC. Quarterly drills additionally require a protected real restore exercise. Never bypass these gates or manually alter the published snapshot columns.
