#!/usr/bin/env node
// Renders the vertical card reels (1080x1920, 15 s, with sound) for the plan
// days that carry `reel: true`, into assets/social/<date>-<id>.mp4.
//
//   node scripts/generate-social-reels.mjs --plan docs/social/plan-2026-11.json
//   node scripts/generate-social-reels.mjs --plan ... --preview 2026-11-19   (writes 4 JPEG frames, no video)
//
// Frames are drawn by Chromium through Playwright and piped straight into
// ffmpeg, so no frame ever touches the disk; already-rendered reels are kept.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { ROOT, CARDS_DIR } from "./social-cards.mjs";
import { reelHtml, audioExpression, REEL_WIDTH, REEL_HEIGHT, REEL_SECONDS, REEL_FPS } from "./social-reels.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const planPath = option("--plan");
const preview = option("--preview");
if (!planPath) throw new Error("Pass --plan <file>");

const plan = JSON.parse(fs.readFileSync(path.join(ROOT, planPath), "utf8"));
const logo = fs.readFileSync(path.join(ROOT, "assets", "riddlearabia-logo.webp"));
const logoDataUrl = `data:image/webp;base64,${logo.toString("base64")}`;

export function reelPath(entry) { return `${CARDS_DIR}/${entry.date}-${entry.id}.mp4`; }

function encode(target) {
  const tmp = `${target}.rendering.mp4`;
  const ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(REEL_FPS), "-c:v", "mjpeg", "-i", "pipe:0",
    "-f", "lavfi", "-i", `aevalsrc='${audioExpression()}':s=44100:d=${REEL_SECONDS}`,
    "-map", "0:v", "-map", "1:a", "-shortest",
    "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(REEL_FPS),
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
    tmp,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    ffmpeg.on("exit", (code) => {
      if (code === 0) { fs.renameSync(tmp, target); resolve(); }
      else { fs.rmSync(tmp, { force: true }); reject(new Error(`ffmpeg exited with ${code}`)); }
    });
  });
  return { stdin: ffmpeg.stdin, done };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: REEL_WIDTH, height: REEL_HEIGHT }, deviceScaleFactor: 1 });
const days = plan.days.filter((entry) => preview ? entry.date === preview : entry.reel === true);
let rendered = 0;
for (const entry of days) {
  await page.setContent(reelHtml(entry, { logoDataUrl }), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  if (preview) {
    for (const t of [2.5, 6, 10.4, 14]) {
      await page.evaluate((time) => window.seek(time), t);
      await page.screenshot({ path: path.join(ROOT, CARDS_DIR, `preview-${entry.date}-${String(t).replace(".", "_")}.jpg`), type: "jpeg", quality: 92 });
    }
    continue;
  }
  const target = path.join(ROOT, reelPath(entry));
  if (fs.existsSync(target)) continue;
  const { stdin, done } = encode(target);
  const frames = REEL_SECONDS * REEL_FPS;
  for (let frame = 0; frame < frames; frame++) {
    await page.evaluate((time) => window.seek(time), frame / REEL_FPS);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!stdin.write(jpeg)) await new Promise((resolve) => stdin.once("drain", resolve));
  }
  stdin.end();
  await done;
  rendered++;
  console.log(`Rendered ${reelPath(entry)}`);
}
await browser.close();
console.log(preview ? `Preview frames written for ${preview}` : `Rendered ${rendered} new reel(s) for ${days.length} planned day(s)`);
