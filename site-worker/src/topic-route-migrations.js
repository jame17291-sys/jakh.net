import cardMoves from "../../worker/src/card-moves.json" with { type: "json" };

// Topics and TV shows retired by the 2026-10-25 topic merges
// (docs/content-review/topic-merge-2026-10-25.json). Their cards kept their ids
// and moved to the successor topics, so an old English or Arabic topic URL
// redirects to the topic that absorbed most of them. The query string is kept,
// and a shared ?card= link to a moved card goes straight to the card's current
// topic (see movedCardRouteTarget below).
export const RETIRED_TOPIC_REDIRECTS = Object.freeze([
  Object.freeze({ slug: "physical-and-life-sciences", successor: "science" }),
  Object.freeze({ slug: "coding-and-design", successor: "software-and-computing" }),
  Object.freeze({ slug: "civil-engineering", successor: "infrastructure-systems" }),
]);

// TV shows dropped from the TV game. A deep link that selects one of them
// (?sub=The+Wire or ?sub=the-wire) redirects to the TV topic page itself.
export const RETIRED_TV_SHOWS = Object.freeze([
  Object.freeze({ id: "the-wire", key: "The Wire" }),
]);

const SUCCESSOR_BY_SLUG = new Map(RETIRED_TOPIC_REDIRECTS.map(({ slug, successor }) => [slug, successor]));
const RETIRED_SHOW_NAMES = new Set(RETIRED_TV_SHOWS.flatMap(({ id, key }) => [id, key.toLowerCase()]));
const TV_TOPIC_ROUTES = Object.freeze({ "/tv-shows-trivia": "/tv-shows-trivia", "/ar/topics/tv-shows-trivia/": "/ar/topics/tv-shows-trivia/" });
const ENGLISH_TOPIC = /^\/([a-z0-9-]+)(?:\.html)?(?:\/page\/[1-9]\d*)?$/u;
const ARABIC_TOPIC = /^\/ar\/topics\/([a-z0-9-]+)(?:\.html)?(?:\/page\/[1-9]\d*)?$/u;

export const englishTopicPath = (slug) => `/${slug}`;
export const arabicTopicPath = (slug) => `/ar/topics/${slug}/`;

// Every canonical retired route and its destination, in both languages.
export function retiredTopicRedirectPairs() {
  return RETIRED_TOPIC_REDIRECTS.flatMap(({ slug, successor }) => [
    { from: englishTopicPath(slug), to: englishTopicPath(successor) },
    { from: arabicTopicPath(slug), to: arabicTopicPath(successor) },
  ]);
}

// `pathname` is normalized: no repeated slashes, trailing slash or index.html.
// Old pagination and .html spellings of a retired topic redirect too.
export function retiredTopicRouteTarget(pathname) {
  const value = String(pathname || "");
  const arabic = value.match(ARABIC_TOPIC);
  if (arabic) {
    const successor = SUCCESSOR_BY_SLUG.get(arabic[1]);
    return successor ? arabicTopicPath(successor) : null;
  }
  const english = value.match(ENGLISH_TOPIC);
  if (english) {
    const successor = SUCCESSOR_BY_SLUG.get(english[1]);
    return successor ? englishTopicPath(successor) : null;
  }
  return null;
}

// Generated with the card index from the topic-merge ledger: each moved card's
// former topics and current topic.
const FORMER_TOPICS = new Map(Object.entries(cardMoves.formerCategories));
const CURRENT_TOPICS = new Map(Object.entries(cardMoves.currentCategories));

export function movedCardTopics() {
  return [...new Set(CURRENT_TOPICS.values())].sort();
}

// A shared ?card= link on a topic page the card was moved out of opens the
// card's current topic page instead, in one hop and without JavaScript. Only
// recorded moves qualify; any other card id is left to the page itself.
export function movedCardRouteTarget(pathname, cardId) {
  if (typeof cardId !== "string" || !FORMER_TOPICS.has(cardId)) return null;
  const value = String(pathname || "");
  const arabic = value.match(ARABIC_TOPIC);
  const english = arabic ? null : value.match(ENGLISH_TOPIC);
  const slug = arabic?.[1] || english?.[1];
  if (!slug || !FORMER_TOPICS.get(cardId).includes(slug)) return null;
  const current = CURRENT_TOPICS.get(cardId);
  if (!current || current === slug) return null;
  return arabic ? arabicTopicPath(current) : englishTopicPath(current);
}

export function isRetiredTvShow(value) {
  return typeof value === "string" && RETIRED_SHOW_NAMES.has(value.trim().toLowerCase());
}

// Returns the TV topic URL without the retired show selection, or null when the
// request does not select a retired show on a canonical TV topic route.
export function retiredTvShowTarget(url) {
  const canonical = TV_TOPIC_ROUTES[url.pathname];
  if (!canonical || !isRetiredTvShow(url.searchParams.get("sub"))) return null;
  const target = new URL(url.href);
  target.pathname = canonical;
  target.searchParams.delete("sub");
  target.searchParams.delete("season");
  return target;
}
