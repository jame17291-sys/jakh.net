import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  ANNOTATION_HEAD_LINES,
  ANNOTATION_MESSAGE_LIMIT,
  ANNOTATION_TAIL_LINES,
  browserAnnotationsEnabled,
  describeBrowserError,
  escapeAnnotationData,
  escapeAnnotationProperty,
  failureFromOutput,
  fitEscaped,
  formatBrowserFailureAnnotation,
  formatTransportRetryAnnotation,
  sourceLocation,
} from "./browser-annotations.mjs";

const ROOT = resolve(import.meta.dirname, "..");

function parse(command) {
  const match = /^::(error|warning) ([^:]*)::(.*)$/su.exec(command);
  assert.ok(match, `not a workflow command: ${command}`);
  const properties = Object.fromEntries(match[2].split(",").map((pair) => {
    const index = pair.indexOf("=");
    return [pair.slice(0, index), pair.slice(index + 1)];
  }));
  return { level: match[1], properties, message: match[3] };
}

function unescapeData(value) {
  return value.replaceAll("%0A", "\n").replaceAll("%0D", "\r").replaceAll("%25", "%");
}

function thrown(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error("expected the callback to throw");
}

test("annotations are on in GitHub Actions or with the explicit flag, and can be turned off", () => {
  assert.equal(browserAnnotationsEnabled({}), false);
  assert.equal(browserAnnotationsEnabled({ JAKH_BROWSER_ANNOTATE: "1" }), true);
  assert.equal(browserAnnotationsEnabled({ GITHUB_ACTIONS: "true" }), true);
  assert.equal(browserAnnotationsEnabled({ GITHUB_ACTIONS: "true", JAKH_BROWSER_ANNOTATE: "0" }), false);
  assert.equal(browserAnnotationsEnabled({ JAKH_BROWSER_ANNOTATE: "yes" }), false);
});

test("workflow-command escaping keeps one line and protects title separators", () => {
  assert.equal(escapeAnnotationData("50% done\r\nnext"), "50%25 done%0D%0Anext");
  assert.equal(escapeAnnotationProperty("a: b, c%\n"), "a%3A b%2C c%25%0A");
  const command = formatBrowserFailureAnnotation({
    engine: "webkit",
    attempt: 2,
    attempts: 3,
    suite: "blocked storage, filters: cards",
    failure: { name: "Error", message: "first line\nsecond line" },
  });
  assert.equal(command.includes("\n"), false);
  assert.equal(command.includes("\r"), false);
  const { level, properties, message } = parse(command);
  assert.equal(level, "error");
  assert.equal(properties.title, "Browser matrix - webkit - blocked storage%2C filters%3A cards");
  assert.equal(properties.file, undefined, "no source location means no file property");
  assert.equal(unescapeData(message), 'webkit attempt 2/3 failed in "blocked storage, filters: cards".\nfirst line\nsecond line');
});

test("long messages are cut by whole characters and stay within the annotation limit", () => {
  for (const unit of ["x", "%", "\n", "ع", "😀"]) {
    const fitted = fitEscaped(unit.repeat(2_000), ANNOTATION_MESSAGE_LIMIT);
    assert.ok(fitted.length <= ANNOTATION_MESSAGE_LIMIT, `${JSON.stringify(unit)}: ${fitted.length}`);
    assert.ok(fitted.endsWith("…"));
    assert.doesNotMatch(fitted, /%(?:[0-9A-F]?)…$/u, "no escape sequence is split");
    assert.doesNotMatch(fitted, /[\uD800-\uDBFF]…$/u, "no surrogate pair is split");
  }
  assert.equal(fitEscaped("short", ANNOTATION_MESSAGE_LIMIT), "short");

  const failure = { name: "Error", message: `${"A very long assertion detail. ".repeat(80)}` };
  const { properties, message } = parse(formatBrowserFailureAnnotation({ engine: "firefox", suite: "S".repeat(400), failure }));
  assert.ok(message.length <= ANNOTATION_MESSAGE_LIMIT);
  assert.ok(properties.title.length <= 200);
  assert.ok(properties.title.endsWith("…"));
});

test("long messages keep their first and last lines", () => {
  const lines = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
  const { message } = parse(formatBrowserFailureAnnotation({
    engine: "chromium",
    suite: "suite",
    failure: { name: "TimeoutError", message: lines.join("\n") },
  }));
  const kept = unescapeData(message).split("\n");
  assert.deepEqual(kept.slice(1), [
    "TimeoutError: line 1",
    ...lines.slice(1, ANNOTATION_HEAD_LINES),
    `[${20 - ANNOTATION_HEAD_LINES - ANNOTATION_TAIL_LINES} more lines]`,
    ...lines.slice(-ANNOTATION_TAIL_LINES),
  ]);
  const short = Array.from({ length: ANNOTATION_HEAD_LINES + ANNOTATION_TAIL_LINES }, (_, index) => `step ${index + 1}`);
  assert.deepEqual(unescapeData(parse(formatBrowserFailureAnnotation({ engine: "webkit", suite: "s", failure: { name: "Error", message: short.join("\n") } })).message).split("\n").slice(1), short);
});

test("a long head never pushes the call-log tail or expected/actual out of the limit", () => {
  const callLog = [
    "locator.click: Timeout 60000ms exceeded.",
    "Call log:",
    ...Array.from({ length: 30 }, () => `  - ${"waiting for element to be visible, enabled and stable ".repeat(4)}`),
    "  - element is not stable",
    "  - retrying click action, attempt #57",
  ];
  const timeout = parse(formatBrowserFailureAnnotation({ engine: "webkit", suite: "S".repeat(150), failure: { name: "TimeoutError", message: callLog.join("\n") } }));
  assert.ok(timeout.message.length <= ANNOTATION_MESSAGE_LIMIT, String(timeout.message.length));
  assert.match(unescapeData(timeout.message), /- element is not stable\n {2}- retrying click action, attempt #57$/u);
  const assertion = parse(formatBrowserFailureAnnotation({
    engine: "firefox",
    suite: "s",
    failure: { name: "AssertionError", assertion: true, generatedMessage: false, operator: "deepStrictEqual", message: "x".repeat(3_000), expected: '"wanted"', actual: '"got"' },
  }));
  assert.ok(assertion.message.length <= ANNOTATION_MESSAGE_LIMIT);
  assert.match(unescapeData(assertion.message), /…\nExpected: "wanted"\nActual: "got"$/u);
});

test("assertion failures report the source line, expected and actual values", () => {
  const generated = describeBrowserError(thrown(() => assert.equal("2 / 10", "1 / 10")), { repositoryRoot: ROOT });
  assert.equal(generated.assertion, true);
  assert.equal(generated.generatedMessage, true);
  assert.equal(generated.expected, '"1 / 10"');
  assert.equal(generated.actual, '"2 / 10"');
  assert.deepEqual(generated.location?.file, "scripts/browser-annotations.test.mjs");
  assert.ok(Number.isInteger(generated.location?.line));
  const command = formatBrowserFailureAnnotation({ engine: "webkit", attempt: 1, attempts: 3, suite: "Quick Fire", failure: generated });
  const { properties, message } = parse(command);
  assert.equal(properties.file, "scripts/browser-annotations.test.mjs");
  assert.equal(properties.line, String(generated.location.line));
  assert.deepEqual(unescapeData(message).split("\n"), [
    `webkit attempt 1/3 failed in "Quick Fire" (scripts/browser-annotations.test.mjs:${generated.location.line}).`,
    "AssertionError: Expected values to be strictly equal:",
    'Expected: "1 / 10"',
    'Actual: "2 / 10"',
  ], "the generated diff is replaced by the compact expected/actual pair");

  const custom = describeBrowserError(thrown(() => assert.deepEqual([1, 2], [1, 3], "rows differ")), { repositoryRoot: ROOT });
  assert.deepEqual(unescapeData(parse(formatBrowserFailureAnnotation({ engine: "firefox", suite: "rows", failure: custom })).message).split("\n").slice(1), [
    "AssertionError: rows differ",
    "Expected: [1,3]",
    "Actual: [1,2]",
  ]);

  const falsy = describeBrowserError(thrown(() => assert.ok(Number.isNaN(1))), { repositoryRoot: ROOT });
  assert.deepEqual(unescapeData(parse(formatBrowserFailureAnnotation({ engine: "webkit", suite: "ok", failure: falsy })).message).split("\n").slice(1), [
    "AssertionError: The expression evaluated to a falsy value:",
    "  assert.ok(Number.isNaN(1))",
    "Expected: true",
    "Actual: false",
  ], "a falsy assertion keeps the expression that failed");

  const huge = describeBrowserError(thrown(() => assert.equal("x".repeat(5_000), "y")), { repositoryRoot: ROOT });
  assert.ok(huge.actual.length <= 240);
});

test("non-assertion errors keep their name, drop ANSI colours and handle thrown non-errors", () => {
  const error = new Error("locator.waitFor: Timeout 60000ms exceeded.\nCall log:\n  \u001b[2m- waiting for locator('.shuffle-question') to be visible\u001b[22m\n");
  error.name = "TimeoutError";
  const failure = describeBrowserError(error, { repositoryRoot: ROOT });
  assert.equal(failure.assertion, undefined);
  assert.doesNotMatch(failure.message, /\u001b/u);
  const lines = unescapeData(parse(formatBrowserFailureAnnotation({ engine: "webkit", suite: "Shuffle", failure })).message).split("\n");
  assert.deepEqual(lines.slice(1), [
    "TimeoutError: locator.waitFor: Timeout 60000ms exceeded.",
    "Call log:",
    "  - waiting for locator('.shuffle-question') to be visible",
  ]);
  assert.deepEqual(describeBrowserError("plain string"), { name: "Error", message: "plain string", location: null });
  assert.deepEqual(describeBrowserError(undefined).message, "undefined");
});

test("source locations are repository files outside node_modules", () => {
  const inside = pathToFileURL(join(ROOT, "scripts", "browser-regression.mjs")).href;
  const dependency = pathToFileURL(join(ROOT, "node_modules", "playwright-core", "lib", "client.js")).href;
  const stack = [
    "Error: boom",
    "    at processTicksAndRejections (node:internal/process/task_queues:105:5)",
    `    at Locator.click (${dependency}:10:5)`,
    `    at file:///elsewhere/outside.mjs:3:1`,
    `    at async runTest (${inside}:383:5)`,
  ].join("\n");
  assert.deepEqual(sourceLocation(stack, ROOT), { file: "scripts/browser-regression.mjs", line: 383 });
  assert.deepEqual(sourceLocation(`Error\n    at ${join(ROOT, "scripts", "speech-browser-cases.mjs")}:12:3`, ROOT), { file: "scripts/speech-browser-cases.mjs", line: 12 });
  assert.equal(sourceLocation("Error: no frames", ROOT), null);
  assert.equal(sourceLocation(undefined, ROOT), null);
});

test("WebKit transport restarts warn while retrying and summarise every attempt when they all fail", () => {
  const transport = { name: "Error", message: "page.goto: Connection terminated unexpectedly\nCall log:\n  - navigating to \"http://localhost:1234/science\"" };
  const warning = parse(formatBrowserFailureAnnotation({
    level: "warning",
    engine: "webkit",
    attempt: 1,
    attempts: 3,
    suite: "service worker cold-offline shell and direct game entry",
    failure: transport,
    note: "WebKit lost its browser connection; restarting the isolated suite (2/3).",
  }));
  assert.equal(warning.level, "warning");
  assert.match(unescapeData(warning.message), /^webkit attempt 1\/3 failed in "service worker cold-offline shell and direct game entry"\. WebKit lost its browser connection; restarting the isolated suite \(2\/3\)\.\npage\.goto: Connection terminated unexpectedly\nCall log:/u);

  const summary = parse(formatTransportRetryAnnotation({
    engine: "webkit",
    attempts: [
      { attempt: 1, suite: "Shuffle Challenge", failure: transport },
      { attempt: 2, suite: "Shuffle Challenge", failure: transport },
      { attempt: 3, suite: null, failure: { name: "AssertionError", message: "x", assertion: true, generatedMessage: false, expected: "1", actual: "2" } },
    ],
  }));
  assert.equal(summary.level, "error");
  assert.equal(summary.properties.title, "Browser matrix - webkit - transport retries exhausted");
  assert.deepEqual(unescapeData(summary.message).split("\n"), [
    "webkit failed after 3 attempts; earlier attempts lost the browser connection and were restarted.",
    'Attempt 1: "Shuffle Challenge" - page.goto: Connection terminated unexpectedly',
    'Attempt 2: "Shuffle Challenge" - page.goto: Connection terminated unexpectedly',
    'Attempt 3: "outside a suite" - AssertionError: x',
  ]);
});

test("a child that ended without a failure record is summarised from its output", () => {
  const output = [
    "PASS first suite (12ms)",
    "\u001b[31mFAIL second suite (34ms)\u001b[39m",
    "",
    "Browser regression failed in suite: second suite",
    "Error: page crashed",
    "    at main (file:///repo/scripts/browser-regression.mjs:10:1)",
  ].join("\n");
  const { suite, failure } = failureFromOutput(output, { exitCode: 1 });
  assert.equal(suite, "second suite");
  assert.match(failure.message, /^Process exited with code 1\./u);
  assert.match(failure.message, /Error: page crashed/u);
  assert.doesNotMatch(failure.message, /^\s+at /mu, "stack frames are left to the job log");
  const signalled = failureFromOutput("", { signal: "SIGKILL" });
  assert.equal(signalled.suite, null);
  assert.equal(signalled.failure.message, "Process ended by signal SIGKILL.");
});

test("both browser workflows turn on annotations for their browser steps", async () => {
  const step = (workflow, name) => {
    const start = workflow.indexOf(`      - name: ${name}\n`);
    assert.ok(start >= 0, `${name} step exists`);
    const end = workflow.indexOf("\n      - ", start + 1);
    return end < 0 ? workflow.slice(start) : workflow.slice(start, end);
  };
  const release = await readFile(join(ROOT, ".github/workflows/static-site.yml"), "utf8");
  const matrix = step(release, "Validate browser matrix");
  assert.match(matrix, /\n {10}JAKH_BROWSER_ANNOTATE: "1"\n/u);
  assert.match(matrix, /run: npm run test:browser:matrix/u);
  const pullRequest = await readFile(join(ROOT, ".github/workflows/api-check.yml"), "utf8");
  const regression = step(pullRequest, "Run browser regression suite");
  assert.match(regression, /\n {10}JAKH_BROWSER_ANNOTATE: "1"\n/u);
  assert.match(regression, /run: npm run test:browser/u);
});

test("the browser suite records the failing suite name and the matrix reads it", async () => {
  const regression = await readFile(join(ROOT, "scripts/browser-regression.mjs"), "utf8");
  assert.match(regression, /console\.error\(`FAIL \$\{name\}/u);
  assert.match(regression, /JAKH_BROWSER_FAILURE_REPORT/u);
  const matrix = await readFile(join(ROOT, "scripts/browser-matrix.mjs"), "utf8");
  assert.match(matrix, /JAKH_BROWSER_FAILURE_REPORT: reportPath/u);
  assert.match(matrix, /formatTransportRetryAnnotation/u);
});
