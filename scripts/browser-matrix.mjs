#!/usr/bin/env node

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isRetryableWebKitTransportFailure,
  MAX_WEBKIT_TRANSPORT_ATTEMPTS,
} from "./browser-matrix-policy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engines = ["chromium", "firefox", "webkit"];
const diagnosticsPath = process.env.JAKH_BROWSER_MATRIX_DIAGNOSTICS || null;
const diagnostics = [];

async function writeDiagnostics() {
  if (!diagnosticsPath) return;
  await writeFile(diagnosticsPath, `${JSON.stringify({
    node: process.version,
    platform: process.platform,
    engines: diagnostics,
  }, null, 2)}\n`);
}

async function runEngine(engine) {
  return new Promise((resolveExit, reject) => {
    let output = "";
    const child = spawn(process.execPath, ["scripts/browser-regression.mjs"], {
      cwd: repositoryRoot,
      env: { ...process.env, JAKH_BROWSER_ENGINE: engine },
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

function reportFailure({ engine, attempt, exitCode, signal, output }) {
  process.stderr.write(`\nFAILED browser engine: ${engine} (attempt ${attempt})\n`);
  process.stderr.write(`Exit code: ${exitCode}${signal ? `; signal: ${signal}` : ""}\n`);
  process.stderr.write(`Full browser output:\n${output || "(no child output captured)"}\n`);
}

let failedExitCode = 0;
engineLoop: for (const engine of engines) {
  const attemptLimit = engine === "webkit" ? MAX_WEBKIT_TRANSPORT_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const attemptLabel = attemptLimit > 1 ? ` (attempt ${attempt}/${attemptLimit})` : "";
    process.stdout.write(`\nRunning browser regression suite with ${engine}${attemptLabel}...\n`);
    const result = { engine, attempt, ...await runEngine(engine) };
    diagnostics.push(result);
    await writeDiagnostics();
    const { exitCode, output } = result;
    if (exitCode === 0) break;
    reportFailure(result);
    const retryable = isRetryableWebKitTransportFailure(engine, output);
    if (!retryable || attempt === attemptLimit) {
      failedExitCode = exitCode;
      break engineLoop;
    }
    process.stderr.write(
      `WebKit disconnected during page navigation; restarting the isolated WebKit suite (${attempt + 1}/${attemptLimit}).\n`,
    );
  }
}

await writeDiagnostics();
if (failedExitCode !== 0) process.exitCode = failedExitCode;
