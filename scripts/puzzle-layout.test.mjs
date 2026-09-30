import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crosswordLoadingMarkup, CROSSWORD_COPY } from '../puzzle-crossword-shell.js';
import { renderPuzzlePage } from './generate-puzzle-pages.mjs';

test('all crossword sizes reserve a responsive board before the game module loads', () => {
  for (const [game, size] of [['mini', 5], ['midi', 9], ['crossword', 13]]) for (const lang of ['en', 'ar']) {
    const shell = crosswordLoadingMarkup(game, lang), page = renderPuzzlePage(game, lang);
    assert.ok(page.includes(`<div class="puzzle-mount" id="puzzle-mount">${shell}</div>`));
    assert.match(shell, new RegExp(`class="pc-board pc-board-placeholder" data-size="${size}" aria-hidden="true"`));
    assert.ok(shell.includes(CROSSWORD_COPY.intro[lang === 'ar' ? 1 : 0]));
    assert.match(shell, /class="pc-current" role="status"/u);
    assert.equal((shell.match(/<h2>/gu) || []).length, 2);
    assert.equal((shell.match(/disabled tabindex="-1"/gu) || []).length, 2, 'loading controls cannot take focus');
  }
  for (const game of ['bonus', 'word', 'sudoku', null]) assert.equal(crosswordLoadingMarkup(game), '');
});

test('loaded crossword keeps the shell geometry and uses level-two clue headings', async () => {
  const [css, engine, runtime] = await Promise.all(['puzzle-room.css', 'puzzle-crossword.js', 'puzzle-room.js'].map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
  assert.match(css, /\.pc-board\s*\{[^}]*width:100%[^}]*aspect-ratio:1/u, 'board reserve follows the available width');
  assert.match(css, /\.pc-board\[data-size='5'\]\s*\{[^}]*max-width:400px/u);
  assert.match(css, /\.pc-current\s*\{[^}]*min-block-size:calc\(4\.5em \+ 1\.6rem\)/u, 'phone clue space grows with text size');
  assert.match(engine, /el\('p',t\(\.\.\.CROSSWORD_COPY\.intro\)\)/u);
  assert.match(engine, /group\.append\(el\('h2',direction/u);
  assert.ok(!engine.includes("el('h3',direction"));
  assert.match(runtime, /crosswordLoadingMarkup\(game,lang\)/u, 'reset and legacy routes retain the same loading shell');
  assert.match(runtime, /mountPoint\.setAttribute\('aria-busy','false'\)/u, 'success and load errors both clear busy state');
});
