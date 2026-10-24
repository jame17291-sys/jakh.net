// Fails visibly, and keeps one open GitHub issue, when no weekly encrypted D1
// backup job has succeeded recently. Closes that issue once a backup succeeds.
//
// The weekly backup stalled silently from 27 Sep to late Oct 2026 because a
// restore drill waiting for approval held the workflow's shared queue. This
// check looks at the backup job itself, so a cancelled, waiting, skipped or
// failed backup is caught no matter why it did not complete.
import { fileURLToPath } from "node:url";

export const BACKUP_ALERT_MARKER = "<!-- jakh-backup-freshness-alert -->";
export const BACKUP_ALERT_TITLE = "[Backup alert] No recent encrypted database backup";
export const BACKUP_WORKFLOW_FILE = "recovery-verification.yml";
export const BACKUP_JOB_NAME = "Encrypt production D1 and prove an isolated restore";
export const DEFAULT_MAX_AGE_HOURS = 192; // 8 days: one missed Sunday plus a day of slack.
const MAX_RUN_PAGES = 5;

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function githubClient({ token, apiUrl = "https://api.github.com", fetchImpl = fetch }) {
  const baseUrl = apiUrl.replace(/\/+$/u, "");
  return async function request(path, { method = "GET", body } = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "jakh-backup-freshness/1.0",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${path} failed with HTTP ${response.status}`);
    }
    return payload;
  };
}

// Newest successful weekly backup job finished inside the window, or null.
export async function findRecentBackup({ request, repositoryPath, now, maxAgeHours }) {
  const cutoff = now.getTime() - maxAgeHours * 3_600_000;
  for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
    const { workflow_runs: runs = [] } = await request(
      `${repositoryPath}/actions/workflows/${BACKUP_WORKFLOW_FILE}/runs?branch=main&per_page=30&page=${page}`,
    );
    for (const run of runs) {
      if (Date.parse(run.created_at) < cutoff) return null;
      const { jobs = [] } = await request(`${repositoryPath}/actions/runs/${run.id}/jobs?per_page=50`);
      const job = jobs.find((candidate) => candidate.name === BACKUP_JOB_NAME
        && candidate.conclusion === "success" && candidate.completed_at);
      if (job && Date.parse(job.completed_at) >= cutoff) {
        return { runId: run.id, runUrl: run.html_url, completedAt: job.completed_at };
      }
    }
    if (runs.length < 30) return null;
  }
  return null;
}

async function openAlerts(request, repositoryPath) {
  const alerts = [];
  for (let page = 1; page <= 10; page += 1) {
    const issues = await request(`${repositoryPath}/issues?state=open&per_page=100&page=${page}`);
    for (const issue of issues) {
      if (!issue.pull_request && String(issue.body || "").includes(BACKUP_ALERT_MARKER)) alerts.push(issue);
    }
    if (issues.length < 100) return alerts;
  }
  throw new Error("Could not safely list open issues");
}

export async function checkBackupFreshness(options = {}) {
  const env = options.env || process.env;
  const now = options.now || new Date();
  const maxAgeHours = Number(options.maxAgeHours ?? env.JAKH_BACKUP_MAX_AGE_HOURS ?? DEFAULT_MAX_AGE_HOURS);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 24 || maxAgeHours > 24 * 35) {
    throw new Error("Backup maximum age must be between 24 hours and 35 days");
  }
  const repository = required(env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository)) throw new Error("GITHUB_REPOSITORY must be owner/repository");
  const repositoryPath = `/repos/${repository}`;
  const serverUrl = (env.GITHUB_SERVER_URL || "https://github.com").replace(/\/+$/u, "");
  const checkUrl = env.GITHUB_RUN_ID ? `${serverUrl}/${repository}/actions/runs/${env.GITHUB_RUN_ID}` : "";
  const request = options.request || githubClient({
    token: required(env.GITHUB_TOKEN, "GITHUB_TOKEN"),
    apiUrl: env.GITHUB_API_URL,
    fetchImpl: options.fetchImpl,
  });

  const backup = await findRecentBackup({ request, repositoryPath, now, maxAgeHours });
  const alerts = await openAlerts(request, repositoryPath);
  const days = Math.round(maxAgeHours / 24);

  if (backup) {
    for (const issue of alerts) {
      await request(`${repositoryPath}/issues/${issue.number}/comments`, {
        method: "POST",
        body: { body: `${BACKUP_ALERT_MARKER}\nRecovered: the weekly encrypted backup succeeded at ${backup.completedAt} ([run](${backup.runUrl})). Closing this alert.` },
      });
      await request(`${repositoryPath}/issues/${issue.number}`, {
        method: "PATCH",
        body: { state: "closed", state_reason: "completed" },
      });
    }
    return { fresh: true, backup, closed: alerts.length };
  }

  const body = [
    BACKUP_ALERT_MARKER,
    `No weekly encrypted database backup has succeeded in the last ${days} days (checked ${now.toISOString()}).`,
    "",
    "Encrypted backup artifacts expire after 35 days, and Cloudflare Time Travel keeps 7 days on the Free plan.",
    "",
    "What to check:",
    `1. Actions → *Verify recovery readiness*: is a run waiting for approval, cancelled or failing?`,
    "2. Re-run it with mode `weekly-backup` from `main` once the cause is fixed.",
    "",
    "See `worker/RECOVERY.md`. This issue closes automatically after the next successful backup.",
    checkUrl ? `\n[This check](${checkUrl})` : "",
  ].join("\n");
  if (alerts.length) {
    await request(`${repositoryPath}/issues/${alerts[0].number}/comments`, { method: "POST", body: { body } });
    return { fresh: false, issue: alerts[0].number, action: "commented" };
  }
  const created = await request(`${repositoryPath}/issues`, {
    method: "POST",
    body: { title: BACKUP_ALERT_TITLE, body },
  });
  return { fresh: false, issue: created.number, action: "created" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await checkBackupFreshness();
  if (result.fresh) {
    console.log(`Latest weekly backup succeeded at ${result.backup.completedAt}.`);
  } else {
    console.log(`::error title=No recent database backup::No weekly encrypted backup succeeded recently; see issue #${result.issue}.`);
    process.exitCode = 1;
  }
}
