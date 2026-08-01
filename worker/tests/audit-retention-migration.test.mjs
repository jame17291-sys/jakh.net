import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationsDirectory = new URL("../migrations/", import.meta.url);

async function migrationFiles() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
}

function insertUser(database, id, username) {
  database.prepare(
    `INSERT INTO users (
       id, username, username_key, password_hash, password_salt,
       password_iterations, role, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    username,
    username.toLowerCase(),
    "password-hash",
    "password-salt",
    100_000,
    "ADMIN",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  );
}

function auditRows(database) {
  return database.prepare(
    `SELECT id, actor_user_id, action, target_type, target_id, detail, created_at
       FROM admin_audit_log
      ORDER BY id`,
  ).all().map((row) => ({ ...row }));
}

test("migrations 0001-0008 retain every audit event and anonymize a deleted actor", async () => {
  const files = (await migrationFiles())
    .filter((name) => Number(name.slice(0, 4)) <= 8);
  assert.deepEqual(
    files.map((name) => name.slice(0, 4)),
    ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008"],
    "D1 migrations must remain contiguous through schema 8",
  );

  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  try {
    const expectedRows = [
      {
        id: "audit-1",
        actor_user_id: "actor-to-delete",
        action: "user.role_changed",
        target_type: "user",
        target_id: "member-1",
        detail: '{"from":"USER","to":"ADMIN","reason":"approved"}',
        created_at: "2026-06-01T12:00:00.000Z",
      },
      {
        id: "audit-2",
        actor_user_id: "actor-to-keep",
        action: "suggestion.status_changed",
        target_type: "suggestion",
        target_id: "suggestion-1",
        detail: "",
        created_at: "2026-06-02T12:00:00.000Z",
      },
    ];

    for (const name of files) {
      database.exec(await readFile(new URL(name, migrationsDirectory), "utf8"));
      if (name.startsWith("0004_")) {
        insertUser(database, "actor-to-delete", "deleting-admin");
        insertUser(database, "actor-to-keep", "remaining-admin");
        const insertAudit = database.prepare(
          `INSERT INTO admin_audit_log (
             id, actor_user_id, action, target_type, target_id, detail, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const row of expectedRows) {
          insertAudit.run(
            row.id,
            row.actor_user_id,
            row.action,
            row.target_type,
            row.target_id,
            row.detail,
            row.created_at,
          );
        }
      }
    }

    assert.equal(
      database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get().value,
      "8",
    );
    assert.deepEqual(auditRows(database), expectedRows, "migration must preserve all audit columns and rows");

    const tableInfo = database.prepare("PRAGMA table_info(admin_audit_log)").all();
    assert.deepEqual(
      tableInfo.map(({ name, type, notnull, dflt_value, pk }) => ({
        name,
        type,
        notnull,
        dflt_value,
        pk,
      })),
      [
        { name: "id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
        { name: "actor_user_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
        { name: "action", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
        { name: "target_type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
        { name: "target_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
        { name: "detail", type: "TEXT", notnull: 1, dflt_value: "''", pk: 0 },
        { name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      ],
      "the rebuild must preserve every column, constraint, and default except actor nullability",
    );
    const actorColumn = tableInfo.find((column) => column.name === "actor_user_id");
    assert.equal(actorColumn.notnull, 0, "the retained actor reference must be nullable");

    const actorForeignKey = database.prepare("PRAGMA foreign_key_list(admin_audit_log)").all()
      .find((foreignKey) => foreignKey.from === "actor_user_id");
    assert.equal(actorForeignKey.table, "users");
    assert.equal(actorForeignKey.to, "id");
    assert.equal(actorForeignKey.on_delete, "SET NULL");

    const indexes = database.prepare("PRAGMA index_list(admin_audit_log)").all();
    assert.ok(
      indexes.some((index) => index.name === "admin_audit_log_created_at_idx"),
      "the audit chronology index must be recreated",
    );
    const chronologyIndex = database.prepare(
      "PRAGMA index_xinfo(admin_audit_log_created_at_idx)",
    ).all().find((column) => column.name === "created_at");
    assert.equal(chronologyIndex.desc, 1, "the chronology index must remain descending");

    assert.equal(database.prepare("DELETE FROM users WHERE id = ?").run("actor-to-delete").changes, 1);
    assert.deepEqual(auditRows(database), [
      { ...expectedRows[0], actor_user_id: null },
      expectedRows[1],
    ]);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    const analyticsTrigger = database.prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'analytics_daily_requires_current_consent'",
    ).get();
    assert.match(analyticsTrigger.sql, /notice_version = '2026-08-01'/u);

    assert.throws(
      () => database.prepare(
        `INSERT INTO admin_audit_log
          (id, actor_user_id, action, target_type, target_id, created_at)
         VALUES ('orphan', 'missing-user', 'test', 'user', 'target', '2026-06-03T00:00:00.000Z')`,
      ).run(),
      /FOREIGN KEY constraint failed/u,
    );
    assert.throws(
      () => database.prepare(
        `INSERT INTO admin_audit_log
          (id, actor_user_id, target_type, target_id, created_at)
         VALUES ('missing-action', NULL, 'user', 'target', '2026-06-03T00:00:00.000Z')`,
      ).run(),
      /NOT NULL constraint failed/u,
    );
    assert.throws(
      () => database.prepare(
        `INSERT INTO admin_audit_log
          (id, actor_user_id, action, target_type, target_id, created_at)
         VALUES ('audit-1', NULL, 'test', 'user', 'target', '2026-06-03T00:00:00.000Z')`,
      ).run(),
      /UNIQUE constraint failed/u,
    );
    database.prepare(
      `INSERT INTO admin_audit_log
        (id, actor_user_id, action, target_type, target_id, created_at)
       VALUES ('anonymous-event', NULL, 'test', 'user', 'target', '2026-06-03T00:00:00.000Z')`,
    ).run();
    assert.equal(
      database.prepare("SELECT detail FROM admin_audit_log WHERE id = 'anonymous-event'").get().detail,
      "",
      "the existing detail default must be preserved",
    );
  } finally {
    database.close();
  }
});
