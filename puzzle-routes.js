// Shared by static generation, the browser and the site Worker. Game IDs and
// storage identities stay stable when public URLs change.
export const PUZZLE_ROUTES = Object.freeze([
  ['bonus', 'bonus-puzzles'], ['duel', 'word-duel'],
  ['crossword', 'crossword'], ['midi', 'midi-crossword'], ['mini', 'mini-crossword'],
  ['hive', 'word-hive'], ['word', 'five-letters'], ['domino', 'logic-dominoes'],
  ['trails', 'word-trails'], ['links', 'connections'], ['mosaic', 'mosaic'],
  ['letter-square', 'letter-square'], ['sudoku', 'sudoku'],
].map(([id, slug]) => Object.freeze({id, slug, paths: Object.freeze({en: `/${slug}`, ar: `/ar/games/${slug}/`})})));

export const PUZZLE_STATE_PARAMS = Object.freeze(['date', 'edition', 'variant', 'difficulty', 'duelRoom']);
export function puzzlePath(id, lang = 'en') {
  const route = PUZZLE_ROUTES.find(item => item.id === id);
  if (!route || !['en', 'ar'].includes(lang)) throw new Error('Unknown puzzle route');
  return route.paths[lang];
}
export function puzzleRoute(pathname) {
  const normalized = String(pathname).replace(/\/index\.html$/u, '/').replace(/\.html$/u, '').replace(/\/+$/u, '');
  for (const route of PUZZLE_ROUTES) for (const lang of ['en', 'ar']) {
    if (route.paths[lang].replace(/\/$/u, '') === normalized) return {...route, lang};
  }
  return null;
}
export function puzzleURL(id, lang, parameters = {}, origin) {
  const url = new URL(puzzlePath(id, lang), origin || 'https://riddlearabia.com');
  const values = parameters instanceof URLSearchParams ? parameters : new URLSearchParams(parameters);
  for (const key of PUZZLE_STATE_PARAMS) if (values.has(key)) url.searchParams.set(key, values.get(key));
  return origin ? url.href : `${url.pathname}${url.search}`;
}
export function legacyPuzzleTarget(url) {
  const normalized = url.pathname.replace(/\/index\.html$/u, '/').replace(/\.html$/u, '').replace(/\/+$/u, '');
  if (!['/play', '/ar/play'].includes(normalized) || url.searchParams.getAll('game').length !== 1) return null;
  const route = PUZZLE_ROUTES.find(item => item.id === url.searchParams.get('game'));
  if (!route) return null;
  const target = new URL(url.href);
  target.pathname = route.paths[normalized === '/ar/play' ? 'ar' : 'en'];
  target.searchParams.delete('game');
  return target;
}
export function isPuzzleStateURL(url) {
  const normalized = url.pathname.replace(/\/index\.html$/u, '/').replace(/\.html$/u, '').replace(/\/+$/u, '');
  const puzzle = puzzleRoute(url.pathname);
  if (!puzzle && !['/play', '/ar/play'].includes(normalized)) return false;
  return [...PUZZLE_STATE_PARAMS, 'game'].some(key => url.searchParams.has(key));
}
