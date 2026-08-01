import assert from "node:assert/strict";
import test from "node:test";
import {
  ALERT_MARKER,
  alertMarker,
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

function alertEnv(runId, scope = "all") {
  return {
    GITHUB_TOKEN: "test-token",
    GITHUB_API_URL: "https://api.github.test",
    GITHUB_SERVER_URL: "https://github.test",
    GITHUB_REPOSITORY: "example/jakh",
    GITHUB_RUN_ID: String(runId),
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_run",
    JAKH_MONITOR_SCOPE: scope,
    JAKH_ALERT_SOURCE_WORKFLOW: "Deploy API",
    JAKH_ALERT_SOURCE_CONCLUSION: "failure",
  };
}

const failedReport = {
  schemaVersion: 1,
  status: "failure",
  monitor: { scope: "all" },
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
  monitor: { scope: "all" },
  passedChecks: 39,
  failedChecks: 0,
  failures: [],
};

function reportFor(report, scope) {
  return { ...report, monitor: { ...report.monitor, scope } };
}

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
  assert.equal(github.issues[0].body.split("\n", 1)[0], alertMarker("all"));
  assert.doesNotMatch(github.issues[0].body, new RegExp(ALERT_MARKER, "u"));
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

test("failures create and update only their scope-specific incident", async () => {
  const github = githubFixture();
  const api = await routeProductionAlert({
    state: "failure",
    env: alertEnv(401, "api"),
    fetchImpl: github.fetchImpl,
    report: reportFor(failedReport, "api"),
  });
  const pages = await routeProductionAlert({
    state: "failure",
    env: alertEnv(402, "pages"),
    fetchImpl: github.fetchImpl,
    report: reportFor(failedReport, "pages"),
  });
  const continuedApi = await routeProductionAlert({
    state: "failure",
    env: alertEnv(403, "api"),
    fetchImpl: github.fetchImpl,
    report: reportFor(failedReport, "api"),
  });

  assert.equal(api.action, "created");
  assert.equal(pages.action, "created");
  assert.equal(continuedApi.action, "commented");
  assert.equal(github.issues.length, 2);
  assert.equal(github.issues[0].title, "[Production alert] jakh.net monitor failure [api]");
  assert.equal(github.issues[1].title, "[Production alert] jakh.net monitor failure [pages]");
  assert.equal(github.issues[0].body.split("\n", 1)[0], alertMarker("api"));
  assert.equal(github.issues[1].body.split("\n", 1)[0], alertMarker("pages"));
  assert.equal(github.comments.get(api.issueNumber).length, 1);
  assert.equal(github.comments.get(pages.issueNumber).length, 0);
  assert.match(github.comments.get(api.issueNumber)[0].body, /monitor-run:api:403:1:failure/u);
});

test("scope matching uses the exact leading marker and ignores injected cross-scope markers", async () => {
  const github = githubFixture();
  await routeProductionAlert({
    state: "failure",
    env: alertEnv(451, "api"),
    fetchImpl: github.fetchImpl,
    report: reportFor(failedReport, "api"),
  });
  github.issues[0].body += `\n\nUntrusted detail: ${alertMarker("pages")}`;

  const pages = await routeProductionAlert({
    state: "failure",
    env: alertEnv(452, "pages"),
    fetchImpl: github.fetchImpl,
    report: reportFor(failedReport, "pages"),
  });

  assert.equal(pages.action, "created");
  assert.equal(github.issues.length, 2);
  assert.equal(github.comments.get(1).length, 0);
  assert.equal(github.issues[1].body.split("\n", 1)[0], alertMarker("pages"));
});

test("api and pages recovery never close the global incident", async () => {
  const github = githubFixture();
  for (const [runId, scope] of [[501, "all"], [502, "api"], [503, "pages"]]) {
    await routeProductionAlert({
      state: "failure",
      env: alertEnv(runId, scope),
      fetchImpl: github.fetchImpl,
      report: reportFor(failedReport, scope),
    });
  }

  const apiRecovery = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(504, "api"),
    fetchImpl: github.fetchImpl,
    report: reportFor(recoveredReport, "api"),
  });
  assert.equal(apiRecovery.closedCount, 1);
  assert.equal(github.issues.find((issue) => issue.body.startsWith(alertMarker("api"))).state, "closed");
  assert.equal(github.issues.find((issue) => issue.body.startsWith(alertMarker("all"))).state, "open");
  assert.equal(github.issues.find((issue) => issue.body.startsWith(alertMarker("pages"))).state, "open");

  const pagesRecovery = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(505, "pages"),
    fetchImpl: github.fetchImpl,
    report: reportFor(recoveredReport, "pages"),
  });
  assert.equal(pagesRecovery.closedCount, 1);
  assert.equal(github.issues.find((issue) => issue.body.startsWith(alertMarker("pages"))).state, "closed");
  assert.equal(github.issues.find((issue) => issue.body.startsWith(alertMarker("all"))).state, "open");

  const allRecovery = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(506, "all"),
    fetchImpl: github.fetchImpl,
    report: recoveredReport,
  });
  assert.equal(allRecovery.closedCount, 1);
  assert.equal(github.issues.find((issue) => issue.body.startsWith(alertMarker("all"))).state, "closed");
});

test("all recovery closes every open scoped monitor incident", async () => {
  const github = githubFixture();
  for (const [runId, scope] of [[551, "all"], [552, "api"], [553, "pages"]]) {
    await routeProductionAlert({
      state: "failure",
      env: alertEnv(runId, scope),
      fetchImpl: github.fetchImpl,
      report: reportFor(failedReport, scope),
    });
  }

  const recovery = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(554, "all"),
    fetchImpl: github.fetchImpl,
    report: recoveredReport,
  });

  assert.equal(recovery.action, "commented-and-closed");
  assert.equal(recovery.closedCount, 3);
  assert.deepEqual(new Set(recovery.issueNumbers), new Set([1, 2, 3]));
  assert.ok(github.issues.every((issue) => issue.state === "closed"));
  assert.ok([...github.comments.values()].every((issueComments) => issueComments.length === 1));
});

test("all recovery resumes across several incidents without duplicate comments", async () => {
  const github = githubFixture();
  for (const [runId, scope] of [[561, "all"], [562, "api"], [563, "pages"]]) {
    await routeProductionAlert({
      state: "failure",
      env: alertEnv(runId, scope),
      fetchImpl: github.fetchImpl,
      report: reportFor(failedReport, scope),
    });
  }

  let rejectIssueTwo = true;
  const flakyFetch = async (input, options = {}) => {
    if (rejectIssueTwo && options.method === "PATCH" && new URL(input).pathname.endsWith("/2")) {
      rejectIssueTwo = false;
      return jsonResponse({ message: "simulated scoped close failure" }, 500);
    }
    return github.fetchImpl(input, options);
  };
  const recovery = {
    state: "recovery",
    env: alertEnv(564, "all"),
    fetchImpl: flakyFetch,
    report: recoveredReport,
  };

  await assert.rejects(routeProductionAlert(recovery), /simulated scoped close failure/u);
  assert.equal(github.issues[0].state, "closed");
  assert.equal(github.issues[1].state, "open");
  assert.equal(github.comments.get(1).length, 1);
  assert.equal(github.comments.get(2).length, 1);
  assert.equal(github.comments.get(3).length, 0);

  const resumed = await routeProductionAlert(recovery);
  assert.equal(resumed.closedCount, 2);
  assert.ok(github.issues.every((issue) => issue.state === "closed"));
  assert.ok([...github.comments.values()].every((issueComments) => issueComments.length === 1));
});

test("legacy global incidents remain global and can only be closed by all recovery", async () => {
  const github = githubFixture();
  github.issues.push({
    number: 91,
    title: "Legacy production alert",
    body: `${ALERT_MARKER}\nlegacy incident`,
    state: "open",
    comments: 0,
    html_url: "https://github.test/example/jakh/issues/91",
  });
  github.comments.set(91, []);

  const apiRecovery = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(571, "api"),
    fetchImpl: github.fetchImpl,
    report: reportFor(recoveredReport, "api"),
  });
  assert.equal(apiRecovery.action, "noop");
  assert.equal(github.issues[0].state, "open");

  const continued = await routeProductionAlert({
    state: "failure",
    env: alertEnv(572, "all"),
    fetchImpl: github.fetchImpl,
    report: failedReport,
  });
  assert.equal(continued.action, "commented");
  assert.equal(continued.issueNumber, 91);

  const allRecovery = await routeProductionAlert({
    state: "recovery",
    env: alertEnv(573, "all"),
    fetchImpl: github.fetchImpl,
    report: recoveredReport,
  });
  assert.equal(allRecovery.closedCount, 1);
  assert.equal(github.issues[0].state, "closed");
});

test("scope is validated across the structured report and environment", async () => {
  const github = githubFixture();
  await assert.rejects(
    routeProductionAlert({
      state: "failure",
      env: alertEnv(601, "pages"),
      fetchImpl: github.fetchImpl,
      report: reportFor(failedReport, "api"),
    }),
    /does not match JAKH_MONITOR_SCOPE/u,
  );
  await assert.rejects(
    routeProductionAlert({
      state: "failure",
      env: alertEnv(602, "site"),
      fetchImpl: github.fetchImpl,
      report: null,
    }),
    /JAKH_MONITOR_SCOPE must be all, api, or pages/u,
  );
  const missingScopeEnv = alertEnv(603);
  delete missingScopeEnv.JAKH_MONITOR_SCOPE;
  await assert.rejects(
    routeProductionAlert({
      state: "failure",
      env: missingScopeEnv,
      fetchImpl: github.fetchImpl,
      report: { ...failedReport, monitor: {} },
    }),
    /Monitor scope is required/u,
  );

  const reportOnlyEnv = alertEnv(604, "api");
  delete reportOnlyEnv.JAKH_MONITOR_SCOPE;
  const reportOnly = await routeProductionAlert({
    state: "failure",
    env: reportOnlyEnv,
    fetchImpl: github.fetchImpl,
    report: reportFor(failedReport, "api"),
  });
  const envFallback = await routeProductionAlert({
    state: "failure",
    env: alertEnv(605, "pages"),
    fetchImpl: github.fetchImpl,
    report: { reportError: "monitor report missing" },
  });
  assert.equal(reportOnly.scope, "api");
  assert.equal(envFallback.scope, "pages");
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
