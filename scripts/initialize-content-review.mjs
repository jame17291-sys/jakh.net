import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HIGH_STAKES_CATEGORIES } from "./content-review-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const checkOnly = process.argv.includes("--check");

const reviewedCards = new Map(Object.entries({
  "football-138": {
    status: "reviewed",
    reviewedAt: "2026-08-01",
    reviewer: "JAKH editorial review",
    sources: [
      {
        title: "England men's all-time record goalscorers list",
        publisher: "The Football Association",
        url: "https://www.englandfootball.com/articles/2021/Nov/15/england-mens-all-time-record-goalscorers-20211115",
      },
    ],
  },
  "currencies-26": {
    status: "reviewed",
    reviewedAt: "2026-08-01",
    reviewer: "JAKH editorial review",
    sources: [
      {
        title: "Chapter I: Currency",
        publisher: "Central Bank of Kuwait",
        url: "https://www.cbk.gov.kw/en/legislation-and-regulation/cbk-law/chapter-one",
      },
      {
        title: "الباب الأول: النقد",
        publisher: "بنك الكويت المركزي",
        url: "https://www.cbk.gov.kw/ar/legislation-and-regulation/cbk-law/chapter-one",
      },
    ],
  },
  "cin-37": {
    status: "reviewed",
    reviewedAt: "2026-08-01",
    reviewer: "JAKH editorial review",
    sources: [
      {
        title: "Film Awards: Cinematography",
        publisher: "BAFTA",
        url: "https://www.bafta.org/awards/film/cinematography/",
      },
      {
        title: "Meet the Nominees: 37th Annual ASC Awards",
        publisher: "American Society of Cinematographers",
        url: "https://theasc.com/articles/nominees-37th-asc-awards",
      },
    ],
  },
  "history-038": {
    status: "reviewed",
    reviewedAt: "2026-08-01",
    reviewer: "JAKH editorial review",
    sources: [
      {
        title: "Columbus and the Taíno",
        publisher: "Library of Congress",
        url: "https://www.loc.gov/exhibits/exploring-the-early-americas/columbus-and-the-taino",
      },
    ],
  },
}));

const seenCardIds = new Set();
let changedFiles = 0;
let cardCount = 0;

for (const category of catalog.categories || []) {
  const target = path.join(root, "data", `${category.slug}.json`);
  const original = fs.readFileSync(target, "utf8");
  const cards = JSON.parse(original);
  if (!Array.isArray(cards)) throw new Error(`Invalid card data for ${category.slug}`);

  for (const card of cards) {
    cardCount += 1;
    if (!card?.id) throw new Error(`Missing card id in ${category.slug}`);
    if (seenCardIds.has(card.id)) throw new Error(`Duplicate card id ${card.id}`);
    seenCardIds.add(card.id);

    const canonicalReview = reviewedCards.get(card.id);
    if (canonicalReview) {
      card.review = structuredClone(canonicalReview);
    } else if (!card.review) {
      card.review = { status: "pending" };
    }

    if (HIGH_STAKES_CATEGORIES.has(category.slug)) {
      card.review.safetySensitive = true;
      if (card.review.status === "pending") card.review.priority = "high";
    }
  }

  const serialized = `${JSON.stringify(cards, null, 2)}\n`;
  if (serialized !== original) {
    changedFiles += 1;
    if (!checkOnly) fs.writeFileSync(target, serialized);
  }
}

for (const cardId of reviewedCards.keys()) {
  if (!seenCardIds.has(cardId)) throw new Error(`Reviewed-card registry references unknown id ${cardId}`);
}

if (checkOnly && changedFiles) {
  console.error(
    `${changedFiles} content file(s) lack canonical review metadata; `
    + "run node scripts/initialize-content-review.mjs",
  );
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`Content review metadata is initialized for ${cardCount} cards.`);
} else {
  console.log(`Initialized content review metadata for ${cardCount} cards in ${changedFiles} file(s).`);
}
