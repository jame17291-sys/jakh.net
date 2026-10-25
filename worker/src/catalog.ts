import { ApiError } from "./http.js";
import cardIndexData from "./card-index.json" with { type: "json" };
import cardMovesData from "./card-moves.json" with { type: "json" };
import { isQuarantinedCategory, requirePublicCategory } from "./content-safety.js";
import type { Env } from "./types.js";

type CardIndexEntry = [categoryId: string, difficulty: string];
type CardIndex = Record<string, CardIndexEntry>;
type CardMoves = {
  retiredCategories: Record<string, string>;
  formerCategories: Record<string, string[]>;
  currentCategories: Record<string, string>;
};

// This generated file is validated against every category by
// scripts/validate-static.mjs before deployment.
const cardIndex = cardIndexData as unknown as CardIndex;
// Generated from docs/content-review/topic-merge-2026-10-25.json: cards keep
// their ids when they move topic, and saved rows keep the topic they were
// written under.
const cardMoves = cardMovesData as unknown as CardMoves;

export function getCardIndex(_env: Env): CardIndex {
  return cardIndex;
}

export function isPublicCard(
  cardId: unknown,
  categoryId: unknown,
): boolean {
  if (typeof cardId !== "string" || typeof categoryId !== "string") return false;
  const entry = cardIndex[cardId];
  return !isQuarantinedCategory(categoryId)
    && Boolean(entry && entry[0] === categoryId);
}

// True when a recorded topic move took this card out of `categoryId`.
export function wasCardCategory(cardId: unknown, categoryId: unknown): boolean {
  if (typeof cardId !== "string" || typeof categoryId !== "string") return false;
  const former = Object.hasOwn(cardMoves.formerCategories, cardId) ? cardMoves.formerCategories[cardId] : undefined;
  return Boolean(former?.includes(categoryId));
}

// The topic that absorbed a retired topic, or the topic itself.
export function successorCategory(categoryId: string): string {
  return Object.hasOwn(cardMoves.retiredCategories, categoryId)
    ? cardMoves.retiredCategories[categoryId] ?? categoryId
    : categoryId;
}

// Topics that cards now in `categoryId` were moved out of.
export function formerCategoriesOf(categoryId: string): string[] {
  const former = new Set<string>();
  for (const [cardId, categories] of Object.entries(cardMoves.formerCategories)) {
    if (cardIndex[cardId]?.[0] === categoryId) for (const category of categories) former.add(category);
  }
  return [...former].sort();
}

// The current public topic of a saved card. A row saved under the card's
// current topic, or under a topic a recorded move took it out of, maps to the
// current topic; anything else (including held topics) stays hidden.
export function publicCardCategory(cardId: unknown, savedCategoryId: unknown): string | null {
  if (typeof cardId !== "string" || typeof savedCategoryId !== "string") return null;
  const entry = cardIndex[cardId];
  if (!entry || isQuarantinedCategory(savedCategoryId) || isQuarantinedCategory(entry[0])) return null;
  return entry[0] === savedCategoryId || wasCardCategory(cardId, savedCategoryId) ? entry[0] : null;
}

// Binds a card to its category and returns the card's current category and
// level. A client that still holds a card under the topic a recorded move took
// it out of is accepted, and callers store the current category.
export async function validateCard(
  env: Env,
  cardId: string,
  categoryId: string,
): Promise<{ categoryId: string; difficulty: string }> {
  requirePublicCategory(categoryId);
  const entry = getCardIndex(env)[cardId];
  if (!entry || (entry[0] !== categoryId && !wasCardCategory(cardId, categoryId))) {
    throw new ApiError(400, "Card does not match the category");
  }
  requirePublicCategory(entry[0]);
  return { categoryId: entry[0], difficulty: entry[1] };
}

export function canonicalStatus(status: unknown, difficulty: string): string {
  const normalized = status === "correct" ? difficulty : status;
  if (normalized !== difficulty && normalized !== `wrong-${difficulty}`) {
    throw new ApiError(400, "Status does not match the card");
  }
  return normalized;
}
