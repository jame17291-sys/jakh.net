import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HIGH_STAKES_CATEGORIES } from "./content-review-lib.mjs";

export const PUBLICATION_QUARANTINE_SCHEMA_VERSION = 1;
export const PUBLICATION_QUARANTINE_STATE = "active";
export const PUBLICATION_QUARANTINE_REASON = "qualified-safety-review-pending";
export const PUBLICATION_QUARANTINE_RELATIVE_PATH = "docs/content-review/production-quarantine.json";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedManifestFields = new Set([
  "schemaVersion",
  "state",
  "scope",
  "reason",
  "totalCards",
  "categories",
]);
const allowedCategoryFields = new Set(["slug", "cardCount", "cardIds"]);
const publicSectionDescriptionOverrides = Object.freeze({
  science: {
    en: "Math, physical and life sciences, nature, and space.",
    ar: "رياضيات وعلوم فيزيائية وحياتية وطبيعة وفضاء.",
  },
  world: {
    en: "Places, peoples, history, language, business, customs, and food.",
    ar: "أماكن وشعوب وتاريخ ولغات وأعمال وعادات وطعام.",
  },
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactFields(value, fields, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  for (const field of Object.keys(value)) {
    invariant(fields.has(field), `${label} contains unsupported field ${JSON.stringify(field)}`);
  }
}

function readJson(target, label = target) {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cardSource(root, slug) {
  const source = readJson(path.join(root, "data", `${slug}.json`), `data/${slug}.json`);
  invariant(Array.isArray(source), `data/${slug}.json must contain an array`);
  return source;
}

const MIN_HELD_ANSWER_FRAGMENT_LENGTH = 24;

function sensitiveTextFragments(root, manifest) {
  const fragments = new Set();
  for (const category of manifest.categories) {
    const heldIds = new Set(category.cardIds);
    for (const card of cardSource(root, category.slug)) {
      if (!heldIds.has(card?.id)) continue;
      for (const language of ["en", "ar"]) {
        const question = String(card?.question?.[language] || "").normalize("NFC").trim();
        invariant(question.length >= 8, `held question text is missing for ${category.slug}/${card.id}/${language}`);
        fragments.add(question);

        const answers = [card?.answer?.[language], ...(card?.acceptedAnswers?.[language] || [])];
        for (const candidate of answers) {
          const answer = String(candidate || "").normalize("NFC").trim();
          // Short labels such as "East" and "Water" are not safe leak
          // signatures: they occur legitimately throughout the public corpus.
          // Every held card ID and every full held question remains forbidden;
          // substantive answer/advice copy is additionally forbidden here.
          if (answer.length >= MIN_HELD_ANSWER_FRAGMENT_LENGTH) fragments.add(answer);
        }
      }
    }
  }
  return fragments;
}

export function buildExpectedProductionQuarantine(root = moduleRoot) {
  const catalog = readJson(path.join(root, "data", "catalog.json"), "data/catalog.json");
  const categories = [];
  for (const category of catalog.categories || []) {
    const cards = cardSource(root, category.slug);
    const categoryIsHighStakes = HIGH_STAKES_CATEGORIES.has(category.slug);
    const heldCards = cards.filter((card) => (
      categoryIsHighStakes
      || card?.review?.safetySensitive === true
      || card?.review?.priority === "high"
    ));
    if (!heldCards.length) continue;
    categories.push({
      slug: category.slug,
      cardCount: heldCards.length,
      cardIds: heldCards.map((card) => card.id),
    });
  }
  return {
    schemaVersion: PUBLICATION_QUARANTINE_SCHEMA_VERSION,
    state: PUBLICATION_QUARANTINE_STATE,
    scope: "production-publication",
    reason: PUBLICATION_QUARANTINE_REASON,
    totalCards: categories.reduce((total, category) => total + category.cardCount, 0),
    categories,
  };
}

export function validateProductionQuarantine(manifest, root = moduleRoot) {
  exactFields(manifest, allowedManifestFields, "production quarantine");
  invariant(
    manifest.schemaVersion === PUBLICATION_QUARANTINE_SCHEMA_VERSION,
    `production quarantine schemaVersion must be ${PUBLICATION_QUARANTINE_SCHEMA_VERSION}`,
  );
  invariant(manifest.state === PUBLICATION_QUARANTINE_STATE, "production quarantine must be active");
  invariant(manifest.scope === "production-publication", "production quarantine scope is invalid");
  invariant(manifest.reason === PUBLICATION_QUARANTINE_REASON, "production quarantine reason is invalid");
  invariant(Number.isSafeInteger(manifest.totalCards) && manifest.totalCards > 0, "production quarantine totalCards is invalid");
  invariant(Array.isArray(manifest.categories) && manifest.categories.length > 0, "production quarantine categories are missing");

  const categorySlugs = new Set();
  const cardIds = new Set();
  let declaredTotal = 0;
  for (const [index, category] of manifest.categories.entries()) {
    const label = `production quarantine categories[${index}]`;
    exactFields(category, allowedCategoryFields, label);
    invariant(/^[a-z0-9-]{2,64}$/u.test(category.slug || ""), `${label}.slug is invalid`);
    invariant(!categorySlugs.has(category.slug), `${label}.slug is duplicated`);
    categorySlugs.add(category.slug);
    invariant(Number.isSafeInteger(category.cardCount) && category.cardCount > 0, `${label}.cardCount is invalid`);
    invariant(Array.isArray(category.cardIds), `${label}.cardIds must be an array`);
    invariant(category.cardIds.length === category.cardCount, `${label}.cardCount does not match cardIds`);
    for (const [cardIndex, cardId] of category.cardIds.entries()) {
      invariant(typeof cardId === "string" && /^[A-Za-z0-9_-]{2,96}$/u.test(cardId), `${label}.cardIds[${cardIndex}] is invalid`);
      invariant(!cardIds.has(cardId), `${label}.cardIds[${cardIndex}] is duplicated across the quarantine`);
      cardIds.add(cardId);
    }
    declaredTotal += category.cardCount;
  }
  invariant(declaredTotal === manifest.totalCards, "production quarantine totalCards does not match category totals");

  const expected = buildExpectedProductionQuarantine(root);
  invariant(
    stableJson(manifest) === stableJson(expected),
    `production quarantine is stale; run node scripts/generate-production-quarantine.mjs`,
  );
  return {
    manifest,
    serialized: stableJson(manifest),
    policySha256: createHash("sha256").update(stableJson(manifest)).digest("hex"),
    categorySlugs,
    cardIds,
    sensitiveTextFragments: sensitiveTextFragments(root, manifest),
  };
}

export function loadProductionQuarantine(root = moduleRoot) {
  const target = path.join(root, PUBLICATION_QUARANTINE_RELATIVE_PATH);
  return validateProductionQuarantine(readJson(target, PUBLICATION_QUARANTINE_RELATIVE_PATH), root);
}

export function publicCatalogProjection(catalog, quarantine) {
  const projected = structuredClone(catalog);
  projected.categories = (projected.categories || [])
    .filter((category) => !quarantine.categorySlugs.has(category.slug))
    .map((category) => ({
      ...category,
      related: (category.related || []).filter((slug) => !quarantine.categorySlugs.has(slug)),
    }));
  projected.sections = (projected.sections || []).map((section) => ({
    ...section,
    members: (section.members || []).filter((slug) => !quarantine.categorySlugs.has(slug)),
    ...(publicSectionDescriptionOverrides[section.key]
      ? { description: structuredClone(publicSectionDescriptionOverrides[section.key]) }
      : {}),
  }));
  const publicCards = projected.categories.reduce((total, category) => total + Number(category.count || 0), 0);
  projected.site = {
    ...(projected.site || {}),
    totalQuestions: publicCards,
    publication: {
      state: "safety-quarantine-active",
      publicCategories: projected.categories.length,
      publicQuestions: publicCards,
      quarantinedQuestions: quarantine.manifest.totalCards,
      policySha256: quarantine.policySha256,
    },
  };
  return projected;
}

export function publicCardIndexProjection(index, quarantine) {
  return Object.fromEntries(
    Object.entries(index || {}).filter(([cardId, entry]) => (
      !quarantine.cardIds.has(cardId)
      && Array.isArray(entry)
      && !quarantine.categorySlugs.has(entry[0])
    )),
  );
}

export function publicSearchArtifacts({ catalog, root = moduleRoot, quarantine }) {
  const projectedCatalog = publicCatalogProjection(catalog, quarantine);
  const categories = projectedCatalog.categories.map((category) => category.slug);
  const cardsByLanguage = { en: [], ar: [] };
  for (const [categoryIndex, slug] of categories.entries()) {
    for (const card of cardSource(root, slug)) {
      invariant(!quarantine.cardIds.has(card.id), `quarantined card leaked into public search source: ${card.id}`);
      for (const language of ["en", "ar"]) {
        invariant(card?.question?.[language] && card?.answer?.[language], `incomplete public search card ${slug}/${card?.id || "unknown"}`);
        cardsByLanguage[language].push([
          categoryIndex,
          card.id,
          card.question[language],
          card.answer[language],
        ]);
      }
    }
  }

  const total = cardsByLanguage.en.length;
  invariant(cardsByLanguage.ar.length === total, "public search language totals differ");
  invariant(total === projectedCatalog.site.totalQuestions, "public search total differs from public catalog");
  const outputs = new Map();
  const shards = {};
  let combinedBytes = 0;
  for (const language of ["en", "ar"]) {
    const relativePath = `data/search-index.${language}.json`;
    const serialized = `${JSON.stringify({
      version: 2,
      language,
      total,
      categories,
      cards: cardsByLanguage[language],
    })}\n`;
    const bytes = Buffer.byteLength(serialized);
    combinedBytes += bytes;
    outputs.set(relativePath, serialized);
    shards[language] = {
      url: `/${relativePath}`,
      cards: cardsByLanguage[language].length,
      bytes,
      sha256: createHash("sha256").update(serialized).digest("hex"),
    };
  }
  outputs.set("data/search-index.json", `${JSON.stringify({
    version: 2,
    total,
    budgets: {
      maxShardBytes: 800 * 1024,
      maxCombinedBytes: 1_500 * 1024,
    },
    shards,
  })}\n`);
  invariant(combinedBytes <= 1_500 * 1024, "public search shards exceed their combined byte budget");
  return outputs;
}

export function isQuarantinedArtifactPath(relativePath, quarantine) {
  const normalized = String(relativePath).replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  const segments = normalized.toLowerCase().split("/");
  if (segments[0] === "assets") {
    const filename = segments.at(-1) || "";
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    if (
      quarantine.categorySlugs.has(stem)
      || segments.slice(1, -1).some((segment) => quarantine.categorySlugs.has(segment))
    ) return true;
  }
  return isQuarantinedRequestPath(`/${normalized}`, quarantine.categorySlugs);
}

const MAX_QUARANTINE_PATH_DECODE_PASSES = 3;

export function normalizeQuarantineRequestPath(pathname) {
  let normalized = String(pathname || "/").split(/[?#]/u, 1)[0];
  for (let pass = 0; pass < MAX_QUARANTINE_PATH_DECODE_PASSES; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(normalized);
    } catch {
      return null;
    }
    if (decoded === normalized) break;
    normalized = decoded;
  }
  // More encoding after the bounded passes is recursive input. Treat it like
  // malformed percent-encoding so callers fail closed instead of relying on
  // a proxy/runtime-specific normalization depth.
  if (/%[0-9a-f]{2}/iu.test(normalized)) return null;
  if (/[?#\u0000-\u001f\u007f]/u.test(normalized)) return null;

  const segments = [];
  for (const segment of normalized.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`.toLowerCase();
}

export function isQuarantinedRequestPath(pathname, categorySlugs) {
  const normalized = normalizeQuarantineRequestPath(pathname);
  if (normalized === null) return true;
  for (const slug of categorySlugs) {
    if (normalized === `/data/${slug}.json` || normalized.startsWith(`/data/${slug}.json/`)) return true;
    if (
      normalized === `/${slug}`
      || normalized === `/${slug}.html`
      || normalized.startsWith(`/${slug}/`)
      || normalized.startsWith(`/${slug}.html/`)
    ) return true;
    if (
      normalized === `/ar/topics/${slug}`
      || normalized === `/ar/topics/${slug}.html`
      || normalized.startsWith(`/ar/topics/${slug}/`)
      || normalized.startsWith(`/ar/topics/${slug}.html/`)
    ) return true;
  }
  return false;
}
