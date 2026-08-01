import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["set.html", "mastermind.html", "codenames.html", "catan.html"];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function requirePattern(file, pattern, message) {
  assert.match(read(file), pattern, `${file}: ${message}`);
}

for (const file of pages) {
  const source = read(file);
  let scriptIndex = 0;
  for (const match of source.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/giu)) {
    const type = match[1].match(/\btype=["']([^"']+)["']/iu)?.[1]?.toLowerCase();
    if (type && !["text/javascript", "application/javascript", "module"].includes(type)) continue;
    const code = match[2].trim();
    if (!code) continue;
    scriptIndex += 1;
    new vm.Script(code, { filename: `${file}:inline-${scriptIndex}` });
  }
}

requirePattern("set.html", /function captureGridFocus\(\)[\s\S]*function restoreGridFocus\(snapshot\)/u,
  "SET grid rebuilds must capture and restore a logical card target");
requirePattern("set.html", /render\(focusSnapshot\)/u,
  "delayed SET selection updates must carry the pre-mutation focus target");

requirePattern("mastermind.html", /dataset\.slotIndex[\s\S]*\.active-row \.mm-peg[\s\S]*\.focus\(\)/u,
  "Mastermind must restore the active slot after rebuilding the board");
requirePattern("mastermind.html", /dataset\.colorIndex[\s\S]*aria-pressed/u,
  "Mastermind palette choices must retain focus identity and selected state");

requirePattern("codenames.html", /function captureGridFocus\(\)[\s\S]*function restoreGridFocus\(snapshot\)/u,
  "Codenames must restore the same or next playable concept after a grid rebuild");
requirePattern("codenames.html", /cnModalBtn['"]\)\.focus\(\)/u,
  "Codenames game-over dialog must receive focus when shown");

requirePattern("catan.html", /<label[^>]+for="trade-give"[^>]*>[\s\S]*?<select id="trade-give"[^>]+aria-labelledby="trade-give-label"/u,
  "Catan give-resource select must keep a persistent accessible name");
requirePattern("catan.html", /<label[^>]+for="trade-get"[^>]*>[\s\S]*?<select id="trade-get"[^>]+aria-labelledby="trade-get-label"/u,
  "Catan receive-resource select must keep a persistent accessible name");
requirePattern("catan.html", /function onTradeModalKeydown\(event\)[\s\S]*event\.key === 'Escape'[\s\S]*event\.key !== 'Tab'/u,
  "Catan trade dialog must close on Escape and contain Tab focus");
requirePattern("catan.html", /tradeOpener[\s\S]*aria-hidden', 'false'[\s\S]*trade-give'\)\.focus\(\)[\s\S]*aria-hidden', 'true'[\s\S]*target\?\.focus\(\)/u,
  "Catan trade dialog must focus initially and restore its opener on close");
requirePattern("catan.html", /function captureBoardFocus\(\)[\s\S]*function restoreBoardFocus\(s\)/u,
  "Catan board rebuilds must retain a logical keyboard target");

console.log(`Game focus validation passed for ${pages.length} pages.`);
