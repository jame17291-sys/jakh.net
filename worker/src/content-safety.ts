import { ApiError } from "./http.js";

/**
 * Public content that is held until qualified subject-matter review is complete.
 *
 * This list is intentionally immutable code, rather than an optional binding:
 * a missing or misspelled deployment variable must never re-enable held content.
 * The static release has a matching build-time policy, while this module is the
 * independent API/Battle enforcement boundary.
 */
export const QUARANTINED_CATEGORY_IDS = Object.freeze([
  "economics-and-finance",
  "law-middle-east",
  "medical-questions",
  "pharmacy",
  "survival",
] as const);

// SHA-256 of docs/content-review/production-quarantine.json. A Worker test
// verifies this value against the generated manifest bytes so the deploy gate
// cannot publish a stale API policy fingerprint.
export const PRODUCTION_QUARANTINE_MANIFEST_SHA256 =
  "7bcb7ec8c2fd4d5e28924c905f3c6231aa654a04e8696d1d98cfdd410dfa953d";

const quarantinedCategories = new Set<string>(QUARANTINED_CATEGORY_IDS);

export function isQuarantinedCategory(categoryId: unknown): categoryId is string {
  return typeof categoryId === "string" && quarantinedCategories.has(categoryId);
}

export function requirePublicCategory(categoryId: string): void {
  if (!isQuarantinedCategory(categoryId)) return;
  throw new ApiError(
    503,
    "Category is temporarily unavailable pending safety review",
    { "retry-after": "86400" },
    "CATEGORY_QUARANTINED",
  );
}
