import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicSeoReleaseSafety,
  isRetiredPublicSeoArtifactPath,
} from "./public-seo-release-contract.mjs";

const PRIMARY = "https://riddlearabia.com";

function completeArtifact(overrides = {}) {
  return new Map(Object.entries({
    "index.html": Buffer.from(`<!doctype html><link rel="canonical" href="${PRIMARY}/"><meta name="robots" content="index,follow">`),
    "404.html": Buffer.from('<!doctype html><meta name="robots" content="noindex">'),
    "robots.txt": Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${PRIMARY}/sitemap.xml\n`),
    "sitemap.xml": Buffer.from(`<?xml version="1.0"?><urlset><url><loc>${PRIMARY}/</loc></url></urlset>`),
    ...overrides,
  }));
}

test("retired SEO publication paths are explicit and narrow", () => {
  for (const path of [
    "en/riddles-with-answers/index.html",
    "science/page/2/index.html",
    "ar/topics/science/page/2/index.html",
    "ar/alghaz-ma-alhal/index.html",
  ]) {
    assert.equal(isRetiredPublicSeoArtifactPath(path), true, path);
  }
  for (const path of [
    "science.html",
    "ar/topics/science/index.html",
    "riddles.html",
    "ar/riddles/index.html",
    "assets/riddlearabia-logo.webp",
  ]) {
    assert.equal(isRetiredPublicSeoArtifactPath(path), false, path);
  }
});

test("the exact public artifact requires Riddle Arabia metadata and complete sitemap coverage", () => {
  assert.doesNotThrow(() => assertPublicSeoReleaseSafety(completeArtifact(), { requireMetadata: true }));

  assert.throws(
    () => assertPublicSeoReleaseSafety(completeArtifact({
      "robots.txt": Buffer.from("User-agent: *\nAllow: /\nSitemap: https://jakh.net/sitemap.xml\n"),
    }), { requireMetadata: true }),
    /legacy jakh\.net public host|Sitemap directive/u,
  );
  assert.throws(
    () => assertPublicSeoReleaseSafety(completeArtifact({
      "legacy.html": Buffer.from(`<!doctype html><link rel="canonical" href="${PRIMARY}/legacy"><meta name="robots" content="index,follow">`),
    }), { requireMetadata: true }),
    /missing from sitemap\.xml/u,
  );
  assert.throws(
    () => assertPublicSeoReleaseSafety(completeArtifact({
      "en/riddles-with-answers/index.html": Buffer.from("<!doctype html>"),
    })),
    /Retired SEO artifact/u,
  );
});

test("legacy hosts, copy, and assets fail the final artifact scan", () => {
  for (const [path, source] of [
    ["index.html", '<a href="https://jakh.net/">legacy</a>'],
    ["app.js", 'const brand = "JAKH Riddles";'],
    ["styles.css", '.logo{background:url(/assets/logo.webp)}'],
  ]) {
    assert.throws(
      () => assertPublicSeoReleaseSafety(new Map([[path, Buffer.from(source)]])),
      /legacy jakh\.net public host|legacy JAKH public copy|retired public brand asset/u,
      path,
    );
  }
});
