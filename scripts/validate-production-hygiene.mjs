#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

export function auditProductionHygiene() {
  const failures = [];
  const tracked = trackedFiles();
  const workflows = fs.readdirSync(path.join(root, ".github", "workflows"))
    .filter((name) => name.endsWith(".yml"))
    .map((name) => fs.readFileSync(path.join(root, ".github", "workflows", name), "utf8"))
    .join("\n");
  const sourceText = tracked
    .filter((relative) => /\.(?:css|html|js|json|jsonc|md|mjs|ts|yml)$/u.test(relative))
    .map((relative) => fs.readFileSync(path.join(root, relative), "utf8"))
    .join("\n");

  const forbiddenTracked = tracked.filter((relative) => (
    /(^|\/)(?:node_modules|dist|coverage|test-results|playwright-report)(\/|$)/u.test(relative)
    || /(?:\.DS_Store|\.log|\.tmp|\.bak|\.sqlite3?|\.sql\.jakh)$/u.test(relative)
    || /(^|\/)assets\/backgrounds(?:_new)?\//u.test(relative)
  ));
  if (forbiddenTracked.length) failures.push(`obsolete/generated files are tracked: ${forbiddenTracked.join(", ")}`);
  if (/assets\/backgrounds(?:_new)?\//u.test(sourceText)) failures.push("source still references obsolete category media directories");
  if (!/schedule:[\s\S]*cron:\s*"17 1 \* \* 0"/u.test(workflows)) failures.push("weekly encrypted backup schedule is missing");
  if (/runs-on:\s*[^\n]*(?:large|gpu|arm64)/iu.test(workflows)) failures.push("a workflow requests a potentially billable larger runner");
  if (/upload-artifact[\s\S]{0,500}path:[^\n]*\.sql(?:\s|$)/u.test(workflows)) failures.push("a workflow can upload a plaintext SQL export");
  if (!/retention-days:\s*35/u.test(workflows)) failures.push("bounded 35-day encrypted backup retention is missing");

  const workerConfig = fs.readFileSync(path.join(root, "worker", "wrangler.jsonc"), "utf8");
  const siteConfig = fs.readFileSync(path.join(root, "site-worker", "wrangler.jsonc"), "utf8");
  for (const [label, config] of [["API", workerConfig], ["site", siteConfig]]) {
    if (/\b(?:r2_buckets|queues|vectorize|ai|hyperdrive|browser)\b\s*:/iu.test(config)) {
      failures.push(`${label} Worker config enables a service outside the approved free hosting architecture`);
    }
  }
  const cronMatch = workerConfig.match(/"crons"\s*:\s*\[([^\]]*)\]/u);
  const cronCount = cronMatch ? (cronMatch[1].match(/"[^"]+"/gu) || []).length : 0;
  if (cronCount > 5) failures.push(`Worker config uses ${cronCount} cron triggers; Free allows 5`);

  const deployable = tracked.filter((relative) => /\.(?:css|gif|html|ico|jpeg|jpg|js|json|mjs|png|svg|txt|webmanifest|webp|woff2?|xml)$/iu.test(relative));
  if (deployable.length > 20_000) failures.push(`static site has ${deployable.length} files; Free allows 20,000`);
  for (const relative of deployable) {
    const size = fs.statSync(path.join(root, relative)).size;
    if (size > 25 * 1024 * 1024) failures.push(`${relative} exceeds the 25 MiB static asset limit`);
  }

  const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
  for (const category of catalog.categories || []) {
    const expected = `assets/${category.slug}.svg`;
    if (category.image !== expected) failures.push(`${category.slug} does not use ${expected}`);
  }
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  if (/\.card-face\s*\{[^}]*overflow(?:-y)?:\s*(?:auto|scroll)/su.test(css)) {
    failures.push("question cards can still create a nested scrollbar");
  }

  return {
    failures,
    summary: {
      trackedFiles: tracked.length,
      deployableFiles: deployable.length,
      categoryIllustrations: (catalog.categories || []).length,
      workerCronTriggers: cronCount,
      largerRunners: false,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditProductionHygiene();
  if (report.failures.length) {
    console.error(`Production hygiene validation failed with ${report.failures.length} issue(s):`);
    for (const failure of report.failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Production hygiene valid: ${report.summary.trackedFiles} tracked files, ${report.summary.deployableFiles} deployable files, ${report.summary.categoryIllustrations} unified illustrations, ${report.summary.workerCronTriggers}/5 Worker crons, standard runners only.`);
}
