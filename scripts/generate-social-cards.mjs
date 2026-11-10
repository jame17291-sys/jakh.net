#!/usr/bin/env node
// Renders the social media question cards for a plan.
//
//   node scripts/generate-social-cards.mjs --plan docs/social/plan-2026-11.json
//   node scripts/generate-social-cards.mjs --new-plan docs/social/plan-2026-12.json --start 2026-12-09 --days 28 [--seed 3]
//
// Images land in assets/social/ (two per day: -q.png question, -a.png answer),
// so they are served from riddlearabia.com after the next release and the
// scheduler can hand their URLs to the social networks. Already-rendered images
// are skipped, so re-running after adding days is cheap. Needs Chromium through
// Playwright (same dependency as the browser suites).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT, CARD_SIZE, CARDS_DIR, buildPlan, cardHtml, imagePaths, captions } from "./social-cards.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const newPlanPath = option("--new-plan");
let planPath = option("--plan");

if (newPlanPath) {
  const startDate = option("--start");
  const days = Number(option("--days", "28"));
  const seed = Number(option("--seed", "0"));
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate || "")) throw new Error("--start YYYY-MM-DD is required with --new-plan");
  // Cards used by every existing plan stay out of the new one.
  const used = new Set();
  const planDir = path.join(ROOT, "docs", "social");
  if (fs.existsSync(planDir)) {
    for (const file of fs.readdirSync(planDir).filter((name) => /^plan-.*\.json$/u.test(name))) {
      for (const entry of JSON.parse(fs.readFileSync(path.join(planDir, file), "utf8")).days) used.add(entry.id);
    }
  }
  const plan = { generatedBy: "scripts/generate-social-cards.mjs", startDate, days: buildPlan({ startDate, days, seed, used }) };
  fs.mkdirSync(path.dirname(path.join(ROOT, newPlanPath)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, newPlanPath), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Wrote ${newPlanPath}: ${plan.days.length} days from ${startDate}`);
  planPath = newPlanPath;
}

if (!planPath) throw new Error("Pass --plan <file> or --new-plan <file> --start <date>");
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, planPath), "utf8"));
const logo = fs.readFileSync(path.join(ROOT, "assets", "riddlearabia-logo.webp"));
const logoDataUrl = `data:image/webp;base64,${logo.toString("base64")}`;
fs.mkdirSync(path.join(ROOT, CARDS_DIR), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: CARD_SIZE, height: CARD_SIZE }, deviceScaleFactor: 1 });
let rendered = 0;
for (const entry of plan.days) {
  const paths = imagePaths(entry);
  for (const [side, file] of [["question", paths.question], ["answer", paths.answer]]) {
    const target = path.join(ROOT, file);
    if (fs.existsSync(target)) continue;
    await page.setContent(cardHtml(entry, side, { logoDataUrl }), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: target, type: "png", omitBackground: false });
    rendered++;
  }
  // The captions are part of the plan's audit trail, so a reviewer can read what
  // will be posted without running anything.
  entry.captions = captions(entry);
}
await browser.close();
fs.writeFileSync(path.join(ROOT, planPath), `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Rendered ${rendered} new card image(s) for ${plan.days.length} day(s) into ${CARDS_DIR}/`);
