import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RIDDLE_ARABIA_SEO_PAGES } from "./riddlearabia-seo.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts", "validate-seo.mjs");
let fixtureRoot;

function copyGeneratedSite(target) {
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.endsWith(".html") || ["sitemap.xml", "robots.txt"].includes(entry.name))) {
      fs.copyFileSync(path.join(repoRoot, entry.name), path.join(target, entry.name));
    }
  }
  fs.cpSync(path.join(repoRoot, "ar"), path.join(target, "ar"), { recursive: true });
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, "scripts", "generate-seo-pages.mjs"),
    path.join(target, "scripts", "generate-seo-pages.mjs"),
  );
  fs.symlinkSync(path.join(repoRoot, "assets"), path.join(target, "assets"), "dir");
  fs.symlinkSync(path.join(repoRoot, "data"), path.join(target, "data"), "dir");
}

function runValidator() {
  return spawnSync(process.execPath, [validator], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, JAKH_SEO_VALIDATION_ROOT: fixtureRoot },
    maxBuffer: 32 * 1024 * 1024,
  });
}

function mutateThenValidate(relative, transform) {
  const file = path.join(fixtureRoot, relative);
  const original = fs.readFileSync(file, "utf8");
  const changed = transform(original);
  assert.notEqual(changed, original, `fixture mutation must change ${relative}`);
  fs.writeFileSync(file, changed);
  try {
    return runValidator();
  } finally {
    fs.writeFileSync(file, original);
  }
}

before(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "riddlearabia-seo-validator-"));
  copyGeneratedSite(fixtureRoot);
});

after(() => {
  if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test("the complete compact Riddle Arabia fixture satisfies the SEO quality gate", () => {
  const result = runValidator();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /SEO validation passed/u);
  assert.match(result.stdout, /8 original bilingual experience pairs/u);
});

test("the quality gate rejects a curated page that no longer shows its source answer", () => {
  const experience = RIDDLE_ARABIA_SEO_PAGES.find((page) => page.key === "riddles");
  assert.ok(experience, "riddles experience must be configured");
  const [slug, id] = experience.cards[0];
  const cards = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", `${slug}.json`), "utf8"));
  const card = cards.find((candidate) => candidate.id === id);
  assert.ok(card, "configured source card must exist");
  const result = mutateThenValidate("riddles.html", (source) => {
    const escapedAnswer = String(card.answer.en)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
    return source.replaceAll(escapedAnswer, "[answer removed]");
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /visible answer is missing/u);
});

test("the quality gate prevents functional topic shells from becoming indexable bulk SEO pages", () => {
  const result = mutateThenValidate("science.html", (source) =>
    source.replace("noindex,follow,max-image-preview:large", "index,follow,max-image-preview:large"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /indexability must be false/u);
});

test("the quality gate rejects a restored legacy SEO directory", () => {
  const legacy = path.join(fixtureRoot, "en", "riddles-with-answers");
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "index.html"), "<!doctype html><title>retired</title>");
  try {
    const result = runValidator();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /retired legacy SEO directory still exists/u);
  } finally {
    fs.rmSync(path.join(fixtureRoot, "en"), { recursive: true, force: true });
  }
});

test("the quality gate rejects a restored pagination artifact", () => {
  const pagination = path.join(fixtureRoot, "science", "page", "2");
  fs.mkdirSync(pagination, { recursive: true });
  fs.writeFileSync(path.join(pagination, "index.html"), "<!doctype html><title>retired pagination</title>");
  try {
    const result = runValidator();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /legacy pagination artifacts must not exist/u);
  } finally {
    fs.rmSync(path.join(fixtureRoot, "science"), { recursive: true, force: true });
  }
});

test("the quality gate sniffs the social image and rejects false MIME metadata", () => {
  const result = mutateThenValidate("index.html", (source) =>
    source.replace(
      /(<meta\s+property="og:image:type"\s+content=")[^"]+("\s*\/?>)/u,
      "$1image/gif$2",
    ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /og:image:type does not match the raster/u);
});

test("the quality gate rejects a sitemap alternate that drifts from the bilingual pair", () => {
  const result = mutateThenValidate("sitemap.xml", (source) =>
    source.replace(
      /(<xhtml:link\s+rel="alternate"\s+hreflang="ar"\s+href=")[^"]+("\s*\/>)/u,
      "$1https://riddlearabia.com/ar/route-that-does-not-exist/$2",
    ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /hreflang=ar must match its page/u);
});
