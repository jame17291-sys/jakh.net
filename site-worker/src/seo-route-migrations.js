// Routes retired by the curated Riddle Arabia SEO rebuild. Keep the redirect
// source and destination together so a deleted legacy page never turns an
// existing search result into a 404.
export const RETIRED_SEO_ROUTE_REDIRECTS = Object.freeze([
  { from: "/en/riddles-with-answers", to: "/riddles" },
  { from: "/en/kids-riddles-with-answers", to: "/family-riddles" },
  { from: "/en/logic-puzzles-with-answers", to: "/logic-challenges" },
  { from: "/en/general-knowledge-quiz-questions", to: "/general-knowledge" },
  { from: "/en/spacetoon-quiz", to: "/spacetoon-nostalgia" },
  { from: "/en/football-rules-quiz", to: "/football" },
  { from: "/ar/alghaz-ma-alhal", to: "/ar/alghaz/" },
  { from: "/ar/alghaz-lil-atfal-ma-alhal", to: "/ar/alghaz-atfal/" },
  { from: "/ar/alghaz-mantiqiyya-ma-alhal", to: "/ar/alghaz-mantiq/" },
  { from: "/ar/asila-amma-wa-ajwiba", to: "/ar/malumat-amma/" },
  { from: "/ar/ikhtibar-spacetoon", to: "/ar/hanin-spacetoon/" },
  { from: "/ar/ikhtibar-qawanin-korat-alqadam", to: "/ar/topics/football/" },
]);

// Games renamed on 2026-10-25 so their public names and addresses no longer
// use other companies' trademarks or The New York Times' product names. Only
// the public pages moved: game IDs, storage keys, translation registrations
// and module names keep their original identifiers, so saved progress stays.
// Each old English and Arabic address, including its former `.html`,
// trailing-slash and `/index.html` spellings, redirects once to the new page.
export const RENAMED_GAME_ROUTES = Object.freeze([
  ["catan", "island-traders"],
  ["codenames", "spy-words"],
  ["hanabi", "fireworks"],
  ["set", "triple-match"],
  ["mastermind", "code-breaker"],
  ["diplomacy", "alliances"],
  ["connections", "four-groups"],
].map(([from, to]) => Object.freeze({
  from: Object.freeze({ en: `/${from}`, ar: `/ar/games/${from}/` }),
  to: Object.freeze({ en: `/${to}`, ar: `/ar/games/${to}/` }),
})));

export const RENAMED_GAME_ROUTE_REDIRECTS = Object.freeze(
  RENAMED_GAME_ROUTES.flatMap(({ from, to }) => ["en", "ar"].map((lang) => Object.freeze({
    from: from[lang],
    to: to[lang],
  }))),
);

const RETIRED_SEO_ROUTE_TARGET_BY_SOURCE = new Map(
  RETIRED_SEO_ROUTE_REDIRECTS.map(({ from, to }) => [from, to]),
);

const RENAMED_GAME_ROUTE_TARGET_BY_SOURCE = new Map(
  RENAMED_GAME_ROUTE_REDIRECTS.map(({ from, to }) => [normalizeRetiredSeoRoute(from), to]),
);

export function normalizeRetiredSeoRoute(pathname) {
  let normalized = String(pathname || "/").replace(/\/{2,}/gu, "/");
  normalized = normalized.replace(/\/index\.html$/iu, "/");
  normalized = normalized.replace(/\/+$/u, "");
  return normalized || "/";
}

export function directRetiredSeoRouteTarget(pathname) {
  return RETIRED_SEO_ROUTE_TARGET_BY_SOURCE.get(normalizeRetiredSeoRoute(pathname)) || null;
}

// The old pages were also reachable through their physical `.html` files.
export function renamedGameRouteTarget(pathname) {
  const normalized = normalizeRetiredSeoRoute(pathname);
  return RENAMED_GAME_ROUTE_TARGET_BY_SOURCE.get(normalized)
    || RENAMED_GAME_ROUTE_TARGET_BY_SOURCE.get(normalized.replace(/\.html$/u, ""))
    || null;
}
