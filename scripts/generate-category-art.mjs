#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const checkOnly = process.argv.includes("--check");

const palettes = Object.freeze({
  mind: ["#15324b", "#7a5e32"],
  science: ["#123b42", "#9b7134"],
  tech: ["#182d4b", "#5f78a5"],
  world: ["#3b283f", "#a06d44"],
  culture: ["#4a2931", "#a97845"],
});

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stableAccent(slug) {
  return createHash("sha256").update(slug).digest()[0] % 3;
}

function render(category) {
  const [base, accent] = palettes[category.cluster_key] || palettes.mind;
  const variant = stableAccent(category.slug);
  const titleEn = escapeXml(category.title.en);
  const titleAr = escapeXml(category.title.ar);
  const emoji = escapeXml(category.emoji || "✦");
  const enSize = category.title.en.length > 30 ? 22 : category.title.en.length > 22 ? 25 : 28;
  const arSize = [...category.title.ar].length > 28 ? 21 : 24;
  const ringX = 472 + variant * 12;
  const ringY = 115 + variant * 18;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420" role="img" aria-labelledby="title desc" data-jakh-category-art="v1">
  <title id="title">${titleEn} — ${titleAr}</title>
  <desc id="desc">JAKH category artwork in the unified midnight-and-gold visual system.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07111d"/>
      <stop offset="0.52" stop-color="${base}"/>
      <stop offset="1" stop-color="#090e17"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${accent}" stop-opacity=".54"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#9f7338"/>
      <stop offset=".5" stop-color="#f0d49b"/>
      <stop offset="1" stop-color="#a77738"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity=".34"/>
    </filter>
  </defs>
  <rect width="640" height="420" rx="30" fill="url(#bg)"/>
  <circle cx="${ringX}" cy="${ringY}" r="172" fill="url(#glow)"/>
  <g fill="none" stroke="#f5dfaf" stroke-opacity=".16">
    <circle cx="${ringX}" cy="${ringY}" r="102"/>
    <circle cx="${ringX}" cy="${ringY}" r="136"/>
    <path d="M355 0 640 285M425 0 640 215"/>
  </g>
  <path d="M0 360 C160 305 338 412 640 316 V420 H0Z" fill="#040912" fill-opacity=".42"/>
  <rect x="38" y="36" width="564" height="348" rx="24" fill="#fff" fill-opacity=".045" stroke="#fff" stroke-opacity=".12"/>
  <rect x="64" y="70" width="4" height="160" rx="2" fill="url(#gold)"/>
  <g filter="url(#shadow)">
    <circle cx="494" cy="144" r="70" fill="#06111e" fill-opacity=".7" stroke="url(#gold)" stroke-width="2"/>
    <text x="494" y="164" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif" font-size="58">${emoji}</text>
  </g>
  <text x="90" y="112" fill="#d7b979" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="3">JAKH · CURATED KNOWLEDGE</text>
  <text x="90" y="174" fill="#fffaf0" font-family="Inter, Arial, sans-serif" font-size="${enSize}" font-weight="700">${titleEn}</text>
  <text x="90" y="222" fill="#eadfc9" font-family="Noto Sans Arabic, Arial, sans-serif" font-size="${arSize}" font-weight="600" direction="rtl" unicode-bidi="plaintext">${titleAr}</text>
  <rect x="90" y="278" width="170" height="1" fill="url(#gold)"/>
  <text x="90" y="322" fill="#d8dee8" font-family="Inter, Arial, sans-serif" font-size="14" letter-spacing="1.2">BILINGUAL · THOUGHTFUL · FREE</text>
  <circle cx="567" cy="346" r="4" fill="#e4c27c"/>
  <circle cx="550" cy="346" r="2" fill="#e4c27c" fill-opacity=".65"/>
</svg>
`;
}

const failures = [];
for (const category of catalog.categories || []) {
  const target = path.join(root, "assets", `${category.slug}.svg`);
  const expected = render(category);
  if (checkOnly) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== expected) failures.push(category.slug);
  } else {
    fs.writeFileSync(target, expected);
  }
}

if (failures.length) {
  console.error(`Unified category artwork is stale or missing for: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`${checkOnly ? "Verified" : "Generated"} ${(catalog.categories || []).length} unified category illustrations.`);
