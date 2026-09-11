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

const RETIRED_SEO_ROUTE_TARGET_BY_SOURCE = new Map(
  RETIRED_SEO_ROUTE_REDIRECTS.map(({ from, to }) => [from, to]),
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
