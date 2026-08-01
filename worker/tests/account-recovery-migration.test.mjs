import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("schema 7 stores only fixed-length recovery digests and cascades account deletion", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    for (let version = 1; version <= 7; version += 1) {
      const prefix = String(version).padStart(4, "0");
      const directory = new URL("../migrations/", import.meta.url);
      const names = [
        "0001_initial.sql",
        "0002_privacy_preferences.sql",
        "0003_verified_scoring.sql",
        "0004_admin_audit.sql",
        "0005_admin_step_up.sql",
        "0006_privileged_session_activity.sql",
        "0007_account_recovery.sql",
      ];
      const name = names.find((candidate) => candidate.startsWith(prefix));
      database.exec(await readFile(new URL(name, directory), "utf8"));
    }

    database.prepare(
      `INSERT INTO users (
         id, username, username_key, password_hash, password_salt,
         password_iterations, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "user-1",
      "tester",
      "tester",
      "password-hash",
      "password-salt",
      100_000,
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    );
    const digest = "D".repeat(43);
    database.prepare(
      `INSERT INTO account_recovery_codes (user_id, code_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run("user-1", digest, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");

    assert.deepEqual(
      { ...database.prepare("SELECT * FROM account_recovery_codes").get() },
      {
        user_id: "user-1",
        code_hash: digest,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      },
    );
    assert.equal(
      database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get().value,
      "7",
    );
    assert.throws(
      () => database.prepare(
        `UPDATE account_recovery_codes SET code_hash = 'plaintext-recovery-code'
          WHERE user_id = 'user-1'`,
      ).run(),
      /CHECK constraint failed/u,
    );
    database.prepare("DELETE FROM users WHERE id = ?").run("user-1");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM account_recovery_codes").get().count, 0);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
