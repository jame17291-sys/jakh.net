import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts", "validate-seo.mjs");
let fixtureRoot;

function copyGeneratedSite(target) {
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.endsWith(".html") || entry.name === "sitemap.xml")) {
      fs.copyFileSync(path.join(repoRoot, entry.name), path.join(target, entry.name));
    }
  }
  for (const directory of ["ar", "en"]) {
    fs.cpSync(path.join(repoRoot, directory), path.join(target, directory), { recursive: true });
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "catalog.json"), "utf8"));
  for (const category of catalog.categories || []) {
    const paginationDirectory = path.join(repoRoot, category.slug);
    if (fs.existsSync(paginationDirectory) && fs.statSync(paginationDirectory).isDirectory()) {
      fs.cpSync(paginationDirectory, path.join(target, category.slug), { recursive: true });
    }
  }
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
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jakh-seo-validator-"));
  copyGeneratedSite(fixtureRoot);
});

after(() => {
  if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test("the complete generated-site fixture satisfies the SEO quality gate", () => {
  const result = runValidator();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SEO validation passed/u);
});

test("the quality gate rejects a duplicate card in a crawlable pagination slice", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "catalog.json"), "utf8"));
  const category = (catalog.categories || []).find((candidate) => Number(candidate.count) > 20);
  assert.ok(category, "fixture needs a topic with more than one page");
  const relative = `${category.slug}/page/2/index.html`;
  const result = mutateThenValidate(relative, (source) => {
    const ids = [...source.matchAll(/data-id="([^"]+)"/gu)];
    assert.ok(ids.length >= 2, "fixture page needs two static cards");
    return source.replace(`data-id="${ids[1][1]}"`, `data-id="${ids[0][1]}"`);
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /static card IDs must equal source slice/u);
});

test("the quality gate rejects a retired query-language internal link", () => {
  const result = mutateThenValidate("ar/index.html", (source) =>
    source.replace("</main>", '<a href="/?lang=en">invalid language alias</a></main>'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /retired \?lang= route selector/u);
});

test("the quality gate sniffs the social image and rejects false MIME metadata", () => {
  const result = mutateThenValidate("index.html", (source) =>
    source.replace(
      /(<meta\s+property="og:image:type"\s+content=")[^"]+("\s*\/?>)/u,
      "$1image/gif$2",
    ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /og:image:type must be/u);
});

test("the quality gate rejects a /page/1/ pagination alias", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "catalog.json"), "utf8"));
  const category = (catalog.categories || []).find((candidate) => Number(candidate.count) > 20);
  assert.ok(category, "fixture needs a topic with more than one page");
  const relative = `${category.slug}/page/2/index.html`;
  const result = mutateThenValidate(relative, (source) =>
    source.replace(
      /(<link\s+rel="prev"\s+href=")[^"]+("\s*\/?>)/u,
      `$1https://jakh.net/${category.slug}/page/1/$2`,
    ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /page-1 variant|rel="prev" must target/u);
});

test("the quality gate rejects sitemap alternates without a physical route", () => {
  const result = mutateThenValidate("sitemap.xml", (source) =>
    source.replace(
      /(<xhtml:link\s+rel="alternate"\s+hreflang="ar"\s+href=")[^"]+("\s*\/>)/u,
      "$1https://jakh.net/ar/route-that-does-not-exist/$2",
    ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /has no physical self-canonical HTML route/u);
});
