import assert from "node:assert/strict";
import test from "node:test";
import {
  ALERT_MARKER,
  routeProductionAlert,
} from "./route-production-alert.mjs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function githubFixture() {
  const issues = [];
  const comments = new Map();
  const calls = [];
  let nextIssueNumber = 1;

  async function fetchImpl(input, options = {}) {
    const url = new URL(input);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path: `${url.pathname}${url.search}`, body });

    if (method === "GET" && url.pathname === "/repos/example/jakh/issues") {
      const page = Number(url.searchParams.get("page") || "1");
      const perPage = Number(url.searchParams.get("per_page") || "100");
      const openIssues = issues.filter((issue) => issue.state === "open");
      return jsonResponse(openIssues.slice((page - 1) * perPage, page * perPage));
    }

    if (method === "POST" && url.pathname === "/repos/example/jakh/issues") {
      const issue = {
        number: nextIssueNumber,
        title: body.title,
        body: body.body,
        state: "open",
        comments: 0,
        html_url: `https://github.test/example/jakh/issues/${nextIssueNumber}`,
      };
      nextIssueNumber += 1;
      issues.push(issue);
      comments.set(issue.number, []);
      return jsonResponse(issue, 201);
    }

    const commentMatch = /^\/repos\/example\/jakh\/issues\/(\d+)\/comments$/u.exec(url.pathname);
    if (commentMatch) {
      const issueNumber = Number(commentMatch[1]);
      const issueComments = comments.get(issueNumber) || [];
      if (method === "GET") {
        const page = Number(url.searchParams.get("page") || "1");
        const perPage = Number(url.searchParams.get("per_page") || "100");
        return jsonResponse(issueComments.slice((page - 1) * perPage, page * perPage));
      }
      if (method === "POST") {
        issueComments.push({ id: issueComments.length + 1, body: body.body });
        comments.set(issueNumber, issueComments);
        const issue = issues.find((candidate) => candidate.number === issueNumber);
        issue.comments = issueComments.length;
        return jsonResponse(issueComments.at(-1), 201);
      }
    }

    const issueMatch = /^\/repos\/example\/jakh\/issues\/(\d+)$/u.exec(url.pathname);
    if (method === "PATCH" && issueMatch) {
      const issue = issues.find((candidate) => candidate.number === Number(issueMatch[1]));
      Object.assign(issue, body);
      return jsonResponse(issue);
    }

    return jsonResponse({ message: `Unhandled fixture request: ${method} ${url.pathname}` }, 500);
  }

  return { calls, comments, fetchImpl, issues };
}

function alertEnv(runId) {
  return {
    GITHUB_TOKEN: "test-token",
    GITHUB_API_URL: "https://api.github.test",
    GITHUB_SERVER_URL: "https://github.test",
    GITHUB_REPOSITORY: "example/jakh",
    GITHUB_RUN_ID: String(runId),
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_run",
    JAKH_ALERT_SOURCE_WORKFLOW: "Deploy API",
    JAKH_ALERT_SOURCE_CONCLUSION: "failure",
  };
}

const failedReport = {
  schemaVersion: 1,
  status: "failure",
  passedChecks: 38,
  failedChecks: 1,
  failures: [{
    name: "API: health and allowed CORS",
    message: "expected HTTP 200, received 503",
    attempts: 2,
  }],
};

const recoveredReport = {
  schemaVersion: 1,
  status: "success",
  passedChecks: 39,
  failedChecks: 0,
  failures: [],
};

test("alert router creates one issue and deduplicates a repeated failed run", async () => {
  const github = githubFixture();
  const options = {
    state: "failure",
    env: alertEnv(101),
    fetchImpl: github.fetchImpl,
    report: failedReport,
    now: new Date("2026-08-01T08:00:00.000Z"),
  };

  const created = await routeProductionAlert(options);
  const duplicate = await routeProductionAlert(options);

  assert.equal(created.action, "created");
  assert.equal(duplicate.action, "deduplicated");
  assert.equal(github.issues.length, 1);
  assert.equal(github.comments.get(1).length, 0);
  assert.match(github.issues[0].body, new RegExp(ALERT_MARKER, "u"));
  assert.match(github.issues[0].body, /received 503/u);
  assert.match(github.issues[0].body, /actions\/runs\/101/u);
});

test("alert router records later failures, records recovery, and closes the incident", async () => {
  const github = githubFixture();
  await routeProductionAlert({
    state: "failure",
    env: alertEnv(201),
    fetchImpl: github.fetchImpl,
    report: failedReport,
  });

  const continued = await routeProductionAlert({
    state: "failure",
    env: alertEnv(202),
    fetchImpl: github.fetchImpl,
    report: failedReport,
  });
  const recovered = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(203),
    fetchImpl: github.fetchImpl,
    report: recoveredReport,
  });
  const recoveryRetry = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(203),
    fetchImpl: github.fetchImpl,
    report: recoveredReport,
  });

  assert.equal(continued.action, "commented");
  assert.equal(recovered.action, "commented-and-closed");
  assert.equal(recoveryRetry.action, "noop");
  assert.equal(github.issues[0].state, "closed");
  assert.equal(github.issues[0].state_reason, "completed");
  assert.equal(github.comments.get(1).length, 2);
  assert.match(github.comments.get(1)[1].body, /has recovered/u);
});

test("alert router resumes an interrupted recovery without duplicating its comment", async () => {
  const github = githubFixture();
  await routeProductionAlert({
    state: "failure",
    env: alertEnv(251),
    fetchImpl: github.fetchImpl,
    report: failedReport,
  });

  let rejectFirstClose = true;
  const flakyFetch = async (input, options = {}) => {
    if (rejectFirstClose && options.method === "PATCH") {
      rejectFirstClose = false;
      return jsonResponse({ message: "simulated close failure" }, 500);
    }
    return github.fetchImpl(input, options);
  };
  const recoveryOptions = {
    state: "recovery",
    env: alertEnv(252),
    fetchImpl: flakyFetch,
    report: recoveredReport,
  };

  await assert.rejects(routeProductionAlert(recoveryOptions), /simulated close failure/u);
  assert.equal(github.comments.get(1).length, 1);
  assert.equal(github.issues[0].state, "open");

  const resumed = await routeProductionAlert(recoveryOptions);
  assert.equal(resumed.action, "closed");
  assert.equal(github.comments.get(1).length, 1);
  assert.equal(github.issues[0].state, "closed");
});

test("alert router refuses to run without an explicit repository-scoped token", async () => {
  await assert.rejects(
    routeProductionAlert({
      state: "failure",
      env: { ...alertEnv(301), GITHUB_TOKEN: "" },
      fetchImpl: async () => jsonResponse([]),
      report: failedReport,
    }),
    /GITHUB_TOKEN is required/u,
  );
});
