import { readFile, writeFile } from 'node:fs/promises';
import { ARABIC_WORDS } from '../../puzzle-arabic-words.js';
const target = new URL('../src/word-duel-arabic.ts', import.meta.url);
const output = `// Generated from puzzle-arabic-words.js. Run node worker/scripts/sync-duel-arabic.mjs after editorial changes.\nexport const ARABIC_WORDS: readonly string[] = ${JSON.stringify(ARABIC_WORDS)};\n`;
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('Word Duel Arabic vocabulary is out of sync with the shared lexicon.');
} else await writeFile(target, output);
