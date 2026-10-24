import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BACKUP_ALERT_MARKER,
  BACKUP_ALERT_TITLE,
  BACKUP_JOB_NAME,
  checkBackupFreshness,
} from "./backup-freshness.mjs";

const NOW = new Date("2026-10-24T09:00:00Z");
const ENV = { GITHUB_REPOSITORY: "example/jakh", GITHUB_RUN_ID: "77" };

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function fixture({ runs = [], jobsByRun = {}, issues = [] } = {}) {
  const calls = [];
  let nextIssue = 900;
  async function request(path, { method = "GET", body } = {}) {
    calls.push({ method, path, body });
    const url = new URL(path, "https://api.example");
    if (method === "GET" && url.pathname.endsWith("/actions/workflows/recovery-verification.yml/runs")) {
      assert.equal(url.searchParams.get("branch"), "main");
      const page = Number(url.searchParams.get("page"));
      return { workflow_runs: runs.slice((page - 1) * 30, page * 30) };
    }
    const jobsMatch = url.pathname.match(/\/actions\/runs\/(\d+)\/jobs$/u);
    if (method === "GET" && jobsMatch) return { jobs: jobsByRun[jobsMatch[1]] || [] };
    if (method === "GET" && url.pathname === "/repos/example/jakh/issues") {
      return issues.filter((issue) => issue.state === "open");
    }
    if (method === "POST" && url.pathname === "/repos/example/jakh/issues") {
      const issue = { number: nextIssue++, state: "open", ...body };
      issues.push(issue);
      return issue;
    }
    const commentMatch = url.pathname.match(/\/issues\/(\d+)\/comments$/u);
    if (method === "POST" && commentMatch) return { id: 1 };
    const issueMatch = url.pathname.match(/\/issues\/(\d+)$/u);
    if (method === "PATCH" && issueMatch) {
      const issue = issues.find((candidate) => candidate.number === Number(issueMatch[1]));
      Object.assign(issue, body);
      return issue;
    }
    throw new Error(`Unexpected ${method} ${path}`);
  }
  return { request, calls, issues };
}

const backupJob = (completedAt, conclusion = "success") => ({ name: BACKUP_JOB_NAME, conclusion, completed_at: completedAt });
const otherJob = { name: "Rebuild schema and verify recovery policy", conclusion: "success", completed_at: daysAgo(1) };

test("a backup job that succeeded inside the window is fresh and closes open alerts", async () => {
  const github = fixture({
    runs: [
      { id: 3, created_at: daysAgo(1), html_url: "https://github.test/runs/3" },
      { id: 2, created_at: daysAgo(3), html_url: "https://github.test/runs/2" },
    ],
    jobsByRun: { 3: [otherJob], 2: [backupJob(daysAgo(3))] },
    issues: [{ number: 5, state: "open", body: `${BACKUP_ALERT_MARKER}\nold` }, { number: 6, state: "open", body: "unrelated" }],
  });
  const result = await checkBackupFreshness({ env: ENV, now: NOW, request: github.request });
  assert.equal(result.fresh, true);
  assert.equal(result.backup.runUrl, "https://github.test/runs/2");
  assert.equal(result.closed, 1);
  assert.equal(github.issues.find((issue) => issue.number === 5).state, "closed");
  assert.equal(github.issues.find((issue) => issue.number === 6).state, "open");
});

test("cancelled, failed, waiting or skipped backup jobs do not count", async () => {
  const github = fixture({
    runs: [
      { id: 9, created_at: daysAgo(0.5), html_url: "u9" },
      { id: 8, created_at: daysAgo(6), html_url: "u8" },
      { id: 7, created_at: daysAgo(7), html_url: "u7" },
      { id: 4, created_at: daysAgo(27), html_url: "u4" },
    ],
    jobsByRun: {
      9: [backupJob(null, null)],
      8: [backupJob(daysAgo(6), "cancelled")],
      7: [backupJob(daysAgo(7), "failure")],
      4: [backupJob(daysAgo(27))],
    },
  });
  const result = await checkBackupFreshness({ env: ENV, now: NOW, request: github.request });
  assert.equal(result.fresh, false);
  assert.equal(result.action, "created");
  const created = github.issues.at(-1);
  assert.equal(created.title, BACKUP_ALERT_TITLE);
  assert.ok(created.body.includes(BACKUP_ALERT_MARKER));
  assert.match(created.body, /last 8 days/u);
  // Runs older than the window are never inspected.
  assert.ok(!github.calls.some((call) => call.path.includes("/actions/runs/4/jobs")));
});

test("a stale backup comments on the existing alert instead of opening another", async () => {
  const github = fixture({
    runs: [],
    issues: [{ number: 11, state: "open", body: `${BACKUP_ALERT_MARKER}\nfirst` }],
  });
  const result = await checkBackupFreshness({ env: ENV, now: NOW, request: github.request });
  assert.deepEqual({ fresh: result.fresh, issue: result.issue, action: result.action }, { fresh: false, issue: 11, action: "commented" });
  assert.equal(github.issues.length, 1);
});

test("alert text carries no secrets or database content", async () => {
  const github = fixture();
  await checkBackupFreshness({ env: { ...ENV, D1_BACKUP_ENCRYPTION_KEY: "should-never-appear" }, now: NOW, request: github.request });
  const posted = JSON.stringify(github.calls.filter((call) => call.method !== "GET"));
  assert.ok(!posted.includes("should-never-appear"));
});

test("maximum age is bounded", async () => {
  const github = fixture();
  await assert.rejects(checkBackupFreshness({ env: ENV, now: NOW, request: github.request, maxAgeHours: 1 }), /between 24 hours and 35 days/u);
});

test("backups and the approval-gated drill never share a queue", async () => {
  const workflow = await readFile(new URL("../.github/workflows/recovery-verification.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /^concurrency:/mu, "no workflow-level queue shared by every job");
  const job = (name) => {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    assert.ok(start >= 0, `${name} job exists`);
    const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/u);
    return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
  };
  const groups = ["weekly-backup", "readiness", "restore-drill", "backup-freshness"].map((name) => {
    const match = job(name).match(/concurrency:\n\s+group: ([\w-]+)/u);
    assert.ok(match, `${name} has its own concurrency group`);
    return match[1];
  });
  assert.equal(new Set(groups).size, groups.length);
  assert.match(job("restore-drill"), /environment: recovery-drill/u);
  // The backup secrets are scoped to the unattended `backup` environment, never
  // to an approval-gated one such as the drill or production environment.
  assert.equal((job("weekly-backup").match(/environment:/gu) || []).length, 1);
  assert.match(job("weekly-backup"), /\n    environment: backup\n/u);
  assert.doesNotMatch(job("weekly-backup"), /environment: (?:recovery-drill|production|autopilot-production)/u);
  const freshness = job("backup-freshness");
  assert.match(freshness, /needs: \[weekly-backup\]/u);
  assert.match(freshness, /always\(\)/u);
  assert.match(freshness, /issues: write/u);
  assert.match(freshness, /actions: read/u);
  assert.match(freshness, /node scripts\/backup-freshness\.mjs/u);
});
