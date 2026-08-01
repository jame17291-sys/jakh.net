#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildExpectedProductionQuarantine,
  PUBLICATION_QUARANTINE_RELATIVE_PATH,
} from "./publication-quarantine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, PUBLICATION_QUARANTINE_RELATIVE_PATH);
const serialized = `${JSON.stringify(buildExpectedProductionQuarantine(root), null, 2)}\n`;
const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";

if (process.argv.includes("--check")) {
  if (current !== serialized) {
    process.stderr.write(
      `${PUBLICATION_QUARANTINE_RELATIVE_PATH} is stale. `
      + "Run node scripts/generate-production-quarantine.mjs.\n",
    );
    process.exitCode = 1;
  } else {
    const manifest = JSON.parse(current);
    process.stdout.write(
      `Production quarantine is current: ${manifest.totalCards} cards across ${manifest.categories.length} categories.\n`,
    );
  }
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  const manifest = JSON.parse(serialized);
  process.stdout.write(
    `Generated production quarantine for ${manifest.totalCards} cards across ${manifest.categories.length} categories.\n`,
  );
}
