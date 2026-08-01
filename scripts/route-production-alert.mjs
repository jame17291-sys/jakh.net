import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const ALERT_MARKER = "<!-- jakh-production-monitor-alert -->";
export const ALERT_TITLE = "[Production alert] jakh.net monitor failure";
export const ALERT_SCOPES = Object.freeze(["all", "api", "pages"]);

export function alertMarker(scope) {
  if (!ALERT_SCOPES.includes(scope)) throw new Error("Alert scope must be all, api, or pages");
  return `<!-- jakh-production-monitor-alert:${scope} -->`;
}

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

function issueAlertScope(issue) {
  const marker = typeof issue?.body === "string" ? issue.body.split(/\r?\n/u, 1)[0].trim() : "";
  const scopes = ALERT_SCOPES.filter((scope) => marker === alertMarker(scope));
  if (marker === ALERT_MARKER) scopes.push("all");
  return scopes.length === 1 ? scopes[0] : null;
}

async function findOpenAlertIssues(request, context) {
  const repositoryPath = `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`;
  const alerts = [];
  for (let page = 1; page <= 10; page += 1) {
    const issues = await request(`${repositoryPath}/issues?state=open&per_page=100&page=${page}`);
    for (const issue of issues) {
      const scope = issue.pull_request ? null : issueAlertScope(issue);
      if (scope) alerts.push({ issue, scope });
    }
    if (issues.length < 100) return alerts;
  }
  throw new Error("Could not safely identify all production alert issues among more than 1,000 open issues");
}

function runMarker(context, state, scope) {
  return `<!-- jakh-production-monitor-run:${scope}:${context.runId}:${context.runAttempt}:${state} -->`;
}

function bodyHasMarker(body, marker) {
  return typeof body === "string" && body.split(/\r?\n/u).some((line) => line.trim() === marker);
}

async function issueContainsMarker(request, context, issue, marker) {
  if (bodyHasMarker(issue.body, marker)) return true;
  if (!issue.comments) return false;
  const repositoryPath = `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`;
  for (let page = Math.ceil(issue.comments / 100); page >= 1; page -= 1) {
    const comments = await request(`${repositoryPath}/issues/${issue.number}/comments?per_page=100&page=${page}`);
    if (comments.some((comment) => bodyHasMarker(comment.body, marker))) return true;
  }
  return false;
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

function parseAlertScope(value, label) {
  if (typeof value !== "string" || !ALERT_SCOPES.includes(value.trim())) {
    throw new Error(`${label} must be all, api, or pages`);
  }
  return value.trim();
}

function resolveAlertScope(report, env) {
  const monitor = report && typeof report === "object" && !Array.isArray(report) ? report.monitor : null;
  const hasReportScope = monitor && typeof monitor === "object"
    && Object.prototype.hasOwnProperty.call(monitor, "scope");
  const hasEnvScope = Object.prototype.hasOwnProperty.call(env, "JAKH_MONITOR_SCOPE")
    && env.JAKH_MONITOR_SCOPE !== undefined;
  const reportScope = hasReportScope ? parseAlertScope(monitor.scope, "Structured monitor report scope") : null;
  const envScope = hasEnvScope ? parseAlertScope(env.JAKH_MONITOR_SCOPE, "JAKH_MONITOR_SCOPE") : null;
  if (reportScope && envScope && reportScope !== envScope) {
    throw new Error(`Structured monitor report scope ${reportScope} does not match JAKH_MONITOR_SCOPE ${envScope}`);
  }
  if (!reportScope && !envScope) {
    throw new Error("Monitor scope is required in the structured report or JAKH_MONITOR_SCOPE");
  }
  return reportScope || envScope;
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

function alertBody({ context, marker, report, scope, state, now }) {
  const monitor = scope === "all" ? "full" : scope === "api" ? "API" : "Pages";
  const heading = state === "failure"
    ? `The ${monitor} production monitor detected a failure.`
    : `The ${monitor} production monitor passed and this incident has recovered.`;
  return [
    alertMarker(scope),
    marker,
    "",
    heading,
    "",
    `- **Observed:** ${now.toISOString()}`,
    `- **Scope:** ${scope}`,
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
  const scope = resolveAlertScope(report, env);
  const now = options.now || new Date();
  const marker = runMarker(context, state, scope);
  const repositoryPath = `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}`;
  const alerts = await findOpenAlertIssues(request, context);

  if (state === "failure") {
    const issue = alerts.find((alert) => alert.scope === scope)?.issue;
    if (!issue) {
      const created = await request(`${repositoryPath}/issues`, {
        method: "POST",
        body: {
          title: `${ALERT_TITLE} [${scope}]`,
          body: alertBody({ context, marker, report, scope, state, now }),
        },
      });
      return { action: "created", scope, issueNumber: created.number, issueUrl: created.html_url };
    }
    const alreadyRecorded = await issueContainsMarker(request, context, issue, marker);
    if (!alreadyRecorded) {
      await request(`${repositoryPath}/issues/${issue.number}/comments`, {
        method: "POST",
        body: { body: alertBody({ context, marker, report, scope, state, now }) },
      });
    }
    return {
      action: alreadyRecorded ? "deduplicated" : "commented",
      scope,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    };
  }

  const targets = scope === "all" ? alerts : alerts.filter((alert) => alert.scope === scope);
  if (!targets.length) return { action: "noop", scope, reason: `no open ${scope} production incident` };

  let commented = false;
  for (const { issue } of targets) {
    const alreadyRecorded = await issueContainsMarker(request, context, issue, marker);
    if (!alreadyRecorded) {
      await request(`${repositoryPath}/issues/${issue.number}/comments`, {
        method: "POST",
        body: { body: alertBody({ context, marker, report, scope, state, now }) },
      });
      commented = true;
    }
    await request(`${repositoryPath}/issues/${issue.number}`, {
      method: "PATCH",
      body: { state: "closed", state_reason: "completed" },
    });
  }

  return {
    action: commented ? "commented-and-closed" : "closed",
    scope,
    closedCount: targets.length,
    issueNumber: targets[0].issue.number,
    issueUrl: targets[0].issue.html_url,
    issueNumbers: targets.map(({ issue }) => issue.number),
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
