#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isRetryableWebKitTransportFailure,
  MAX_WEBKIT_TRANSPORT_ATTEMPTS,
} from "./browser-matrix-policy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engines = ["chromium", "firefox", "webkit"];

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
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${engine} browser suite ended with signal ${signal}`));
      else resolveExit({ exitCode: code ?? 1, output });
    });
  });
}

for (const engine of engines) {
  const attemptLimit = engine === "webkit" ? MAX_WEBKIT_TRANSPORT_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const attemptLabel = attemptLimit > 1 ? ` (attempt ${attempt}/${attemptLimit})` : "";
    process.stdout.write(`\nRunning browser regression suite with ${engine}${attemptLabel}...\n`);
    const { exitCode, output } = await runEngine(engine);
    if (exitCode === 0) break;
    const retryable = isRetryableWebKitTransportFailure(engine, output);
    if (!retryable || attempt === attemptLimit) process.exit(exitCode);
    process.stderr.write(
      `WebKit disconnected during page navigation; restarting the isolated WebKit suite (${attempt + 1}/${attemptLimit}).\n`,
    );
  }
}
