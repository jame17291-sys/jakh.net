// Shared by the static generators and the live topic directory. Illustrations
// repeat nearby headings, so they are decorative in both language versions.
export const ILLUSTRATIONS = Object.freeze([
  'home-discovery', 'mind-lab-overview', 'akshifha', 'chess', 'backgammon',
  'daily-challenge', 'arabic-riddles', 'logic-puzzles', 'kids-riddles',
  'science-nature', 'technology-engineering', 'regional-history', 'nostalgia',
  'shared-play', 'space-astronomy', 'geography', 'football', 'books-quotes',
  'music', 'food-cuisines', 'quick-fire', 'suggest-topic',
]);

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
  'classic-riddles': 'arabic-riddles', 'logic-puzzles': 'logic-puzzles',
  'kids-riddles': 'kids-riddles', science: 'science-nature',
  'space-and-astrology': 'space-astronomy', geography: 'geography',
  football: 'football', 'books-and-quotes': 'books-quotes',
  'music-and-performing-arts': 'music', 'food-and-cuisines': 'food-cuisines',
  'inventions-and-minds': 'suggest-topic', 'ayam-tayebeen': 'nostalgia',
});

export function illustrationMarkup(id, placement = 'card', eager = false) {
  if (!ILLUSTRATIONS.includes(id)) return '';
  const sizes = {
    hero: '(max-width: 680px) 220px, 340px',
    card: '(max-width: 600px) 200px, 260px',
    topic: '(max-width: 600px) 100px, 180px',
    section: '(max-width: 600px) 80px, 120px',
    thumb: '(max-width: 600px) 88px, 120px',
  };
  if (!Object.hasOwn(sizes, placement)) throw new Error(`Unknown illustration placement: ${placement}`);
  const base = `/assets/illustrations/${id}`;
  return `<img class="ra-art ra-art-${placement}" src="${base}-480.webp" srcset="${base}-480.webp 480w, ${base}-960.webp 960w" sizes="${sizes[placement]}" width="960" height="640" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''} />`;
}
