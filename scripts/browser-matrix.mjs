#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engines = ["chromium", "firefox", "webkit"];

for (const engine of engines) {
  process.stdout.write(`\nRunning browser regression suite with ${engine}...\n`);
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, ["scripts/browser-regression.mjs"], {
      cwd: repositoryRoot,
      env: { ...process.env, JAKH_BROWSER_ENGINE: engine },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${engine} browser suite ended with signal ${signal}`));
      else resolveExit(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exit(exitCode);
}
