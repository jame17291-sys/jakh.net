// Subtopic rules shared by sync-catalog.mjs and validate-static.mjs. app.js
// repeats orderTopics() for the subtopic chips it draws from the cards.
//
// A topic holds at most 10 subtopics. On 25 Oct 2026 the owner approved 14
// series for Spacetoon Classics (ayam-tayebeen); see
// docs/content-review/content-additions-2026-10-25.json.
export const DEFAULT_SUBTOPIC_LIMIT = 10;
export const SUBTOPIC_LIMITS = Object.freeze({ "ayam-tayebeen": 14 });

export function subtopicLimit(slug) {
  return SUBTOPIC_LIMITS[slug] ?? DEFAULT_SUBTOPIC_LIMIT;
}

// A catalog entry may list `pinnedTopics`: English subtopic names shown first,
// in that order. The other subtopics follow by card count (largest first),
// then by name.
export function orderTopics(topics, pinned = []) {
  const rank = new Map((pinned || []).map((name, index) => [name, index]));
  const position = (topic) => (rank.has(topic.en) ? rank.get(topic.en) : Number.MAX_SAFE_INTEGER);
  return [...topics].sort((left, right) => (
    position(left) - position(right)
    || right.count - left.count
    || left.en.localeCompare(right.en)
  ));
}

export function pinnedTopicErrors(pinned, topicNames) {
  if (pinned === undefined) return [];
  if (!Array.isArray(pinned) || !pinned.length) return ["pinnedTopics must be a non-empty list of subtopic names"];
  const errors = [];
  const names = new Set(topicNames);
  const seen = new Set();
  for (const name of pinned) {
    if (typeof name !== "string" || !names.has(name)) errors.push(`pinned subtopic "${name}" is not a subtopic of this topic`);
    if (seen.has(name)) errors.push(`pinned subtopic "${name}" is listed twice`);
    seen.add(name);
  }
  return errors;
}
