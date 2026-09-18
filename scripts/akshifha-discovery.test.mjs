import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PRESERVED_GAME_SLUGS, RIDDLE_ARABIA_GAME_CATALOG } from "./riddlearabia-seo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the promoted game portfolio has one flagship and two secondary classics", () => {
  assert.deepEqual(RIDDLE_ARABIA_GAME_CATALOG.map((game) => [game.slug, game.kind]), [
    ["akshifha", "featured"], ["chess", "classic"], ["backgammon", "classic"],
  ]);
  const play = read("play.html");
  assert.match(play, /href="\/akshifha"/u);
  assert.match(play, /id="classicsTitle"/u);
  assert.match(play, /href="\/chess"/u);
  assert.match(play, /href="\/backgammon"/u);
  assert.ok(play.indexOf('href="/akshifha"') < play.indexOf('id="classicsTitle"'));
  const list = JSON.parse(play.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1]);
  assert.equal(list.numberOfItems, 3);
  assert.deepEqual(list.itemListElement.map((item) => new URL(item.url).pathname), ["/akshifha", "/chess", "/backgammon"]);
});

test("legacy games are not promoted or deleted in the portfolio transition", () => {
  assert.equal(PRESERVED_GAME_SLUGS.length, 8);
  const play = read("play.html");
  const home = read("index.html");
  for (const slug of PRESERVED_GAME_SLUGS) {
    assert.doesNotMatch(`${play}\n${home}`, new RegExp(`href="/${slug}"`, "u"));
    assert.equal(fs.existsSync(path.join(root, `${slug}.html`)), true, `${slug}: English route preserved`);
    assert.equal(fs.existsSync(path.join(root, `ar/games/${slug}/index.html`)), true, `${slug}: Arabic route preserved`);
  }
  assert.match(read("scripts/generate-riddlearabia-seo.mjs"), /PRESERVED_GAME_SLUGS\.map/u, "sitemap retains existing indexable URLs");
});

test("discovery promotes the actual opening clue and tells the truth about the finite casebook", () => {
  const play = read("play.html");
  const app = read("app.js");
  const home = read("index.html");
  assert.match(play, /Eleven original cases/u);
  assert.match(play, /not a newly published case every day/u);
  assert.match(home, /href="\/akshifha\?case=two-stages-one-host&amp;mode=practice"[^>]*data-href-ar="\/ar\/games\/akshifha\/\?case=two-stages-one-host&amp;mode=practice"[^>]*class="kv-btn-primary"/u);
  assert.match(read("ar/index.html"), /href="\/ar\/games\/akshifha\/\?case=two-stages-one-host&amp;mode=practice"/u);
  assert.doesNotMatch(read("ar/index.html"), /two-stages-one-host&amp;amp;mode=practice/u);
  assert.match(home, /The puppet room clock is five minutes ahead of the foyer clock./u);
  assert.match(app, /إحدى عشرة قضية مؤلّفة بعناية/u);
  assert.doesNotMatch(`${play}\n${home}`, /10 browser games|10 Free Browser Games|Ten browser adaptations/u);
  assert.match(read("scripts/generate-arabic-routes.mjs"), /source: "akshifha\.html"[\s\S]*?runtime: "akshifha"/u);
});
