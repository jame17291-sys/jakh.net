// Shared by the static generators and the live topic directory. Illustrations
// repeat nearby headings, so they are decorative in both language versions.
export const SECTION_ILLUSTRATIONS = Object.freeze({
  mind: 'logic-puzzles', science: 'science-nature', tech: 'technology-engineering',
  world: 'regional-history', culture: 'nostalgia',
});

export const COLLECTION_ILLUSTRATIONS = Object.freeze({
  riddles: 'home-discovery', 'arabic-riddles': 'arabic-riddles',
  'logic-puzzles': 'logic-puzzles', 'kids-riddles': 'kids-riddles',
  'general-knowledge': 'geography', 'arabia-quiz': 'regional-history',
  'spacetoon-nostalgia': 'nostalgia', 'brain-games': 'shared-play',
});

export const TOPIC_ILLUSTRATIONS = Object.freeze({
  "currencies": "topic-currencies",
  "linguistics": "topic-linguistics",
  "tech-retro": "topic-tech-retro",
  "automotive": "topic-automotive",
  "fictional-worlds": "topic-fictional-worlds",
  "superheroes": "topic-superheroes",
  "pop-culture": "topic-pop-culture",
  "true-crime": "topic-true-crime",
  "mythology-legends": "topic-mythology-legends",
  "art-and-painters": "topic-art-and-painters",
  "biology": "topic-biology",
  "books-and-quotes": "topic-books-and-quotes",
  "business-and-management": "topic-business-and-management",
  "chemistry": "topic-chemistry",
  "civil-engineering": "topic-civil-engineering",
  "classic-riddles": "topic-classic-riddles",
  "logic-puzzles": "topic-logic-puzzles",
  "coding-and-design": "topic-coding-and-design",
  "electrical-engineering": "topic-electrical-engineering",
  "flag-questions": "topic-flag-questions",
  "football": "topic-football",
  "geography": "topic-geography",
  "geology": "topic-geology",
  "history": "topic-history",
  "infrastructure-systems": "topic-infrastructure-systems",
  "kids-riddles": "topic-kids-riddles",
  "math": "topic-math",
  "mechanical-engineering": "topic-mechanical-engineering",
  "middle-east-history": "topic-middle-east-history",
  "philosophy": "topic-philosophy",
  "physical-and-life-sciences": "topic-physical-and-life-sciences",
  "psychology": "topic-psychology",
  "relationship-questions": "topic-relationship-questions",
  "science": "topic-science",
  "social-sciences": "topic-social-sciences",
  "software-and-computing": "topic-software-and-computing",
  "space-and-astrology": "topic-space-and-astrology",
  "story-mysteries": "topic-story-mysteries",
  "tv-shows-trivia": "topic-tv-shows-trivia",
  "world-habits-and-etiquette": "topic-world-habits-and-etiquette",
  "environment-and-ecology": "topic-environment-and-ecology",
  "ancient-civilizations": "topic-ancient-civilizations",
  "inventions-and-minds": "topic-inventions-and-minds",
  "animal-kingdom": "topic-animal-kingdom",
  "architecture-and-landmarks": "topic-architecture-and-landmarks",
  "music-and-performing-arts": "topic-music-and-performing-arts",
  "food-and-cuisines": "topic-food-and-cuisines",
  "cinema-and-film-history": "topic-cinema-and-film-history",
  "future-tech-and-energy": "topic-future-tech-and-energy",
  "anime": "topic-anime",
  "ayam-tayebeen": "topic-ayam-tayebeen"
});

export const GAME_ILLUSTRATIONS = Object.freeze({
  "bonus": "game-bonus",
  "duel": "game-duel",
  "crossword": "game-crossword",
  "midi": "game-midi",
  "mini": "game-mini",
  "hive": "game-hive",
  "word": "game-word",
  "domino": "game-domino",
  "trails": "game-trails",
  "links": "game-links",
  "mosaic": "game-mosaic",
  "letter-square": "game-letter-square",
  "sudoku": "game-sudoku",
  "links-mini": "game-links-mini",
  "word-clue": "game-word-clue",
  "mini-starter": "game-mini-starter",
  "battle-room": "game-battle-room",
  "akshifha": "akshifha",
  "chess": "chess",
  "backgammon": "backgammon",
  "quick-fire": "quick-fire"
});

export function gameIllustrationId(id, variant) {
  return GAME_ILLUSTRATIONS[variant && variant !== 'standard' ? `${id}-${variant}` : id];
}

export const ILLUSTRATIONS = Object.freeze([
  'home-discovery', 'mind-lab-overview', 'akshifha', 'chess', 'backgammon',
  'daily-challenge', 'arabic-riddles', 'logic-puzzles', 'kids-riddles',
  'science-nature', 'technology-engineering', 'regional-history', 'nostalgia',
  'shared-play', 'space-astronomy', 'geography', 'football', 'books-quotes',
  'music', 'food-cuisines', 'quick-fire', 'suggest-topic',
  ...Object.values(TOPIC_ILLUSTRATIONS),
  ...Object.values(GAME_ILLUSTRATIONS).filter(id => id.startsWith('game-')),
]);

export function illustrationAttributes(id, placement = 'card', eager = false) {
  if (!ILLUSTRATIONS.includes(id)) return null;
  const sizes = {
    hero: '(max-width: 680px) 220px, 340px',
    card: '(max-width: 600px) 200px, 260px',
    topic: '(max-width: 600px) 100px, 180px',
    section: '(max-width: 600px) 80px, 120px',
    thumb: '(max-width: 600px) 88px, 120px',
    directory: '(max-width: 600px) 180px, 220px',
    game: '(max-width: 600px) 220px, 260px',
  };
  if (!Object.hasOwn(sizes, placement)) throw new Error(`Unknown illustration placement: ${placement}`);
  const base = `/assets/illustrations/${id}`;
  return {
    class: `ra-art ra-art-${placement}`, 'data-illustration': id,
    src: `${base}-480.webp`, srcset: `${base}-480.webp 480w, ${base}-960.webp 960w`,
    sizes: sizes[placement], width: '960', height: '640', alt: '',
    loading: eager ? 'eager' : 'lazy', decoding: 'async',
    ...(eager ? { fetchpriority: 'high' } : {}),
  };
}

export function illustrationMarkup(id, placement = 'card', eager = false) {
  const attributes = illustrationAttributes(id, placement, eager);
  if (!attributes) return '';
  return `<img ${Object.entries(attributes).map(([name, value]) => `${name}="${value}"`).join(' ')} />`;
}
