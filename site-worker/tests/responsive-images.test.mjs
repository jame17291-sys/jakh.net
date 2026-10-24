import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { upgradeResponsiveImages } from "../../scripts/build-static-site.mjs";
import { ILLUSTRATION_WIDTHS, illustrationMarkup, illustrationSrcset } from "../../site-illustrations.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const distRoot = resolve(repositoryRoot, "site-worker/dist");
const siteManifest = JSON.parse(await readFile(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));

const legacy = (id) => `<img class="ra-art ra-art-topic" src="/assets/illustrations/${id}-480.webp" srcset="/assets/illustrations/${id}-480.webp 480w, /assets/illustrations/${id}-960.webp 960w" sizes="(max-width: 600px) 100px, 180px" width="960" height="640" alt="" />`;
const logo = '<img src="/assets/riddlearabia-logo.webp" alt="Riddle Arabia" class="brand-logo" width="1536" height="1024" fetchpriority="high" />';
const everyFile = new Set([
  ...ILLUSTRATION_WIDTHS.map((width) => `assets/illustrations/chess-${width}.webp`),
  "assets/riddlearabia-logo-264.webp", "assets/riddlearabia-logo-396.webp",
]);

test("shared illustration markup lists every committed width from small to large", () => {
  assert.deepEqual([...ILLUSTRATION_WIDTHS], [240, 480, 640, 960]);
  const markup = illustrationMarkup("chess", "thumb");
  assert.ok(markup.includes(`srcset="${illustrationSrcset("chess")}"`));
  assert.ok(markup.includes('src="/assets/illustrations/chess-480.webp"'), "the 480w file stays the fallback src");
});

test("build upgrades legacy illustration srcsets and the header logo only when every file ships", () => {
  const upgraded = upgradeResponsiveImages(`${legacy("chess")}\n${logo}`, everyFile);
  assert.ok(upgraded.includes(`srcset="${illustrationSrcset("chess")}"`));
  assert.ok(upgraded.includes('sizes="(max-width: 600px) 100px, 180px"'), "sizes are preserved");
  assert.ok(upgraded.includes('src="/assets/riddlearabia-logo.webp" srcset="/assets/riddlearabia-logo-264.webp 264w, /assets/riddlearabia-logo-396.webp 396w" sizes="(max-width: 600px) 108px, 132px"'));
  assert.equal(upgradeResponsiveImages(upgraded, everyFile), upgraded, "the upgrade is idempotent");

  const missing = new Set([...everyFile].filter((file) => !file.endsWith("chess-640.webp") && !file.endsWith("logo-396.webp")));
  assert.equal(upgradeResponsiveImages(`${legacy("chess")}\n${logo}`, missing), `${legacy("chess")}\n${logo}`);
  const unrelated = '<img src="/assets/riddlearabia-logo.webp" width="44" height="44" alt="" />';
  assert.equal(upgradeResponsiveImages(unrelated, everyFile), unrelated, "only the header logo is rewritten");
  assert.equal(upgradeResponsiveImages(legacy("go"), everyFile), legacy("go"), "an id without derivatives is untouched");
});

test("every built page offers small derivatives, and every srcset candidate ships with its stated width", async () => {
  let illustrationImages = 0;
  let logos = 0;
  for (const route of Object.values(siteManifest.routes)) {
    const html = await readFile(resolve(distRoot, route.slice(1)), "utf8");
    for (const [tag] of html.matchAll(/<img\b[^>]*>/gu)) {
      const srcset = tag.match(/\bsrcset="([^"]*)"/u)?.[1];
      if (/\bclass="brand-logo"/u.test(tag)) {
        logos += 1;
        assert.equal(srcset, "/assets/riddlearabia-logo-264.webp 264w, /assets/riddlearabia-logo-396.webp 396w", route);
        assert.match(tag, /\bsizes="\(max-width: 600px\) 108px, 132px"/u, route);
      }
      if (!srcset) continue;
      const candidates = srcset.split(",").map((candidate) => candidate.trim().split(/\s+/u));
      const widths = candidates.map(([, descriptor]) => Number(descriptor.slice(0, -1)));
      assert.deepEqual(widths, [...widths].sort((left, right) => left - right), `${route}: ${srcset}`);
      for (const [url, descriptor] of candidates) {
        assert.ok(siteManifest.files[url], `${route}: ${url} is not in the release`);
        const named = url.match(/-(\d+)\.webp$/u)?.[1];
        if (named) assert.equal(`${named}w`, descriptor, `${route}: ${url}`);
      }
      if (srcset.includes("/assets/illustrations/")) {
        illustrationImages += 1;
        assert.deepEqual(widths, [...ILLUSTRATION_WIDTHS], `${route}: ${srcset}`);
      }
    }
  }
  assert.ok(illustrationImages > 500, `checked ${illustrationImages} illustration images`);
  assert.ok(logos > 1_000, `checked ${logos} header logos`);
});
