// GitHub workflow annotations for browser regression failures.
//
// Job logs and uploaded artifacts are not always reachable from where a
// failure is investigated, but check-run annotations are (REST API:
// repos/{owner}/{repo}/check-runs/{id}/annotations). A failing browser suite
// is therefore summarised in one short annotation: engine, attempt, suite,
// the first lines of the error and an assertion's expected/actual values.
// The full output stays in the job log and the matrix diagnostics file.

import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ANNOTATION_MESSAGE_LIMIT = 900;
export const ANNOTATION_TITLE_LIMIT = 200;
export const ANNOTATION_MESSAGE_LINES = 6;
const VALUE_LIMIT = 240;
const ELLIPSIS = "…";

// Explicit JAKH_BROWSER_ANNOTATE=1 always annotates; =0 always opts out.
// Otherwise annotate only inside GitHub Actions, where the commands are parsed.
export function browserAnnotationsEnabled(env = process.env) {
  if (env.JAKH_BROWSER_ANNOTATE === "1") return true;
  if (env.JAKH_BROWSER_ANNOTATE === "0") return false;
  return env.GITHUB_ACTIONS === "true";
}

export function escapeAnnotationData(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

export function escapeAnnotationProperty(value) {
  return escapeAnnotationData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

// Truncates by whole characters so the escaped result never exceeds `limit`
// and never ends inside an escape sequence or a surrogate pair.
export function fitEscaped(text, limit, escape = escapeAnnotationData) {
  const full = escape(text);
  if (full.length <= limit) return full;
  let fitted = "";
  for (const character of String(text)) {
    const piece = escape(character);
    if (fitted.length + piece.length > limit - ELLIPSIS.length) break;
    fitted += piece;
  }
  return `${fitted}${ELLIPSIS}`;
}

export function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, "");
}

function shorten(value, limit) {
  const text = String(value);
  if (text.length <= limit) return text;
  return `${[...text].slice(0, limit - 1).join("")}${ELLIPSIS}`;
}

function compactValue(value) {
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof RegExp) return String(value);
  try {
    const json = JSON.stringify(value);
    return shorten(json === undefined ? String(value) : json, VALUE_LIMIT);
  } catch {
    return shorten(String(value), VALUE_LIMIT);
  }
}

// The first stack frame that belongs to this repository (outside
// node_modules), relative to the repository root, e.g. browser-regression.mjs.
export function sourceLocation(stack, repositoryRoot) {
  if (typeof stack !== "string" || !repositoryRoot) return null;
  for (const line of stack.split("\n")) {
    const match = /^\s*at (?:.*? \()?(file:\/\/[^\s)]+|\/[^\s):]+[^\s)]*):(\d+):(\d+)\)?\s*$/u.exec(line);
    if (!match) continue;
    let path;
    try {
      path = match[1].startsWith("file://") ? fileURLToPath(match[1]) : match[1];
    } catch {
      continue;
    }
    const file = relative(repositoryRoot, path);
    if (!file || file.startsWith("..") || file.startsWith(sep) || file.split(sep).includes("node_modules")) continue;
    return { file: file.split(sep).join("/"), line: Number(match[2]) };
  }
  return null;
}

// A JSON-safe record of a thrown value. The child process writes it to a file
// so the matrix runner decides whether the attempt is retried or annotated.
export function describeBrowserError(error, { repositoryRoot } = {}) {
  const isObject = error !== null && typeof error === "object";
  const assertion = isObject && error.code === "ERR_ASSERTION";
  const record = {
    name: stripAnsi(isObject && error.name ? error.name : "Error"),
    message: stripAnsi(isObject && "message" in error ? error.message : String(error)),
    location: isObject ? sourceLocation(error.stack, repositoryRoot) : null,
  };
  if (assertion) {
    record.assertion = true;
    record.generatedMessage = Boolean(error.generatedMessage);
    if (error.operator) record.operator = String(error.operator);
    record.expected = compactValue(error.expected);
    record.actual = compactValue(error.actual);
  }
  return record;
}

function errorLines(failure) {
  const all = String(failure?.message || "").split(/\r?\n/u).map((line) => line.trimEnd());
  let lines = all.filter((line) => line.trim());
  if (failure?.assertion && failure.operator !== "==") {
    // Node appends a multi-line diff to its own message and (in current
    // versions) to a custom one. The compact expected/actual pair below
    // carries the same facts, so keep only the leading paragraph.
    const end = all.findIndex((line) => !line.trim() || /^\+ actual - expected\b/u.test(line));
    lines = (end < 0 ? all : all.slice(0, end)).filter((line) => line.trim());
  }
  const kept = lines.slice(0, ANNOTATION_MESSAGE_LINES);
  if (kept.length && failure?.name && !kept[0].startsWith(failure.name) && failure.name !== "Error") {
    kept[0] = `${failure.name}: ${kept[0]}`;
  }
  if (!kept.length) kept.push(failure?.name || "Unknown failure");
  if (failure?.assertion) {
    kept.push(`Expected: ${failure.expected}`, `Actual: ${failure.actual}`);
  }
  return kept;
}

function attemptLabel(attempt, attempts) {
  return `attempt ${attempt}/${attempts}`;
}

function workflowCommand(level, { title, file, line }, message) {
  const properties = [];
  if (file) properties.push(`file=${escapeAnnotationProperty(file)}`);
  if (file && Number.isInteger(line) && line > 0) properties.push(`line=${line}`);
  properties.push(`title=${fitEscaped(title, ANNOTATION_TITLE_LIMIT, escapeAnnotationProperty)}`);
  return `::${level} ${properties.join(",")}::${fitEscaped(message, ANNOTATION_MESSAGE_LIMIT)}`;
}

export function suiteLabel(suite) {
  return suite ? String(suite) : "outside a suite";
}

// One annotation for one failed engine attempt.
export function formatBrowserFailureAnnotation({
  prefix = "Browser matrix",
  level = "error",
  engine,
  attempt = 1,
  attempts = 1,
  suite = null,
  failure = {},
  note = "",
} = {}) {
  const where = failure.location ? ` (${failure.location.file}:${failure.location.line})` : "";
  const headline = `${engine} ${attemptLabel(attempt, attempts)} failed in "${suiteLabel(suite)}"${where}.${note ? ` ${note}` : ""}`;
  return workflowCommand(level, {
    title: `${prefix} - ${engine} - ${suiteLabel(suite)}`,
    file: failure.location?.file,
    line: failure.location?.line,
  }, [headline, ...errorLines(failure)].join("\n"));
}

// WebKit's transport restarts are bounded. When every restart still ends in a
// failure, summarise each attempt in one place.
export function formatTransportRetryAnnotation({ prefix = "Browser matrix", engine, attempts = [] } = {}) {
  const lines = [`${engine} failed after ${attempts.length} attempts; earlier attempts lost the browser connection and were restarted.`];
  for (const result of attempts) {
    const first = errorLines(result.failure || {})[0];
    lines.push(`Attempt ${result.attempt}: "${suiteLabel(result.suite)}" - ${shorten(first, 200)}`);
  }
  return workflowCommand("error", { title: `${prefix} - ${engine} - transport retries exhausted` }, lines.join("\n"));
}

// Used when the child process ended without writing its failure record (for
// example a crash during import): recover the suite and the last output lines.
export function failureFromOutput(output, { exitCode = null, signal = null } = {}) {
  const lines = stripAnsi(output || "").split(/\r?\n/u).map((line) => line.trimEnd()).filter((line) => line.trim());
  let suite = null;
  for (const line of lines) {
    const match = /^FAIL (.+?)(?: \(\d+ms\))?$/u.exec(line);
    if (match) suite = match[1];
  }
  const tail = lines.filter((line) => !/^\s+at /u.test(line)).slice(-ANNOTATION_MESSAGE_LINES);
  const ending = signal ? `Process ended by signal ${signal}.` : `Process exited with code ${exitCode ?? "unknown"}.`;
  return {
    suite,
    failure: { name: "Error", message: [ending, ...tail].join("\n"), location: null },
  };
}
