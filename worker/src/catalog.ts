import { ApiError } from "./http.js";
import cardIndexData from "./card-index.json" with { type: "json" };
import type { Env } from "./types.js";

type CardIndexEntry = [categoryId: string, difficulty: string];
type CardIndex = Record<string, CardIndexEntry>;

// This generated file is validated against every category by
// scripts/validate-static.mjs before deployment.
const cardIndex = cardIndexData as unknown as CardIndex;

export function getCardIndex(_env: Env): CardIndex {
  return cardIndex;
}

export async function validateCard(
  env: Env,
  cardId: string,
  categoryId: string,
): Promise<{ categoryId: string; difficulty: string }> {
  const entry = getCardIndex(env)[cardId];
  if (!entry || entry[0] !== categoryId) throw new ApiError(400, "Card does not match the category");
  return { categoryId: entry[0], difficulty: entry[1] };
}

export function canonicalStatus(status: unknown, difficulty: string): string {
  const normalized = status === "correct" ? difficulty : status;
  if (normalized !== difficulty && normalized !== `wrong-${difficulty}`) {
    throw new ApiError(400, "Status does not match the card");
  }
  return normalized;
}
