import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const ALERT_MARKER = "<!-- jakh-production-monitor-alert -->";
export const ALERT_TITLE = "[Production alert] jakh.net monitor failure";

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function markdownText(value) {
  return String(value || "")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("|", "\\|")
    .trim();
}

function loadContext(env) {
  const repository = required(env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const [owner, repo, extra] = repository.split("/");
  if (!owner || !repo || extra) throw new Error("GITHUB_REPOSITORY must be owner/repository");

  const runId = required(env.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  const runAttempt = required(env.GITHUB_RUN_ATTEMPT || "1", "GITHUB_RUN_ATTEMPT");
  if (!/^\d+$/u.test(runId) || !/^\d+$/u.test(runAttempt)) {
    throw new Error("GitHub run identifiers must be numeric");
  }

  const serverUrl = (env.GITHUB_SERVER_URL || "https://github.com").replace(/\/+$/u, "");
  return {
    owner,
    repo,
    repository,
    runId,
    runAttempt,
    runUrl: `${serverUrl}/${repository}/actions/runs/${runId}`,
    event: env.JAKH_ALERT_EVENT || env.GITHUB_EVENT_NAME || "unknown",
    sourceWorkflow: env.JAKH_ALERT_SOURCE_WORKFLOW || "",
    sourceConclusion: env.JAKH_ALERT_SOURCE_CONCLUSION || "",
  };
}

function createGitHubClient({ token, apiUrl, fetchImpl }) {
  const baseUrl = (apiUrl || "https://api.github.com").replace(/\/+$/u, "");

  return async function githubRequest(path, { method = "GET", body } = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "jakh-production-alert-router/1.0",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = responseText;
      }
    }
    if (!response.ok) {
      const detail = typeof payload === "object" && payload?.message
        ? `: ${markdownText(payload.message)}`
        : "";
      throw new Error(`GitHub API ${method} ${path} failed with HTTP ${response.status}${detail}`);
    }
    return payload;
  };
}

async function findOpenAlertIssue(request, context) {
  const repositoryPath = `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`;
  for (let page = 1; page <= 10; page += 1) {
    const issues = await request(`${repositoryPath}/issues?state=open&per_page=100&page=${page}`);
    const match = issues.find((issue) => !issue.pull_request && issue.body?.includes(ALERT_MARKER));
    if (match) return match;
    if (issues.length < 100) return null;
  }
  throw new Error("Could not safely identify the production alert issue among more than 1,000 open issues");
}

function runMarker(context, state) {
  return `<!-- jakh-production-monitor-run:${context.runId}:${context.runAttempt}:${state} -->`;
}

async function issueContainsMarker(request, context, issue, marker) {
  if (issue.body?.includes(marker)) return true;
  if (!issue.comments) return false;
  const repositoryPath = `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`;
  const page = Math.ceil(issue.comments / 100);
  const comments = await request(`${repositoryPath}/issues/${issue.number}/comments?per_page=100&page=${page}`);
  return comments.some((comment) => comment.body?.includes(marker));
}

async function readReport(path) {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reportError: `Structured monitor report unavailable: ${message}` };
  }
}

function sourceDescription(context) {
  if (!context.sourceWorkflow) return markdownText(context.event);
  const conclusion = context.sourceConclusion ? ` (${markdownText(context.sourceConclusion)})` : "";
  return `${markdownText(context.sourceWorkflow)}${conclusion}`;
}

function reportSummary(report, state) {
  if (!report) {
    return state === "failure"
      ? "The production check exited without a structured result. Inspect the workflow logs."
      : "The production check completed successfully.";
  }
  if (report.reportError) return markdownText(report.reportError);

  const passed = Number.isInteger(report.passedChecks) ? report.passedChecks : 0;
  const failed = Number.isInteger(report.failedChecks) ? report.failedChecks : 0;
  const lines = [`${passed} checks passed; ${failed} checks failed.`];
  if (state === "failure" && Array.isArray(report.failures) && report.failures.length) {
    lines.push("", "Failed checks:");
    for (const failure of report.failures.slice(0, 20)) {
      const attempts = failure.attempts > 1 ? ` after ${failure.attempts} attempts` : "";
      lines.push(`- **${markdownText(failure.name)}**${attempts}: ${markdownText(failure.message)}`);
    }
    if (report.failures.length > 20) {
      lines.push(`- …and ${report.failures.length - 20} additional failures; see the workflow log.`);
    }
  }
  return lines.join("\n");
}

function alertBody({ context, marker, report, state, now }) {
  const heading = state === "failure"
    ? "The full production monitor detected a failure."
    : "The full production monitor passed and this incident has recovered.";
  return [
    ALERT_MARKER,
    marker,
    "",
    heading,
    "",
    `- **Observed:** ${now.toISOString()}`,
    `- **Trigger:** ${sourceDescription(context)}`,
    `- **Workflow:** [run ${context.runId}, attempt ${context.runAttempt}](${context.runUrl})`,
    "",
    reportSummary(report, state),
  ].join("\n");
}

export async function routeProductionAlert(options = {}) {
  const env = options.env || process.env;
  const state = options.state || env.JAKH_ALERT_STATE;
  if (state !== "failure" && state !== "recovery") {
    throw new Error("Alert state must be failure or recovery");
  }

  const token = required(env.GITHUB_TOKEN || env.GH_TOKEN, "GITHUB_TOKEN");
  const context = loadContext(env);
  const request = createGitHubClient({
    token,
    apiUrl: env.GITHUB_API_URL,
    fetchImpl: options.fetchImpl || globalThis.fetch,
  });
  const report = options.report !== undefined
    ? options.report
    : await readReport(env.JAKH_MONITOR_RESULT_PATH);
  const now = options.now || new Date();
  const marker = runMarker(context, state);
  const repositoryPath = `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`;
  const issue = await findOpenAlertIssue(request, context);

  if (state === "failure" && !issue) {
    const created = await request(`${repositoryPath}/issues`, {
      method: "POST",
      body: {
        title: ALERT_TITLE,
        body: alertBody({ context, marker, report, state, now }),
      },
    });
    return { action: "created", issueNumber: created.number, issueUrl: created.html_url };
  }

  if (!issue) return { action: "noop", reason: "no open production incident" };

  const alreadyRecorded = await issueContainsMarker(request, context, issue, marker);
  if (!alreadyRecorded) {
    await request(`${repositoryPath}/issues/${issue.number}/comments`, {
      method: "POST",
      body: { body: alertBody({ context, marker, report, state, now }) },
    });
  }

  if (state === "recovery") {
    await request(`${repositoryPath}/issues/${issue.number}`, {
      method: "PATCH",
      body: { state: "closed", state_reason: "completed" },
    });
    return {
      action: alreadyRecorded ? "closed" : "commented-and-closed",
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    };
  }

  return {
    action: alreadyRecorded ? "deduplicated" : "commented",
    issueNumber: issue.number,
    issueUrl: issue.html_url,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  routeProductionAlert().then((result) => {
    const issue = result.issueUrl ? ` ${result.issueUrl}` : "";
    console.log(`Production alert routing: ${result.action}.${issue}`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
