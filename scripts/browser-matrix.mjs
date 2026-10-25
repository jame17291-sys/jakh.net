#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  browserAnnotationsEnabled,
  failureFromOutput,
  formatBrowserFailureAnnotation,
  formatTransportRetryAnnotation,
  suiteLabel,
} from "./browser-annotations.mjs";
import {
  isRetryableWebKitTransportFailure,
  MAX_WEBKIT_TRANSPORT_ATTEMPTS,
} from "./browser-matrix-policy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engines = ["chromium", "firefox", "webkit"];
const diagnosticsPath = process.env.JAKH_BROWSER_MATRIX_DIAGNOSTICS || null;
const annotate = browserAnnotationsEnabled();
const diagnostics = [];
const reportDirectory = await mkdtemp(join(tmpdir(), "jakh-browser-matrix-"));

async function writeDiagnostics() {
  if (!diagnosticsPath) return;
  await writeFile(diagnosticsPath, `${JSON.stringify({
    node: process.version,
    platform: process.platform,
    engines: diagnostics,
  }, null, 2)}\n`);
}

async function runEngine(engine, reportPath) {
  return new Promise((resolveExit, reject) => {
    let output = "";
    const child = spawn(process.execPath, ["scripts/browser-regression.mjs"], {
      cwd: repositoryRoot,
      env: { ...process.env, JAKH_BROWSER_ENGINE: engine, JAKH_BROWSER_FAILURE_REPORT: reportPath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });
    child.once("error", reject);
    // `close` fires after the child has exited and both output pipes have
    // closed. Resolving on `exit` can let the parent finish before the final
    // assertion stack has been drained from stderr on a busy CI runner.
    child.once("close", (code, signal) => {
      resolveExit({ exitCode: signal ? 1 : code ?? 1, signal, output });
    });
  });
}

// The child writes its failing suite and error to the report file. Without one
// (for example a crash while importing), recover what the output shows.
async function readFailure(reportPath, { output, exitCode, signal }) {
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    if (report && typeof report === "object" && report.failure) {
      return { suite: report.suite ?? null, failure: report.failure, completedSuites: report.completedSuites ?? null };
    }
  } catch {
    // Fall through to the output-based summary below.
  } finally {
    await rm(reportPath, { force: true });
  }
  return failureFromOutput(output, { exitCode, signal });
}

function reportFailure({ engine, attempt, exitCode, signal, output, suite }) {
  process.stderr.write(`\nFAILED browser engine: ${engine} (attempt ${attempt}) in suite: ${suiteLabel(suite)}\n`);
  process.stderr.write(`Exit code: ${exitCode}${signal ? `; signal: ${signal}` : ""}\n`);
  process.stderr.write(`Full browser output:\n${output || "(no child output captured)"}\n`);
}

// Workflow commands are parsed from complete stdout lines.
function emitAnnotation(command) {
  if (annotate) process.stdout.write(`\n${command}\n`);
}

let failedExitCode = 0;
try {
  engineLoop: for (const engine of engines) {
    const attemptLimit = engine === "webkit" ? MAX_WEBKIT_TRANSPORT_ATTEMPTS : 1;
    const failedAttempts = [];
    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      const attemptLabel = attemptLimit > 1 ? ` (attempt ${attempt}/${attemptLimit})` : "";
      process.stdout.write(`\nRunning browser regression suite with ${engine}${attemptLabel}...\n`);
      const reportPath = join(reportDirectory, `${engine}-${attempt}.json`);
      const result = { engine, attempt, ...await runEngine(engine, reportPath) };
      if (result.exitCode !== 0) Object.assign(result, await readFailure(reportPath, result));
      else await rm(reportPath, { force: true });
      diagnostics.push(result);
      await writeDiagnostics();
      const { exitCode, output } = result;
      if (exitCode === 0) break;
      reportFailure(result);
      failedAttempts.push(result);
      const retryable = isRetryableWebKitTransportFailure(engine, output);
      const annotation = { engine, attempt, attempts: attemptLimit, suite: result.suite, failure: result.failure };
      if (!retryable || attempt === attemptLimit) {
        emitAnnotation(formatBrowserFailureAnnotation(annotation));
        if (failedAttempts.length > 1) emitAnnotation(formatTransportRetryAnnotation({ engine, attempts: failedAttempts }));
        failedExitCode = exitCode;
        break engineLoop;
      }
      // A restarted attempt may still pass; record the disconnect as a warning
      // so a recovered run remains visible without failing the step.
      emitAnnotation(formatBrowserFailureAnnotation({
        ...annotation,
        level: "warning",
        note: `WebKit lost its browser connection; restarting the isolated suite (${attempt + 1}/${attemptLimit}).`,
      }));
      process.stderr.write(
        `WebKit disconnected during page navigation; restarting the isolated WebKit suite (${attempt + 1}/${attemptLimit}).\n`,
      );
    }
  }
} finally {
  await rm(reportDirectory, { recursive: true, force: true });
}

await writeDiagnostics();
if (failedExitCode !== 0) process.exitCode = failedExitCode;
