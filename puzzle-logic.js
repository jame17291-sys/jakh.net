/* Original, deterministic logic games for Riddle Arabia. No network dependencies. */
function rng(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n += 0x6D2B79F5; let z = n; z = Math.imul(z ^ z >>> 15, z | 1); z ^= z + Math.imul(z ^ z >>> 7, z | 61); return ((z ^ z >>> 14) >>> 0) / 4294967296; };
}
function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sequence = n => Array.from({ length: n }, (_, i) => i);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const copy = v => JSON.parse(JSON.stringify(v));
const validDigit = n => Number.isInteger(n) && n >= 0 && n <= 9;
const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function gridNeighbor(index, key, columns, count, rtl = false) {
  const delta = { ArrowUp: -columns, ArrowDown: columns, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[key];
  if (!Number.isInteger(index) || !delta) return index;
  const next = index + delta;
  if (next < 0 || next >= count || (Math.abs(delta) === 1 && Math.floor(next / columns) !== Math.floor(index / columns))) return index;
  return next;
}

export function sudokuDigit(key) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  for (const digits of ['0123456789', '٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹']) if (digits.includes(key)) return digits.indexOf(key);
  return null;
}

export function sudokuCandidates(board, index) {
  if (!Array.isArray(board) || board.length !== 81 || !Number.isInteger(index) || index < 0 || index >= 81 || board[index]) return [];
  const row = Math.floor(index / 9), col = index % 9, used = new Set();
  for (let i = 0; i < 9; i++) {
    used.add(board[row * 9 + i]); used.add(board[i * 9 + col]);
    used.add(board[(Math.floor(row / 3) * 3 + Math.floor(i / 3)) * 9 + Math.floor(col / 3) * 3 + i % 3]);
  }
  return sequence(9).map(n => n + 1).filter(n => !used.has(n));
}
export function isSudokuValid(board) {
  if (!Array.isArray(board) || board.length !== 81 || !Array.from(board).every(validDigit)) return false;
  for (let i = 0; i < 81; i++) {
    if (!board[i]) continue;
    const test = [...board]; test[i] = 0;
    if (!sudokuCandidates(test, i).includes(board[i])) return false;
  }
  return true;
}
export function solveSudoku(board, limit = 2) {
  if (!Number.isSafeInteger(limit) || limit < 1 || !isSudokuValid(board)) return [];
  const grid = [...board], solutions = [];
  function search() {
    if (solutions.length >= limit) return;
    let cell = -1, candidates = null;
    for (let i = 0; i < 81; i++) if (!grid[i]) {
      const options = sudokuCandidates(grid, i);
      if (!options.length) return;
      if (candidates === null || options.length < candidates.length) { cell = i; candidates = options; }
      if (options.length === 1) break;
    }
    if (cell === -1) { solutions.push([...grid]); return; }
    for (const n of candidates) { grid[cell] = n; search(); if (solutions.length >= limit) break; }
    grid[cell] = 0;
  }
  search(); return solutions;
}
export const isSudokuComplete = board => Array.isArray(board) && board.every(n => n > 0) && isSudokuValid(board);
export function createSudoku(seed, difficulty = 'medium') {
  const random = rng(`sudoku:${seed}:${difficulty}`), digits = shuffle(sequence(9).map(n => n + 1), random);
  const order = () => shuffle([0, 1, 2], random).flatMap(group => shuffle([0, 1, 2], random).map(n => group * 3 + n));
  const rows = order(), cols = order();
  const solution = rows.flatMap(row => cols.map(col => digits[(row * 3 + Math.floor(row / 3) + col) % 9]));
  const givens = [...solution], target = ({ easy: 43, medium: 34, hard: 28 })[difficulty] || 34;
  let clues = 81;
  for (const cell of shuffle(sequence(81), random)) {
    if (clues <= target) break;
    const before = givens[cell]; givens[cell] = 0;
    if (solveSudoku(givens, 2).length === 1) clues--; else givens[cell] = before;
  }
  return { givens, solution, difficulty, clues };
}

export function restoreSudokuState(saved, puzzle) {
  const state = { version: 1, difficulty: puzzle.difficulty, values: [...puzzle.givens], notes: sequence(81).map(() => []), hints: 0, pencil: false };
  if (saved?.version !== 1 || !Array.isArray(saved.values) || saved.values.length !== 81 || !Array.from(saved.values).every(validDigit)) return state;
  state.values = saved.values.map((value, i) => puzzle.givens[i] || value);
  state.hints = counter(saved.hints); state.pencil = saved.pencil === true;
  if (Array.isArray(saved.notes) && saved.notes.length === 81) state.notes = Array.from(saved.notes, notes => Array.isArray(notes) ? [...new Set(notes.filter(n => validDigit(n) && n))].sort() : []);
  return state;
}

const DOMINO_REGIONS = [[0, 1, 4, 5], [2, 3, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]];
export function createDomino(seed) {
  const random = rng(`domino:${seed}`), values = sequence(16).map(() => Math.floor(random() * 7));
  const equal = Math.floor(random() * 5) + 1;
  DOMINO_REGIONS[1].forEach(i => { values[i] = equal; });
  shuffle(sequence(7), random).slice(0, 4).forEach((value, n) => { values[DOMINO_REGIONS[2][n]] = value; });
  const layout = [[0, 4], [1, 2], [3, 7], [5, 6], [8, 9], [10, 14], [11, 15], [12, 13]];
  const tiles = shuffle(layout.map((cells, id) => {
    const flipped = random() < 0.5;
    return { id, values: flipped ? [values[cells[1]], values[cells[0]]] : cells.map(i => values[i]), cells, flipped };
  }), random);
  const pieces = tiles.map((tile, id) => ({ id, values: tile.values }));
  const solution = tiles.map((tile, id) => ({ piece: id, cell: tile.cells[0], direction: tile.cells[1] - tile.cells[0] === 4 ? 'v' : 'h', flipped: tile.flipped }));
  const regions = DOMINO_REGIONS.map((cells, id) => ({ id, cells, type: id === 1 ? 'same' : id === 2 ? 'different' : 'sum', target: cells.reduce((sum, i) => sum + values[i], 0) }));
  return { width: 4, height: 4, pieces, regions, solution };
}
export function dominoCells(puzzle, placement) {
  if (!placement || !Number.isInteger(placement.cell) || !['h', 'v'].includes(placement.direction)) return null;
  const { cell, direction } = placement;
  if (cell < 0 || cell >= puzzle.width * puzzle.height || (direction === 'h' && cell % puzzle.width === puzzle.width - 1)) return null;
  const second = cell + (direction === 'h' ? 1 : puzzle.width);
  return second < puzzle.width * puzzle.height ? [cell, second] : null;
}
export function dominoBoard(puzzle, placements) {
  if (!Array.isArray(placements) || placements.length > puzzle.pieces.length) return null;
  const board = Array(puzzle.width * puzzle.height).fill(null), used = new Set();
  for (const placement of placements) {
    if (!placement || typeof placement !== 'object' || (placement.flipped !== undefined && typeof placement.flipped !== 'boolean')) return null;
    const piece = puzzle.pieces.find(p => p.id === placement.piece), cells = dominoCells(puzzle, placement);
    if (!piece || !cells || used.has(piece.id) || cells.some(i => board[i] !== null)) return null;
    used.add(piece.id);
    const numbers = placement.flipped ? [...piece.values].reverse() : piece.values;
    cells.forEach((cell, i) => { board[cell] = { piece: piece.id, value: numbers[i], half: i, direction: placement.direction }; });
  }
  return board;
}
export function placeDomino(puzzle, placements, placement) {
  if (!placement || !dominoBoard(puzzle, placements)) return null;
  const next = [...placements.filter(p => p.piece !== placement.piece), { ...placement }];
  return dominoBoard(puzzle, next) ? next : null;
}
export function checkDominoRegions(puzzle, placements) {
  const board = dominoBoard(puzzle, placements);
  if (!board) return [];
  return puzzle.regions.map(region => {
    const values = region.cells.map(i => board[i]?.value).filter(v => v !== undefined), complete = values.length === region.cells.length;
    const total = values.reduce((sum, n) => sum + n, 0);
    let valid = true;
    if (region.type === 'sum') valid = total <= region.target && total + (region.cells.length - values.length) * 6 >= region.target && (!complete || total === region.target);
    if (region.type === 'same') valid = new Set(values).size <= 1;
    if (region.type === 'different') valid = new Set(values).size === values.length;
    return { ...region, complete, valid, total, filled: values.length };
  });
}
export function isDominoComplete(puzzle, placements) {
  const board = dominoBoard(puzzle, placements);
  return !!board && board.every(Boolean) && checkDominoRegions(puzzle, placements).every(r => r.complete && r.valid);
}

export const MOSAIC_LAYERS = ['color', 'shape', 'motif'];
export function createMosaic(seed) {
  const random = rng(`mosaic:${seed}`), tiles = sequence(20).map(id => ({ id }));
  for (const layer of MOSAIC_LAYERS) {
    const pairs = sequence(10).flatMap(i => [i % 5, i % 5]);
    shuffle(pairs, random).forEach((value, i) => { tiles[i][layer] = value; });
  }
  return tiles;
}
export const mosaicEmpty = tile => !!tile && MOSAIC_LAYERS.every(layer => tile[layer] === null);
export function mosaicShared(first, second) {
  if (!first || !second || first.id === second.id) return [];
  return MOSAIC_LAYERS.filter(layer => Number.isInteger(first[layer]) && first[layer] >= 0 && first[layer] < 5 && first[layer] === second[layer]);
}
export function matchMosaic(tiles, firstId, secondId) {
  if (!Array.isArray(tiles) || !Array.from(tiles).every(tile => tile && Number.isInteger(tile.id) && MOSAIC_LAYERS.every(layer => tile[layer] === null || (Number.isInteger(tile[layer]) && tile[layer] >= 0 && tile[layer] < 5))) || new Set(tiles.map(tile => tile.id)).size !== tiles.length) return null;
  const first = tiles.find(t => t.id === firstId), second = tiles.find(t => t.id === secondId), shared = mosaicShared(first, second);
  if (!shared.length) return null;
  return { shared, tiles: tiles.map(tile => tile.id === firstId || tile.id === secondId ? { ...tile, ...Object.fromEntries(shared.map(layer => [layer, null])) } : { ...tile }) };
}
export const isMosaicComplete = tiles => Array.isArray(tiles) && tiles.length > 0 && Array.from(tiles).every(mosaicEmpty);
export function findMosaicMatch(tiles, preferredId = null) {
  if (!Array.isArray(tiles)) return null;
  const active = tiles.filter(tile => tile && !mosaicEmpty(tile));
  if (preferredId !== null) {
    const first = active.find(tile => tile.id === preferredId), second = active.find(tile => mosaicShared(first, tile).length);
    if (second) return [first.id, second.id];
  }
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) if (mosaicShared(active[i], active[j]).length) return [active[i].id, active[j].id];
  return null;
}

export function restoreMosaicState(saved, initial) {
  const fallback = { tiles: initial.map(tile => ({ ...tile })), combo: 0, best: 0, score: 0, matches: 0, hints: 0 };
  const validSaved = saved?.version === 1 && Array.isArray(saved.tiles) && saved.tiles.length === initial.length && Array.from(saved.tiles).every((tile, i) => tile && tile.id === i && MOSAIC_LAYERS.every(layer => tile[layer] === null || tile[layer] === initial[i][layer])) && MOSAIC_LAYERS.every(layer => sequence(5).every(value => saved.tiles.filter(tile => tile[layer] === value).length % 2 === 0));
  if (!validSaved) return fallback;
  const matches = Math.min(30, counter(saved.matches)), combo = Math.min(matches, counter(saved.combo));
  return { tiles: saved.tiles.map(tile => ({ ...tile })), combo, best: Math.min(matches, Math.max(combo, counter(saved.best))), score: Math.min(4650, counter(saved.score)), matches, hints: counter(saved.hints) };
}

function mountTools(root, ctx) {
  const controller = new AbortController(), t = typeof ctx.t === 'function' ? ctx.t : ((en, ar) => ctx.lang === 'ar' ? ar : en);
  root.classList.add('pl-game');
  const content = document.createElement('div'), status = document.createElement('div');
  content.className = 'pl-content'; status.className = 'pl-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
  root.replaceChildren(content, status);
  const tools = {
    t,
    on: (event, handler) => root.addEventListener(event, handler, { signal: controller.signal }),
    load: fallback => { try { return ctx.load?.(fallback) || fallback; } catch { return fallback; } },
    save: state => { try { ctx.save?.(state); } catch { /* The game remains playable without storage. */ } },
    draw: (markup, focus = null, message = '', won = false) => {
      const before = root.contains(document.activeElement) ? document.activeElement?.getAttribute('data-focus') : null;
      const helpOpen = content.querySelector('.pl-instructions')?.open;
      content.innerHTML = markup;
      if (helpOpen) content.querySelector('.pl-instructions').open = true;
      status.className = `pl-status${won ? ' pl-won' : ''}`;
      if (status.textContent !== message) status.textContent = message;
      const selector = focus ?? before;
      if (selector) {
        const target = root.querySelector(`[data-focus="${selector}"]`);
        (target && !target.disabled ? target : root.querySelector('[data-focus]:not(:disabled)'))?.focus({ preventScroll: true });
      }
    },
    cleanup: () => { controller.abort(); root.classList.remove('pl-game'); },
  };
  return tools;
}
function instructions(t, text, extra = '') {
  return `<details class="pl-instructions"><summary>${esc(t('How to play', 'طريقة اللعب'))}</summary><p>${esc(text)}</p>${extra}</details>`;
}
function actionButton(action, text, attributes = '') {
  return `<button type="button" class="pl-button" data-action="${action}" data-focus="${action}" ${attributes}>${esc(text)}</button>`;
}

function mountSudoku(root, ctx) {
  const ui = mountTools(root, ctx), { t } = ui, levels = ['easy', 'medium', 'hard'];
  const saved = ui.load({}), level = levels.includes(ctx.difficulty) ? ctx.difficulty : levels.includes(saved.difficulty) ? saved.difficulty : levels.includes(ctx.variant) ? ctx.variant : 'medium';
  let puzzle = createSudoku(ctx.seed, level);
  let state = restoreSudokuState(saved, puzzle);
  let selected = puzzle.givens.findIndex(n => !n), errors = new Set(), history = [], message = '';
  if (selected < 0) selected = 0;
  const won = () => isSudokuComplete(state.values);
  const levelName = difficulty => ({ easy: t('Easy', 'سهل'), medium: t('Medium', 'متوسط'), hard: t('Hard', 'صعب') })[difficulty];
  function render(focus = null) {
    const complete = won(), count = state.values.filter(Boolean).length, same = state.values[selected];
    ctx.reportResult?.({ ...state, completed: complete });
    const grid = sequence(9).map(row => `<div role="row" class="pl-sudoku-row">${sequence(9).map(col => {
      const i = row * 9 + col, value = state.values[i], fixed = !!puzzle.givens[i];
      const near = row === Math.floor(selected / 9) || col === selected % 9 || (Math.floor(row / 3) === Math.floor(selected / 27) && Math.floor(col / 3) === Math.floor(selected % 9 / 3));
      const label = `${t('Row', 'صف')} ${row + 1}, ${t('column', 'عمود')} ${col + 1}: ${value || t('empty', 'فارغ')}${fixed ? `, ${t('given', 'معطى')}` : ''}${!value && state.notes[i].length ? `, ${t('notes', 'ملاحظات')} ${state.notes[i].join(', ')}` : ''}`;
      return `<button type="button" role="gridcell" class="pl-sudoku-cell${fixed ? ' pl-given' : ''}${near ? ' pl-near' : ''}${same && same === value ? ' pl-same-number' : ''}${selected === i ? ' pl-selected' : ''}${errors.has(i) ? ' pl-error' : ''}" data-cell="${i}" data-focus="s${i}" tabindex="${selected === i ? 0 : -1}" aria-selected="${selected === i}" aria-readonly="${fixed}" aria-invalid="${errors.has(i)}" aria-label="${esc(label)}">${value || `<span class="pl-notes" aria-hidden="true">${sequence(9).map(n => `<span>${state.notes[i].includes(n + 1) ? n + 1 : ''}</span>`).join('')}</span>`}</button>`;
    }).join('')}</div>`).join('');
    ui.draw(`${instructions(t, t('Fill each row, column, and 3 × 3 box with 1–9, without repeating a number. Choose a cell, then a number. Notes add small pencil marks. Arrow keys move; 1–9 enter a number; Backspace erases; N toggles notes.', 'املأ كل صف وعمود ومربع ٣ × ٣ بالأرقام من ١ إلى ٩ دون تكرار. اختر خانة ثم رقماً. استخدم الملاحظات لتدوين الاحتمالات. الأسهم للتنقل، والأرقام للإدخال، وBackspace للمسح، وN للملاحظات.'))}
      <div class="pl-toolbar"><label class="pl-select-label">${esc(t('Difficulty', 'المستوى'))}<select data-action="difficulty" data-focus="difficulty" aria-label="${esc(t('Difficulty — progress is saved for each level', 'المستوى — يُحفظ التقدّم لكل مستوى'))}">${levels.map(n => `<option value="${n}" ${state.difficulty === n ? 'selected' : ''}>${esc(levelName(n))}</option>`).join('')}</select></label><span class="pl-meta">${count} / 81 ${esc(t('filled', 'مكتملة'))}</span></div>
      <div class="pl-sudoku" role="grid" dir="ltr" aria-label="${esc(t('Sudoku, 9 rows and 9 columns', 'سودوكو، ٩ صفوف و٩ أعمدة'))}">${grid}</div>
      <div class="pl-numberpad" dir="ltr" role="group" aria-label="${esc(t('Choose a number', 'اختر رقماً'))}">${sequence(9).map(n => actionButton(`number-${n + 1}`, n + 1, complete ? 'disabled' : '')).join('')}</div>
      <div class="pl-toolbar pl-actions">${actionButton('notes', t('Pencil notes', 'ملاحظات'), `aria-pressed="${state.pencil}" ${complete ? 'disabled' : ''}`)}${actionButton('erase', t('Erase', 'مسح'), complete ? 'disabled' : '')}${actionButton('undo', t('Undo', 'تراجع'), history.length ? '' : 'disabled')}${actionButton('check', t('Check', 'تحقق'))}${actionButton('hint', t('Hint', 'تلميح'), complete ? 'disabled' : '')}</div>
      `, focus, complete ? t(`Beautifully solved. ${state.hints} hint${state.hints === 1 ? '' : 's'} used.`, `أحسنت! اكتملت اللوحة. التلميحات المستخدمة: ${state.hints}.`) : message || t('A little focus, one number at a time.', 'قليل من التركيز، رقم بعد رقم.'), complete);
  }
  function remember() { history.push(copy(state)); if (history.length > 81) history.shift(); }
  function input(value) {
    if (!validDigit(value)) return;
    if (won() || puzzle.givens[selected]) { message = t('Choose an empty or editable cell.', 'اختر خانة فارغة أو قابلة للتعديل.'); render(); return; }
    remember();
    if (state.pencil && value && !state.values[selected]) {
      const notes = new Set(state.notes[selected]); notes.has(value) ? notes.delete(value) : notes.add(value); state.notes[selected] = [...notes].sort();
    } else { state.values[selected] = value; state.notes[selected] = []; }
    errors.delete(selected); message = ''; ui.save(state); render();
  }
  ui.on('click', event => {
    const cell = event.target.closest('[data-cell]');
    if (cell) { selected = Number(cell.dataset.cell); message = ''; render(`s${selected}`); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action.startsWith('number-')) return input(Number(action.slice(7)));
    if (action === 'erase') return input(0);
    if (action === 'notes') { state.pencil = !state.pencil; message = state.pencil ? t('Notes are on. Enter possible numbers in empty cells.', 'الملاحظات مفعلة. أضف الأرقام المحتملة للخانات الفارغة.') : t('Notes are off. Numbers fill the cell.', 'الملاحظات متوقفة. الأرقام تملأ الخانات.'); }
    if (action === 'undo' && history.length) { state = history.pop(); errors.clear(); message = t('Last move undone.', 'تم التراجع عن الخطوة الأخيرة.'); }
    if (action === 'check') { errors = new Set(state.values.flatMap((n, i) => n && n !== puzzle.solution[i] ? [i] : [])); message = errors.size ? t(`${errors.size} entered cell${errors.size === 1 ? ' needs' : 's need'} another look.`, `راجع الخانات المحددة: ${errors.size}.`) : t('Every number entered is correct so far.', 'كل الأرقام المدخلة صحيحة حتى الآن.'); }
    if (action === 'hint' && !won()) {
      const cellIndex = !puzzle.givens[selected] && state.values[selected] !== puzzle.solution[selected] ? selected : state.values.findIndex((n, i) => n !== puzzle.solution[i]);
      if (cellIndex >= 0) { remember(); selected = cellIndex; state.values[selected] = puzzle.solution[selected]; state.notes[selected] = []; state.hints++; errors.delete(selected); message = t('One correct number revealed.', 'تم كشف رقم صحيح.'); }
    }
    ui.save(state); render();
  });
  ui.on('change', event => {
    if (event.target.dataset.action !== 'difficulty' || !levels.includes(event.target.value)) return;
    puzzle = createSudoku(ctx.seed, event.target.value);
    let savedLevel;try{savedLevel=ctx.loadDifficulty?.(event.target.value);}catch{savedLevel=null;}
    state = restoreSudokuState(savedLevel, puzzle);
    history = []; errors.clear(); selected = Math.max(0,state.values.findIndex(n => !n)); message = savedLevel?.version===1?t('Your saved progress for this difficulty.', 'تقدّمك المحفوظ لهذا المستوى.'):t('A fresh board for this difficulty.', 'لوحة جديدة لهذا المستوى.'); ui.save(state); render();
  });
  ui.on('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || !event.target.closest('[data-cell]')) return;
    selected = Number(event.target.closest('[data-cell]').dataset.cell);
    const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in moves) { event.preventDefault(); selected = gridNeighbor(selected, event.key, 9, 81); render(`s${selected}`); }
    else if (sudokuDigit(event.key) !== null) { event.preventDefault(); input(sudokuDigit(event.key)); }
    else if (['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); input(0); }
    else if (event.key.toLowerCase() === 'n') { event.preventDefault(); state.pencil = !state.pencil; ui.save(state); render(); }
  });
  render(); return ui.cleanup;
}

function pips(value) {
  const locations = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return `<span class="pl-pips" aria-hidden="true">${sequence(9).map(i => `<i${locations[value]?.includes(i) ? ' class="pl-dot"' : ''}></i>`).join('')}${value === 0 ? '<span class="pl-zero">0</span>' : ''}</span>`;
}
function mountDomino(root, ctx) {
  const ui = mountTools(root, ctx), { t } = ui, puzzle = createDomino(ctx.seed), saved = ui.load({});
  let placements = saved.version === 1 && dominoBoard(puzzle, saved.placements) ? saved.placements : [], history = [];
  let selected = puzzle.pieces.find(p => !placements.some(q => q.piece === p.id))?.id ?? null, direction = 'h', flipped = false, anchor = 0, message = '', checked = false;
  const save = () => ui.save({ version: 1, placements });
  const regionLabel = region => region.type === 'same' ? t('All equal', 'كلها متساوية') : region.type === 'different' ? t('All different', 'كلها مختلفة') : t(`Sum ${region.target}`, `المجموع ${region.target}`);
  function render(focus = null) {
    const board = dominoBoard(puzzle, placements), regions = checkDominoRegions(puzzle, placements), complete = isDominoComplete(puzzle, placements);
    ctx.reportResult?.({ version: 1, placements, completed: complete });
    const letters = t(['A', 'B', 'C', 'D'], ['أ', 'ب', 'ج', 'د']);
    const tiles = puzzle.pieces.filter(p => !placements.some(q => q.piece === p.id));
    ui.draw(`${instructions(t, t('Fill the board with every domino. Each outlined region has a rule: a required sum, all numbers equal, or all numbers different. Choose a domino, rotate or flip it, then choose its first cell. A domino extends right or down. Choose a placed domino to return it to the tray. Zero is a valid value.', 'املأ اللوحة بكل قطع الدومينو. لكل منطقة قاعدة: مجموع محدد، أو أرقام متساوية، أو أرقام مختلفة. اختر قطعة، ودوّرها أو اعكس طرفيها، ثم اختر خانتها الأولى. تمتد القطعة يميناً أو إلى الأسفل. اضغط على قطعة موضوعة لإعادتها إلى الحامل. الصفر قيمة صالحة.'))}
      <div class="pl-region-legend">${regions.map((region, i) => `<div class="pl-region-rule pl-region-${i}${checked && !region.valid ? ' pl-region-error' : ''}${region.complete && region.valid ? ' pl-region-done' : ''}"><span class="pl-region-letter">${letters[i]}</span><strong>${esc(regionLabel(region))}</strong><span>${region.complete && region.valid ? '✓' : region.type === 'sum' ? `${region.total} / ${region.target}` : `${region.filled} / 4`}</span></div>`).join('')}</div>
      <div class="pl-domino-board" role="grid" dir="ltr" aria-label="${esc(t('Domino board, four rows and four columns', 'لوحة الدومينو، أربعة صفوف وأربعة أعمدة'))}">${sequence(4).map(row => `<div class="pl-domino-row" role="row">${sequence(4).map(col => {
        const i = row * 4 + col, region = Math.floor(row / 2) * 2 + Math.floor(col / 2), entry = board[i];
        return `<button type="button" role="gridcell" class="pl-domino-cell pl-region-${region}${entry ? ` pl-placed pl-half-${entry.half} pl-dir-${entry.direction}` : ''}${anchor === i ? ' pl-anchor' : ''}" tabindex="${anchor === i ? 0 : -1}" aria-selected="${anchor === i}" data-board-cell="${i}" data-focus="d${i}" aria-label="${esc(`${t('Row', 'صف')} ${row + 1}, ${t('column', 'عمود')} ${col + 1}, ${t('region', 'منطقة')} ${letters[region]}, ${entry ? `${entry.value}. ${t('Select to remove domino', 'اختر لإزالة القطعة')}` : t('empty', 'فارغ')}`)}">${[0, 2, 8, 10].includes(i) ? `<span class="pl-region-marker">${letters[region]}</span>` : ''}${entry ? pips(entry.value) : '<span class="pl-empty-dot" aria-hidden="true">·</span>'}</button>`;
      }).join('')}</div>`).join('')}</div>
      <div class="pl-tray-heading"><h3>${esc(t('Your dominos', 'قطع الدومينو'))}</h3><span class="pl-meta">${tiles.length} ${esc(t('remaining', 'متبقية'))}</span></div>
      <div class="pl-domino-tray" dir="ltr" role="group" aria-label="${esc(t('Available dominos', 'القطع المتاحة'))}">${tiles.map(piece => `<button type="button" class="pl-domino-piece${piece.id === selected ? ' pl-picked' : ''}" data-piece="${piece.id}" data-focus="piece${piece.id}" aria-pressed="${piece.id === selected}" aria-label="${esc(t(`Domino ${piece.id + 1}: ${piece.values[0]} and ${piece.values[1]}`, `القطعة ${piece.id + 1}: ${piece.values[0]} و${piece.values[1]}`))}">${piece.values.map(pips).join('')}</button>`).join('') || `<p class="pl-meta">${esc(t('Every domino is on the board.', 'كل القطع على اللوحة.'))}</p>`}</div>
      <div class="pl-placement-preview">${selected !== null ? `<span>${esc(t('Ready to place', 'جاهزة للوضع'))}</span><span class="pl-domino-preview${direction === 'v' ? ' pl-vertical' : ''}" dir="ltr">${(flipped ? [...puzzle.pieces[selected].values].reverse() : puzzle.pieces[selected].values).map(pips).join('')}</span><span>${esc(direction === 'h' ? t('Extends right →', 'تمتد يميناً →') : t('Extends down ↓', 'تمتد للأسفل ↓'))}</span>` : `<span>${esc(t('Choose a placed domino to move it.', 'اختر قطعة موضوعة لتحريكها.'))}</span>`}</div>
      <div class="pl-toolbar pl-actions">${actionButton('rotate', t('Rotate ↻', 'تدوير ↻'), `aria-pressed="${direction === 'v'}" ${selected === null ? 'disabled' : ''}`)}${actionButton('flip', t('Flip ends ⇄', 'عكس الطرفين ⇄'), `aria-pressed="${flipped}" ${selected === null ? 'disabled' : ''}`)}${actionButton('undo', t('Undo', 'تراجع'), history.length ? '' : 'disabled')}${actionButton('check', t('Check regions', 'تحقق من المناطق'))}</div>
      `, focus, complete ? t('Perfect fit. Every region follows its rule.', 'ترتيب متقن! كل منطقة تحقق قاعدتها.') : message || t('Find a home for every domino.', 'اعثر على مكان لكل قطعة.'), complete);
  }
  function remember() { history.push(copy(placements)); if (history.length > 50) history.shift(); }
  function useCell(index) {
    anchor = index;
    const board = dominoBoard(puzzle, placements), entry = board[index];
    if (entry) { remember(); placements = placements.filter(p => p.piece !== entry.piece); selected = entry.piece; message = t('Domino returned to the tray.', 'أعيدت القطعة إلى الحامل.'); }
    else if (selected !== null) {
      const next = placeDomino(puzzle, placements, { piece: selected, cell: index, direction, flipped });
      if (!next) { message = t('This domino needs two empty adjacent cells. Try rotating it.', 'تحتاج القطعة إلى خانتين فارغتين متجاورتين. جرّب تدويرها.'); render(`d${anchor}`); return; }
      remember(); placements = next; selected = puzzle.pieces.find(p => !placements.some(q => q.piece === p.id))?.id ?? null; flipped = false; message = '';
    } else message = t('Choose a domino from the tray first.', 'اختر قطعة من الحامل أولاً.');
    checked = false; save(); render(`d${anchor}`);
  }
  ui.on('click', event => {
    const cell = event.target.closest('[data-board-cell]'); if (cell) return useCell(Number(cell.dataset.boardCell));
    const piece = event.target.closest('[data-piece]'); if (piece) { selected = Number(piece.dataset.piece); flipped = false; message = ''; render(); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'rotate') direction = direction === 'h' ? 'v' : 'h';
    if (action === 'flip') flipped = !flipped;
    if (action === 'undo' && history.length) { placements = history.pop(); selected = puzzle.pieces.find(p => !placements.some(q => q.piece === p.id))?.id ?? null; checked = false; message = t('Last move undone.', 'تم التراجع عن الخطوة الأخيرة.'); save(); }
    if (action === 'check') {
      checked = true; const incorrect = checkDominoRegions(puzzle, placements).filter(r => !r.valid).length;
      message = incorrect ? t(`${incorrect} region${incorrect === 1 ? ' needs' : 's need'} a different arrangement.`, `تحتاج ${incorrect} من المناطق إلى ترتيب مختلف.`) : t('The regions work so far. Fill the remaining cells.', 'المناطق صحيحة حتى الآن. أكمل الخانات المتبقية.');
    }
    if (action) render();
  });
  ui.on('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || !event.target.closest('[data-board-cell]')) return;
    anchor = Number(event.target.closest('[data-board-cell]').dataset.boardCell);
    const moves = { ArrowUp: -4, ArrowDown: 4, ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in moves) { event.preventDefault(); anchor = gridNeighbor(anchor, event.key, 4, 16); render(`d${anchor}`); }
    else if (event.key.toLowerCase() === 'r') { event.preventDefault(); direction = direction === 'h' ? 'v' : 'h'; render(); }
    else if (event.key.toLowerCase() === 'f') { event.preventDefault(); flipped = !flipped; render(); }
    else if (['Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); if (dominoBoard(puzzle, placements)[anchor]) useCell(anchor); }
  });
  render(); return ui.cleanup;
}

const SHAPES = [
  '<circle cx="50" cy="50" r="35"/>',
  '<path d="M50 10 90 50 50 90 10 50Z"/>',
  '<path d="M18 82V43a32 32 0 0 1 64 0v39Z"/>',
  '<path d="M50 10 85 30v40L50 90 15 70V30Z"/>',
  '<path d="M50 15C65 0 83 17 78 32 98 37 98 62 78 68 83 83 65 100 50 85 35 100 17 83 22 68 2 62 2 37 22 32 17 17 35 0 50 15Z"/>',
];
const MOTIFS = [
  '<path d="m50 32 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1Z"/>',
  '<path d="M35 62q-4-25 30-25-1 30-30 25Zm0 0 22-17"/>',
  '<circle cx="50" cy="39" r="5"/><circle cx="40" cy="56" r="5"/><circle cx="60" cy="56" r="5"/>',
  '<path d="M33 43q8-12 17 0t17 0M33 57q8-12 17 0t17 0"/>',
  '<path d="m50 32 13 18-13 18-13-18Z"/>',
];
function tileSVG(tile) {
  return `<svg class="pl-tile-art" viewBox="0 0 100 100" aria-hidden="true">${tile.shape === null ? '' : `<g class="pl-shape-art">${SHAPES[tile.shape]}</g>`}${tile.motif === null ? '' : `<g class="pl-motif-art">${MOTIFS[tile.motif]}</g>`}</svg>`;
}
function mountMosaic(root, ctx) {
  const ui = mountTools(root, ctx), { t } = ui, initial = createMosaic(ctx.seed), saved = ui.load({});
  let state = restoreMosaicState(saved, initial);
  let selected = null, hint = [], history = [], message = '', showLabels = false;
  const names = {
    color: t(['Clay', 'Gold', 'Sea', 'Sky', 'Plum'], ['طين', 'ذهب', 'بحر', 'سماء', 'برقوق']),
    shape: t(['Circle', 'Diamond', 'Arch', 'Hexagon', 'Flower'], ['دائرة', 'معيّن', 'قوس', 'سداسي', 'زهرة']),
    motif: t(['Star', 'Leaf', 'Dots', 'Waves', 'Gem'], ['نجمة', 'ورقة', 'نقاط', 'أمواج', 'جوهرة']),
  };
  const layerNames = { color: t('color', 'اللون'), shape: t('outline', 'الإطار'), motif: t('symbol', 'الرمز') };
  const label = tile => MOSAIC_LAYERS.filter(layer => tile[layer] !== null).map(layer => names[layer][tile[layer]]).join(' · ');
  const save = () => ui.save({ version: 1, ...state });
  function render(focus = null) {
    const complete = isMosaicComplete(state.tiles), remaining = state.tiles.filter(tile => !mosaicEmpty(tile)).length;
    ctx.reportResult?.({ version: 1, ...state, completed: complete });
    ui.draw(`${instructions(t, t('Choose two tiles that share a color, outline, or center symbol. All shared layers disappear. Keep matching the selected tile to build a chain; when it clears, choose any tile. A miss breaks your chain. Clear every layer to finish. Each layer is dealt in pairs, so a match always remains.', 'اختر بلاطتين تشتركان في اللون أو الإطار أو الرمز الأوسط. تختفي جميع الطبقات المشتركة. تابع مطابقة البلاطة المحددة لبناء سلسلة؛ وعندما تختفي اختر أي بلاطة. الاختيار غير المطابق يقطع السلسلة. أزل كل الطبقات لتفوز. توزّع الطبقات في أزواج، لذا تبقى مطابقة متاحة دائماً.'))}
      <div class="pl-mosaic-stats"><div><strong>${state.score}</strong><span>${esc(t('Points', 'النقاط'))}</span></div><div><strong>${state.combo}</strong><span>${esc(t('Current chain', 'السلسلة الحالية'))}</span></div><div><strong>${state.best}</strong><span>${esc(t('Best chain', 'أفضل سلسلة'))}</span></div><div><strong>${remaining}</strong><span>${esc(t('Tiles left', 'بلاطات متبقية'))}</span></div></div>
      <div class="pl-mosaic-board" role="group" dir="${ctx.lang === 'ar' ? 'rtl' : 'ltr'}" aria-label="${esc(t('Layered mosaic tiles', 'بلاطات الفسيفساء المتعددة الطبقات'))}">${state.tiles.map(tile => `<button type="button" class="pl-mosaic-tile pl-color-${tile.color === null ? 'none' : tile.color}${selected === tile.id ? ' pl-picked' : ''}${hint.includes(tile.id) ? ' pl-hint' : ''}${mosaicEmpty(tile) ? ' pl-cleared' : ''}" data-tile="${tile.id}" data-focus="m${tile.id}" aria-pressed="${selected === tile.id}" ${mosaicEmpty(tile) ? 'disabled' : ''} aria-label="${esc(`${t('Tile', 'بلاطة')} ${tile.id + 1}: ${mosaicEmpty(tile) ? t('cleared', 'مكتملة') : label(tile)}`)}">${mosaicEmpty(tile) ? '<span aria-hidden="true">✓</span>' : `${tileSVG(tile)}<span class="pl-layer-count" aria-hidden="true">${MOSAIC_LAYERS.map(layer => `<i class="${tile[layer] === null ? '' : 'pl-layer-present'}"></i>`).join('')}</span>${showLabels ? `<span class="pl-tile-label">${esc(label(tile))}</span>` : ''}`}</button>`).join('')}</div>
      <div class="pl-toolbar pl-actions">${actionButton('labels', t('Show labels', 'إظهار الأسماء'), `aria-pressed="${showLabels}"`)}${actionButton('hint', t('Find a pair', 'ابحث عن زوج'), complete ? 'disabled' : '')}${actionButton('undo', t('Undo', 'تراجع'), history.length ? '' : 'disabled')}</div>
      `, focus, complete ? t(`A beautiful clean slate. ${state.score} points, best chain ${state.best}.`, `اكتملت الفسيفساء! ${state.score} نقطة، وأفضل سلسلة ${state.best}.`) : message || (selected === null ? t('Choose a tile to begin your chain.', 'اختر بلاطة لبدء سلسلتك.') : t('Find a tile with a matching layer.', 'ابحث عن بلاطة ذات طبقة مطابقة.')), complete);
  }
  ui.on('click', event => {
    const tileButton = event.target.closest('[data-tile]');
    if (tileButton) {
      const id = Number(tileButton.dataset.tile), tile = state.tiles[id]; if (!tile || mosaicEmpty(tile)) return;
      hint = []; message = '';
      if (selected === null) { selected = id; render(); return; }
      if (selected === id) { selected = null; render(); return; }
      const match = matchMosaic(state.tiles, selected, id);
      history.push({ state: copy(state), selected }); if (history.length > 60) history.shift();
      if (match) {
        state.tiles = match.tiles; state.combo++; state.best = Math.max(state.best, state.combo); state.matches++; state.score += match.shared.length * 10 * state.combo;
        selected = mosaicEmpty(state.tiles[id]) ? null : id;
        message = t(`Matched ${match.shared.map(layer => layerNames[layer]).join(' + ')}. Chain ${state.combo}!`, `تطابقت ${match.shared.map(layer => layerNames[layer]).join(' + ')}. السلسلة ${state.combo}!`);
      } else { state.combo = 0; selected = id; message = t('No shared layers. Start a new chain with this tile.', 'لا توجد طبقات مشتركة. ابدأ سلسلة جديدة بهذه البلاطة.'); }
      save();
      const nextFocus = mosaicEmpty(state.tiles[id]) ? state.tiles.find(tile => !mosaicEmpty(tile))?.id : id;
      render(nextFocus === undefined ? 'labels' : `m${nextFocus}`); return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'labels') showLabels = !showLabels;
    if (action === 'hint') { hint = findMosaicMatch(state.tiles, selected) || []; state.hints++; state.combo = 0; selected = hint[0] ?? null; message = t('The outlined tiles share a layer. A hint starts a new chain.', 'البلاطتان المحددتان تشتركان في طبقة. التلميح يبدأ سلسلة جديدة.'); save(); }
    if (action === 'undo' && history.length) { const last = history.pop(); state = last.state; selected = last.selected; hint = []; message = t('Last match undone.', 'تم التراجع عن المطابقة الأخيرة.'); save(); }
    if (action) render();
  });
  ui.on('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const button = event.target.closest('[data-tile]'); if (!button) return;
    const rtl = ctx.lang === 'ar', moves = { ArrowUp: -5, ArrowDown: 5, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 };
    if (!(event.key in moves)) return;
    event.preventDefault(); const current = Number(button.dataset.tile);
    let next = current;
    for (let n = 0; n < state.tiles.length; n++) {
      const candidate = gridNeighbor(next, event.key, 5, state.tiles.length, rtl); if (candidate === next) break;
      next = candidate;
      if (!mosaicEmpty(state.tiles[next])) { root.querySelector(`[data-focus="m${next}"]`)?.focus(); break; }
    }
  });
  render(); return ui.cleanup;
}

export function mount(root, context) {
  if (!root || !context) throw new Error('A root element and puzzle context are required.');
  if (context.game === 'sudoku') return mountSudoku(root, context);
  if (context.game === 'domino') return mountDomino(root, context);
  if (context.game === 'mosaic') return mountMosaic(root, context);
  throw new Error(`Unsupported logic game: ${context.game}`);
}
