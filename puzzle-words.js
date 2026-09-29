import { WORD_BANKS, HIVES, LINK_SETS, TRAIL_SETS, LETTER_SQUARES } from './puzzle-word-data.js';

export { WORD_BANKS, HIVES, LINK_SETS, TRAIL_SETS, LETTER_SQUARES };
export function normalizeWord(value, lang = 'en') {
  const word = String(value ?? '').normalize('NFKC').trim();
  return lang === 'ar' ? word.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا') : word.toUpperCase();
}
export function hashSeed(value) {
  let h = 2166136261;
  for (const c of String(value ?? 0)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}
export function shuffled(values, seed) {
  const result = [...values]; let n = hashSeed(seed);
  for (let i = result.length - 1; i > 0; i--) { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; const j = n % (i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function evaluateGuess(guess, answer, lang = 'en') {
  const g = [...normalizeWord(guess, lang)], a = [...normalizeWord(answer, lang)];
  if (g.length !== a.length) throw new Error('Guess length must match answer');
  const result = g.map((c, i) => c === a[i] ? 'correct' : 'absent'); const left = {};
  a.forEach((c, i) => { if (result[i] !== 'correct') left[c] = (left[c] || 0) + 1; });
  g.forEach((c, i) => { if (result[i] !== 'correct' && left[c] > 0) { result[i] = 'present'; left[c]--; } });
  return result;
}
export function validateHiveWord(value, puzzle, found = [], lang = 'en') {
  const word = normalizeWord(value, lang), letters = puzzle.letters.map(l => normalizeWord(l, lang));
  if (word.length < (lang === 'ar' ? 3 : 4)) return 'short';
  if (!word.includes(normalizeWord(puzzle.center, lang))) return 'center';
  if ([...word].some(c => !letters.includes(c))) return 'letters';
  if (found.map(w => normalizeWord(w, lang)).includes(word)) return 'duplicate';
  if (!puzzle.words.map(w => normalizeWord(w, lang)).includes(word)) return 'dictionary';
  return null;
}
export function hiveScore(word, puzzle, lang = 'en') {
  const w = normalizeWord(word, lang); return (w.length === (lang === 'ar' ? 3 : 4) ? 1 : w.length) + (puzzle.letters.every(l => w.includes(normalizeWord(l, lang))) ? 7 : 0);
}
export function checkGroup(selection, groups) {
  const unique = new Set(selection);
  const index = groups.findIndex(g => g.words.length === unique.size && g.words.every(w => unique.has(w)));
  const oneAway = index < 0 && groups.some(g => g.words.filter(w => unique.has(w)).length === g.words.length - 1 && unique.size === g.words.length);
  return { index, oneAway };
}
export function buildTrail(puzzle, seed = 0, lang = 'en') {
  const cols = 6, rows = 8; const flipX = hashSeed(seed) % 2, flipY = (hashSeed(seed) >>> 1) % 2;
  const path = [];
  for (let r = 0; r < rows; r++) for (let x = 0; x < cols; x++) {
    const col = r % 2 ? cols - 1 - x : x; path.push((flipY ? rows - 1 - r : r) * cols + (flipX ? cols - 1 - col : col));
  }
  const letters = Array(cols * rows), answers = []; let at = 0;
  for (const value of puzzle.words) { const word = normalizeWord(value, lang); const cells = path.slice(at, at + word.length); answers.push({ word, cells, span: value === puzzle.span }); [...word].forEach((c, i) => { letters[cells[i]] = c; }); at += word.length; }
  if (at !== 48 || letters.some(x => !x)) throw new Error('Trail puzzle must cover 48 cells');
  return { cols, rows, letters, answers, theme: puzzle.theme, extras: puzzle.extras.map(w => normalizeWord(w, lang)) };
}
export function validateTrailPath(path, board, used = []) {
  if (!path.length || new Set(path).size !== path.length || path.some(i => !Number.isInteger(i) || i < 0 || i >= board.letters.length || used.includes(i))) return false;
  return path.every((p, i) => !i || (Math.abs(Math.floor(p / board.cols) - Math.floor(path[i - 1] / board.cols)) <= 1 && Math.abs(p % board.cols - path[i - 1] % board.cols) <= 1));
}
export function validateSquareWord(value, puzzle, previous = '', lang = 'en') {
  const word = normalizeWord(value, lang), sides = puzzle.sides.map(s => s.map(c => normalizeWord(c, lang)));
  if (word.length < 3) return 'short';
  if (previous && word[0] !== normalizeWord(previous, lang).slice(-1)) return 'chain';
  const positions = [...word].map(c => sides.findIndex(side => side.includes(c)));
  if (positions.includes(-1)) return 'letters';
  if (positions.some((s, i) => i > 0 && s === positions[i - 1])) return 'side';
  if (!puzzle.words.map(w => normalizeWord(w, lang)).includes(word)) return 'dictionary';
  return null;
}

function el(tag, cls, text, attrs = {}) {
  const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined && text !== null) node.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v)); return node;
}
function button(text, action, cls = '', attrs = {}) { const b = el('button', `pw-button ${cls}`, text, { type: 'button', ...attrs }); b.addEventListener('click', action); return b; }
function paragraph(parent, text, cls = 'pw-copy') { const p = el('p', cls, text); parent.append(p); return p; }
function shell(root, c, title, instructions) {
  root.replaceChildren(); root.classList.add('pw-root'); root.dir = c.lang === 'ar' ? 'rtl' : 'ltr';
  const header = el('div', 'pw-game-intro'); header.append(el('h2', 'pw-game-heading', title)); const detail = el('details', 'pw-help'); detail.append(el('summary', '', c.t('How to play', 'طريقة اللعب'))); paragraph(detail, instructions); header.append(detail); root.append(header);
  const stage = el('div', 'pw-stage'); root.append(stage); const status = el('p', 'pw-status', '', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }); root.append(status);
  return { stage, status, say: text => { status.textContent = text; } };
}
function acceptedList(parent, words, c) {
  const details = el('details', 'pw-word-list'); details.append(el('summary', '', c.t('Practice dictionary', 'قاموس التدريب')));
  paragraph(details, c.t('This original practice puzzle uses this finite word list. A real word outside this list will not be accepted.', 'يستخدم هذا اللغز الأصلي قائمة الكلمات المحدودة التالية. الكلمات الصحيحة خارج القائمة لا تُقبل في هذا التدريب.'));
  paragraph(details, [...new Set(words)].sort().join(' · '), 'pw-bank'); parent.append(details);
}
function loadState(c, fallback) { try { const state = c.load(fallback); return state && typeof state === 'object' ? state : fallback; } catch { return fallback; } }
function persist(c, value) { c.save(value); }

function mountWord(root, c) {
  const lang = c.lang === 'ar' ? 'ar' : 'en', bank = WORD_BANKS[lang];
  const answer = normalizeWord(bank.answers[hashSeed(c.seed ?? c.puzzleId) % bank.answers.length], lang);
  const valid = new Set(bank.words.map(w => normalizeWord(w, lang)).filter(w => w.length === 5)); valid.add(answer);
  const clueMode = c.variant === 'clue', limit = clueMode ? 5 : 6;
  let state = loadState(c, { guesses: [], current: '' });
  let guesses = Array.isArray(state.guesses) ? state.guesses.filter(w => typeof w === 'string' && valid.has(w)).slice(0, limit) : [];
  let current = typeof state.current === 'string' ? normalizeWord(state.current, lang).slice(0, 5) : '';
  const { stage, say } = shell(root, c, c.t('Find the hidden word', 'اكتشف الكلمة المخفية'), c.t(`Guess a five-letter word in ${limit} tries. ● means right letter, right place; ◐ means the letter belongs elsewhere; – means absent. Repeated letters count only as often as they appear in the answer.`, `خمن كلمة من خمسة أحرف خلال ${limit} محاولات. ● حرف في مكانه، ◐ حرف في مكان آخر، – حرف غير موجود. يُحسب تكرار الحروف بحسب عددها في الحل. تُوحّد أشكال الألف وتُحذف الحركات.`));
  if (clueMode) paragraph(stage, c.t(`Starter clue: the word begins with ${answer[0]}.`, `تلميح البداية: تبدأ الكلمة بحرف «${answer[0]}».`), 'pw-theme');
  const grid = el('div', 'pw-word-grid', null, { role: 'group', tabindex: '0', 'aria-label': c.t('Your guesses. Type letters, then press Enter.', 'محاولاتك. اكتب الحروف ثم اضغط إدخال.') }); stage.append(grid);
  const keyboard = el('div', 'pw-keyboard', null, { role: 'group', 'aria-label': c.t('Letter keyboard', 'لوحة الحروف') });
  const keyButtons = new Map();
  const rows = lang === 'ar' ? ['ضصثقفغعهخحج', 'شسيبلاتنمك', 'ظطذدزروةىء'] : ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  rows.forEach(row => { const line = el('div', 'pw-key-row'); [...row].forEach(letter => { const b = button(letter, () => type(letter), 'pw-key', { 'aria-label': letter }); line.append(b); keyButtons.set(letter, b); }); keyboard.append(line); });
  const actions = el('div', 'pw-actions'); actions.append(button(c.t('Enter', 'إرسال'), submit, 'pw-primary'), button(c.t('Delete', 'حذف'), () => { current = current.slice(0, -1); update(); })); keyboard.append(actions); stage.append(keyboard);
  const remaining = paragraph(stage, '', 'pw-progress'); acceptedList(root, [...valid], c);
  function ended() { return guesses.includes(answer) || guesses.length >= limit; }
  function update() {
    grid.replaceChildren(); const marks = {};
    for (let r = 0; r < limit; r++) {
      const word = guesses[r] || (r === guesses.length ? current : ''), values = guesses[r] ? evaluateGuess(word, answer, lang) : [];
      const row = el('div', 'pw-word-row', null, { 'aria-label': c.t(`Guess ${r + 1}`, `المحاولة ${r + 1}`) });
      for (let i = 0; i < 5; i++) {
        const letter = word[i] || '', kind = values[i] || 'empty';
        const label = { correct: c.t('correct position', 'في مكانه'), present: c.t('different position', 'في مكان آخر'), absent: c.t('absent', 'غير موجود'), empty: c.t('not submitted', 'لم تُرسل') }[kind];
        const cell = el('span', `pw-letter pw-${kind}`, null, { 'aria-label': `${letter || c.t('empty', 'فارغ')}: ${label}` }); cell.append(el('span', '', letter)); if (values[i]) cell.append(el('small', 'pw-mark', { correct: '●', present: '◐', absent: '–' }[kind])); row.append(cell);
        if (letter && values[i] && (!marks[letter] || ['absent', 'present', 'correct'].indexOf(kind) > ['absent', 'present', 'correct'].indexOf(marks[letter]))) marks[letter] = kind;
      }
      grid.append(row);
    }
    keyButtons.forEach((b, l) => { b.className = `pw-button pw-key ${marks[l] ? `pw-${marks[l]}` : ''}`; b.disabled = ended(); });
    remaining.textContent = c.t(`${Math.max(0, limit - guesses.length)} guesses remaining`, `المحاولات المتبقية: ${Math.max(0, limit - guesses.length)}`);
    persist(c, { guesses, current, completed: guesses.includes(answer), finished: ended() });
    if (guesses.includes(answer)) say(c.t(`Beautifully solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}!`, `أحسنت! وجدت الكلمة في ${guesses.length} محاولة.`));
    else if (ended()) say(c.t(`The word was ${answer}. Try another puzzle from the library.`, `الكلمة هي «${answer}». جرّب لغزًا آخر من المكتبة.`));
  }
  function type(value) { if (ended()) return; const letter = normalizeWord(value, lang); if (/^[A-Z\u0621-\u064A]$/.test(letter) && current.length < 5) { current += letter; say(''); update(); } }
  function submit() { if (ended()) return; if (current.length !== 5) return say(c.t('Enter five letters first.', 'أدخل خمسة أحرف أولًا.')); if (!valid.has(current)) return say(c.t('Not in this practice dictionary. Open the word list below for accepted words.', 'ليست في قاموس التدريب. افتح قائمة الكلمات أدناه للاطلاع على الكلمات المقبولة.')); guesses.push(current); current = ''; say(''); update(); }
  function key(event) { if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA/.test(event.target.tagName)) return; if (event.key === 'Enter') { if (event.target.tagName === 'BUTTON' && !event.target.classList.contains('pw-key')) return; event.preventDefault(); submit(); } else if (event.key === 'Backspace') { event.preventDefault(); if (!ended()) { current = current.slice(0, -1); update(); } } else if (/^[a-zA-Z\u0621-\u064A]$/.test(event.key)) { event.preventDefault(); type(event.key); } }
  root.tabIndex = -1; root.addEventListener('keydown', key); update(); return () => root.removeEventListener('keydown', key);
}

function mountHive(root, c) {
  const lang = c.lang === 'ar' ? 'ar' : 'en', puzzle = HIVES[lang][hashSeed(c.seed) % HIVES[lang].length];
  const defaultState = { found: [], current: '', shuffled: 0 }; const saved = loadState(c, defaultState);
  let found = [], current = typeof saved.current === 'string' ? normalizeWord(saved.current, lang) : '', order = Number(saved.shuffled) || 0;
  if (Array.isArray(saved.found)) for (const w of saved.found) if (!validateHiveWord(w, puzzle, found, lang)) found.push(normalizeWord(w, lang));
  const { stage, say } = shell(root, c, c.t('A little hive of possibilities', 'خلية مليئة بالكلمات'), c.t('Build words of four or more letters using these seven letters. Always include the center letter. Letters can repeat. Four-letter words earn 1 point; longer words earn their length. Using every letter earns 7 extra points.', 'كوّن كلمات من ثلاثة أحرف على الأقل باستخدام حروف الخلية. يجب أن تحتوي كل كلمة على الحرف الأوسط، ويمكن تكرار الحروف. الكلمة الثلاثية بنقطة، والأطول بعدد أحرفها. استخدام كل الحروف يمنح ٧ نقاط إضافية.'));
  const progress = paragraph(stage, '', 'pw-progress'); const bar = el('progress', 'pw-progress-bar', null, { max: puzzle.words.length, value: found.length, 'aria-label': c.t('Words found', 'الكلمات المكتشفة') }); stage.append(bar);
  const form = el('form', 'pw-entry-form'); const input = el('input', 'pw-word-input', null, { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '28', 'aria-label': c.t('Your word', 'كلمتك'), placeholder: c.t('Build a word…', 'كوّن كلمة…') }); input.value = current; form.append(input); stage.append(form);
  const hive = el('div', 'pw-hive', null, { role: 'group', 'aria-label': c.t('Seven letters; center is required', 'سبعة أحرف؛ الحرف الأوسط مطلوب') }); stage.append(hive);
  const actions = el('div', 'pw-actions'); actions.append(button(c.t('Delete', 'حذف'), () => { input.value = input.value.slice(0, -1); cache(); }), button(c.t('Shuffle', 'خلط'), () => { order++; drawHive(); cache(); }), button(c.t('Enter', 'إرسال'), submit, 'pw-primary')); stage.append(actions);
  const foundBox = el('div', 'pw-found-words'); stage.append(foundBox); acceptedList(root, puzzle.words, c);
  function cache() { current = normalizeWord(input.value, lang); persist(c, { found, current, shuffled: order, completed: found.length === puzzle.words.length }); }
  input.addEventListener('input', cache); form.addEventListener('submit', event => { event.preventDefault(); submit(); });
  function drawHive() { hive.replaceChildren(); const around = shuffled(puzzle.letters.filter(l => l !== puzzle.center), `${c.seed}-${order}`); const positions = [ [50, 50], [50, 9], [85.5, 29.5], [85.5, 70.5], [50, 91], [14.5, 70.5], [14.5, 29.5] ]; [puzzle.center, ...around].forEach((l, i) => { const b = button(l, () => { input.value += l; cache(); }, `pw-hive-cell ${i === 0 ? 'pw-hive-center' : ''}`, { 'aria-label': `${l}${i === 0 ? c.t(', required letter', '، الحرف المطلوب') : ''}` }); b.style.left = `${positions[i][0]}%`; b.style.top = `${positions[i][1]}%`; hive.append(b); }); }
  function update() { const score = found.reduce((sum, w) => sum + hiveScore(w, puzzle, lang), 0); progress.textContent = c.t(`${score} points · ${found.length} of ${puzzle.words.length} words found`, `${score} نقطة · ${found.length} من ${puzzle.words.length} كلمة`); bar.value = found.length; foundBox.replaceChildren(); foundBox.append(el('h3', '', c.t('Your words', 'كلماتك'))); if (!found.length) paragraph(foundBox, c.t('Your discoveries will appear here.', 'ستظهر كلماتك هنا.')); else { const list = el('div', 'pw-chips'); [...found].reverse().forEach(w => list.append(el('span', 'pw-chip', `${w} · ${hiveScore(w, puzzle, lang)}`))); foundBox.append(list); } cache(); }
  function submit() {
    const word = normalizeWord(input.value, lang), error = validateHiveWord(word, puzzle, found, lang);
    const messages = { short: c.t('Use at least four letters.', 'استخدم ثلاثة أحرف على الأقل.'), center: c.t(`Include the center letter ${puzzle.center}.`, `أضف الحرف الأوسط «${puzzle.center}».`), letters: c.t('Use only letters from the hive.', 'استخدم حروف الخلية فقط.'), duplicate: c.t('You already found that word.', 'وجدت هذه الكلمة من قبل.'), dictionary: c.t('Not in this puzzle’s curated word list. You can inspect the practice dictionary below.', 'ليست في قائمة هذا اللغز. يمكنك الاطلاع على قاموس التدريب أدناه.') };
    if (error) return say(messages[error]); found.push(word); input.value = ''; update(); say(found.length === puzzle.words.length ? c.t('Complete! You found every word in this hive.', 'اكتملت الخلية! وجدت كل الكلمات.') : c.t(`Nice find! +${hiveScore(word, puzzle, lang)} points`, `كلمة موفقة! +${hiveScore(word, puzzle, lang)} نقاط`));
  }
  drawHive(); update(); if (found.length === puzzle.words.length) say(c.t('This hive is complete.', 'هذه الخلية مكتملة.')); return () => {};
}

function mountLinks(root, c) {
  const lang = c.lang === 'ar' ? 'ar' : 'en', small = ['mini', '3x3'].includes(c.variant), size = small ? 3 : 4;
  const source = LINK_SETS[lang][hashSeed(c.seed) % LINK_SETS[lang].length]; const groups = source.slice(0, size).map(g => ({ ...g, words: g.words.slice(0, size) }));
  const words = groups.flatMap(g => g.words), saved = loadState(c, { solved: [], mistakes: [], order: 0 });
  let solved = Array.isArray(saved.solved) ? [...new Set(saved.solved)].filter(i => Number.isInteger(i) && i >= 0 && i < size) : [];
  let mistakes = Array.isArray(saved.mistakes) ? saved.mistakes.filter(w => typeof w === 'string').slice(0, 4) : [], selected = [], order = Number(saved.order) || 0;
  const { stage, say } = shell(root, c, c.t('Find what belongs together', 'اكتشف الرابط المشترك'), c.t(`Find ${size} groups of ${size} words that share a connection. Select ${size}, then check the group. You have four mistakes. Solved groups stay together.`, `اكتشف ${size} مجموعات، في كل منها ${size} كلمات يجمعها رابط. حدد الكلمات ثم تحقّق من المجموعة. لديك أربع فرص للخطأ، وتبقى المجموعات الصحيحة مجمّعة.`));
  const progress = paragraph(stage, '', 'pw-progress'), foundBox = el('div', 'pw-link-solved'), board = el('div', 'pw-links-board', null, { role: 'group', 'aria-label': c.t('Word groups', 'مجموعات الكلمات') }); board.style.setProperty('--pw-columns', size); stage.append(foundBox, board);
  const actions = el('div', 'pw-actions'); const check = button(c.t('Check group', 'تحقّق'), submit, 'pw-primary'); const clear = button(c.t('Deselect', 'إلغاء التحديد'), () => { selected = []; draw(); }); const shuffle = button(c.t('Shuffle', 'خلط'), () => { order++; draw(); }); actions.append(shuffle, clear, check); stage.append(actions);
  function ended() { return mistakes.length >= 4 || solved.length === size; }
  function draw() {
    foundBox.replaceChildren(); const reveal = ended() && solved.length !== size;
    groups.forEach((g, i) => { if (solved.includes(i) || reveal) { const box = el('div', `pw-group pw-group-${i}`); box.append(el('strong', '', `${solved.includes(i) ? '✓ ' : ''}${g.title}`), el('span', '', g.words.join(' · '))); foundBox.append(box); } });
    board.replaceChildren(); if (!ended()) shuffled(words.filter(w => !solved.some(i => groups[i].words.includes(w))), `${c.seed}-${order}`).forEach(w => { const b = button(w, () => { if (selected.includes(w)) selected = selected.filter(x => x !== w); else if (selected.length < size) selected.push(w); else return say(c.t(`Select only ${size} words.`, `حدد ${size} كلمات فقط.`)); say(''); draw(); const next = [...board.children].find(n => n.textContent === w); next?.focus(); }, `pw-link ${selected.includes(w) ? 'pw-selected' : ''}`, { 'aria-pressed': String(selected.includes(w)) }); board.append(b); });
    progress.textContent = c.t(`${solved.length}/${size} groups · ${4 - mistakes.length} mistakes remaining`, `${solved.length}/${size} مجموعات · فرص الخطأ المتبقية: ${4 - mistakes.length}`); check.disabled = selected.length !== size || ended(); clear.disabled = !selected.length || ended(); shuffle.disabled = ended();
    persist(c, { solved, mistakes, order, completed: solved.length === size, finished: ended() });
    if (solved.length === size) say(c.t('All connected. You found every group!', 'اكتملت الروابط! وجدت كل المجموعات.')); else if (ended()) say(c.t('No attempts left. The groups are revealed above.', 'انتهت المحاولات. تظهر المجموعات الصحيحة أعلاه.'));
  }
  function submit() { if (selected.length !== size || ended()) return; const key = [...selected].sort().join('|'); if (mistakes.includes(key)) return say(c.t('You already tried that group; no mistake used.', 'جرّبت هذه المجموعة من قبل؛ لم تُخصم محاولة.')); const result = checkGroup(selected, groups); if (result.index >= 0) { solved.push(result.index); selected = []; draw(); if (!ended()) say(c.t('That’s a connection!', 'رابط صحيح!')); } else { mistakes.push(key); draw(); if (!ended()) say(result.oneAway ? c.t('One word away. Look at the group again.', 'كلمة واحدة تفصلك عن المجموعة الصحيحة.') : c.t('Not a group yet. Try another connection.', 'ليست مجموعة صحيحة. ابحث عن رابط آخر.')); } }
  draw(); return () => {};
}

function mountTrails(root, c) {
  const lang = c.lang === 'ar' ? 'ar' : 'en', source = TRAIL_SETS[lang][hashSeed(c.seed) % TRAIL_SETS[lang].length], puzzle = buildTrail(source, c.seed, lang);
  const saved = loadState(c, { found: [], extra: [], hintsUsed: 0, hint: null });
  let found = Array.isArray(saved.found) ? [...new Set(saved.found)].filter(w => puzzle.answers.some(a => a.word === w)) : [];
  let extra = Array.isArray(saved.extra) ? [...new Set(saved.extra)].filter(w => puzzle.extras.includes(w) && !puzzle.answers.some(a => a.word === w)) : [];
  let hintsUsed = Math.max(0, Math.min(Number(saved.hintsUsed) || 0, Math.floor(extra.length / 3))), hint = puzzle.answers.some(a => a.word === saved.hint) ? saved.hint : null, path = [], pointer = null, dragging = false;
  const { stage, say } = shell(root, c, c.t('Follow the hidden words', 'اتبع خيوط الكلمات'), c.t('Find the words belonging to the theme. Tap adjacent letters, including diagonals, then submit; or drag through a word. Do not reuse a letter. Every square belongs to one answer. The theme phrase joins opposite edges. Three other dictionary words earn one hint.', 'اكتشف كلمات الموضوع. اضغط حروفًا متجاورة، حتى قطريًا، ثم أرسل الكلمة، أو اسحب بين الحروف. لا تكرر الخانة. كل خانة جزء من إجابة واحدة. عبارة الموضوع تصل بين حافتين متقابلتين. كل ثلاث كلمات إضافية في القاموس تمنحك تلميحًا.'));
  paragraph(stage, c.t(`Today’s theme: ${puzzle.theme}`, `موضوع اللغز: ${puzzle.theme}`), 'pw-theme');
  const progress = paragraph(stage, '', 'pw-progress'), selection = paragraph(stage, '', 'pw-trail-selection'), board = el('div', 'pw-trail-board', null, { role: 'group', 'aria-label': c.t('Six by eight letter grid', 'شبكة حروف من ستة أعمدة وثمانية صفوف') }); board.dir = 'ltr'; stage.append(board);
  const actions = el('div', 'pw-actions'); const submitButton = button(c.t('Submit word', 'إرسال الكلمة'), submit, 'pw-primary'), clear = button(c.t('Clear', 'مسح'), () => { path = []; draw(); }), hintButton = button('', showHint); actions.append(clear, hintButton, submitButton); stage.append(actions); const foundBox = el('div', 'pw-chips'); stage.append(foundBox);
  acceptedList(root, source.extras, c);
  function usedCells() { return puzzle.answers.filter(a => found.includes(a.word)).flatMap(a => a.cells); }
  function cache() { persist(c, { found, extra, hintsUsed, hint, completed: found.length === puzzle.answers.length }); }
  function draw() {
    const active = document.activeElement?.dataset?.cell; board.replaceChildren(); const used = usedCells(), hinted = puzzle.answers.find(a => a.word === hint);
    puzzle.letters.forEach((letter, i) => { const answer = puzzle.answers.find(a => found.includes(a.word) && a.cells.includes(i)); const selected = path.includes(i); const b = button(letter, event => { if (event.detail === 0) choose(i); }, `pw-trail-cell ${answer ? (answer.span ? 'pw-spanning' : 'pw-discovered') : ''} ${selected ? 'pw-selected' : ''} ${hinted?.cells.includes(i) && !answer ? 'pw-hinted' : ''}`, { 'data-cell': i, 'aria-label': `${letter}, ${c.t('row', 'صف')} ${Math.floor(i / 6) + 1}, ${c.t('column', 'عمود')} ${i % 6 + 1}${answer ? c.t(', found', '، مكتشف') : ''}`, 'aria-pressed': String(selected), 'aria-disabled': String(used.includes(i)) }); board.append(b); });
    if (active !== undefined && active !== null && root.contains(document.activeElement) === false) board.querySelector(`[data-cell="${active}"]`)?.focus({ preventScroll: true });
    selection.textContent = path.map(i => puzzle.letters[i]).join('') || c.t('Select a path…', 'حدد مسارًا…'); selection.dir = lang === 'ar' ? 'rtl' : 'ltr';
    progress.textContent = c.t(`${found.length}/${puzzle.answers.length} theme words · ${extra.length % 3}/3 toward the next hint`, `${found.length}/${puzzle.answers.length} كلمات · ${extra.length % 3}/3 نحو التلميح التالي`);
    const available = Math.floor(extra.length / 3) - hintsUsed; hintButton.textContent = c.t(`Hint (${available})`, `تلميح (${available})`); hintButton.disabled = available <= 0 || found.length === puzzle.answers.length; submitButton.disabled = path.length < 2; clear.disabled = !path.length;
    foundBox.replaceChildren(); found.forEach(w => foundBox.append(el('span', 'pw-chip', `${w === normalizeWord(source.span, lang) ? '✦ ' : ''}${w}`))); cache();
    if (found.length === puzzle.answers.length) say(c.t('Every letter connected. A lovely solve!', 'اكتملت كل الخيوط. أحسنت!'));
  }
  function choose(i) {
    if (usedCells().includes(i)) return;
    if (path[path.length - 1] === i) return;
    const index = path.indexOf(i); if (index >= 0) path = path.slice(0, index + 1);
    else if (!path.length || validateTrailPath([...path, i], puzzle, usedCells())) path.push(i);
    else { say(c.t('Choose a neighboring letter, or clear to start a new word.', 'اختر حرفًا مجاورًا، أو امسح المسار لبدء كلمة جديدة.')); return; } draw();
  }
  function submit() {
    if (!validateTrailPath(path, puzzle, usedCells())) return; const word = path.map(i => puzzle.letters[i]).join('');
    const answer = puzzle.answers.find(a => a.word === word && a.cells.length === path.length && a.cells.every(i => path.includes(i)));
    if (answer && !found.includes(word)) { found.push(word); if (hint === word) hint = null; path = []; draw(); if (found.length !== puzzle.answers.length) say(answer.span ? c.t('You found the spanning theme phrase!', 'وجدت عبارة الموضوع الممتدة!') : c.t('A theme word found!', 'وجدت كلمة من الموضوع!')); }
    else if (puzzle.extras.includes(word) && !puzzle.answers.some(a => a.word === word)) { if (extra.includes(word)) say(c.t('That bonus word has already counted.', 'احتُسبت هذه الكلمة الإضافية من قبل.')); else { extra.push(word); say(extra.length % 3 === 0 ? c.t('A hint is ready!', 'أصبح التلميح جاهزًا!') : c.t('Bonus word! You are closer to a hint.', 'كلمة إضافية! اقتربت من التلميح.')); } path = []; draw(); }
    else { path = []; draw(); say(c.t('Not a theme word or an accepted bonus word. Try another path.', 'ليست كلمة من الموضوع أو كلمة إضافية مقبولة. جرّب مسارًا آخر.')); }
  }
  function showHint() { if (Math.floor(extra.length / 3) <= hintsUsed) return; const next = puzzle.answers.find(a => !found.includes(a.word) && !a.span) || puzzle.answers.find(a => !found.includes(a.word)); if (!next) return; hint = next.word; hintsUsed++; draw(); say(c.t('The outlined letters make one theme word. Trace them in order.', 'الحروف المحددة تكوّن كلمة من الموضوع. اتبع ترتيبها.')); }
  function down(event) { const cell = event.target.closest('[data-cell]'); if (!cell || !board.contains(cell) || event.button > 0) return; event.preventDefault(); pointer = event.pointerId; dragging = false; choose(Number(cell.dataset.cell)); }
  function move(event) { if (pointer !== event.pointerId) return; const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]'); if (cell && board.contains(cell) && Number(cell.dataset.cell) !== path[path.length - 1]) { dragging = true; choose(Number(cell.dataset.cell)); } }
  function up(event) { if (pointer !== event.pointerId) return; pointer = null; if (dragging && path.length >= 2) submit(); dragging = false; }
  function cancel() { pointer = null; dragging = false; }
  function key(event) { const cell = event.target.closest('[data-cell]'); if (!cell) return; const index = Number(cell.dataset.cell), change = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 }[event.key]; if (change) { event.preventDefault(); const next = index + change; if (next >= 0 && next < 48 && (Math.abs(change) !== 1 || Math.floor(next / 6) === Math.floor(index / 6))) board.children[next]?.focus(); } else if (event.key === 'Backspace') { event.preventDefault(); path.pop(); draw(); } else if (event.key === 'Escape') { path = []; draw(); } }
  board.addEventListener('pointerdown', down); board.addEventListener('keydown', key); document.addEventListener('pointermove', move, { passive: true }); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', cancel); draw();
  return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel); };
}

function mountSquare(root, c) {
  const lang = c.lang === 'ar' ? 'ar' : 'en', puzzle = LETTER_SQUARES[lang][hashSeed(c.seed) % LETTER_SQUARES[lang].length], saved = loadState(c, { chain: [], current: '' });
  let chain = [], current = typeof saved.current === 'string' ? normalizeWord(saved.current, lang) : '';
  if (Array.isArray(saved.chain)) for (const w of saved.chain) { if (validateSquareWord(w, puzzle, chain.at(-1), lang)) break; chain.push(normalizeWord(w, lang)); }
  const { stage, say } = shell(root, c, c.t('A journey around twelve letters', 'رحلة بين اثني عشر حرفًا'), c.t('Use every letter in as few words as possible. Words need at least three letters. Consecutive letters must come from different sides. Each new word starts with the last letter of your previous word. Letters may be reused.', 'استخدم كل الحروف بأقل عدد من الكلمات. كل كلمة من ثلاثة أحرف على الأقل، ولا يجوز أن يأتي حرفان متتاليان من الجانب نفسه. تبدأ كل كلمة بآخر حرف من الكلمة السابقة، ويمكن إعادة استخدام الحروف.'));
  const progress = paragraph(stage, '', 'pw-progress'); const square = el('div', 'pw-square', null, { role: 'group', 'aria-label': c.t('Letters on four sides', 'حروف على أربعة جوانب') }); square.dir = 'ltr'; const middle = el('div', 'pw-square-middle'); square.append(middle); stage.append(square);
  const sideNames = [c.t('top', 'أعلى'), c.t('right', 'يمين'), c.t('bottom', 'أسفل'), c.t('left', 'يسار')]; const tiles = [];
  puzzle.sides.forEach((side, s) => side.forEach((letter, i) => { const b = button(letter, () => { if (complete()) return; current += letter; input.value = current; update(); }, `pw-square-letter pw-side-${s}`, { 'aria-label': `${letter}, ${sideNames[s]}` }); b.style.setProperty('--pw-offset', `${25 + i * 25}%`); square.append(b); tiles.push([letter, b]); }));
  const form = el('form', 'pw-entry-form'); const input = el('input', 'pw-word-input', null, { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '28', 'aria-label': c.t('Your next word', 'كلمتك التالية'), placeholder: c.t('Connect the letters…', 'صل الحروف…') }); input.value = current; form.append(input); stage.append(form);
  const actions = el('div', 'pw-actions'); const submitButton = button(c.t('Add word', 'أضف الكلمة'), submit, 'pw-primary'); actions.append(button(c.t('Delete', 'حذف'), () => { current = current.slice(0, -1); input.value = current; update(); }), button(c.t('Undo word', 'تراجع عن كلمة'), () => { if (!chain.length) return; current = chain.pop(); input.value = current; say(''); update(); }), submitButton); stage.append(actions);
  const chainBox = el('ol', 'pw-chain'); stage.append(chainBox);
  const solution = el('details', 'pw-help'); solution.append(el('summary', '', c.t('See an authored solution', 'عرض حل مُعدّ مسبقًا'))); paragraph(solution, puzzle.solution.join(' ← ')); root.append(solution);
  acceptedList(root, puzzle.words.filter(w => !validateSquareWord(w, puzzle, '', lang)), c);
  function used() { return new Set(chain.join('')); }
  function complete() { const seen = used(); return puzzle.sides.flat().every(l => seen.has(normalizeWord(l, lang))); }
  function update() { const count = used().size; progress.textContent = c.t(`${count}/12 letters used · ${chain.length} words · Try for ${puzzle.solution.length}`, `${count}/12 حرفًا · ${chain.length} كلمات · الهدف ${puzzle.solution.length}`); middle.textContent = `${count}/12`; tiles.forEach(([l, b]) => { b.classList.toggle('pw-used', used().has(normalizeWord(l, lang))); b.disabled = complete(); }); chainBox.replaceChildren(); chain.forEach(w => chainBox.append(el('li', '', w))); input.disabled = complete(); submitButton.disabled = complete(); persist(c, { chain, current, completed: complete() }); if (complete()) say(c.t(`All twelve! You connected the square in ${chain.length} words.`, `اكتملت الحروف! وصلت المربع في ${chain.length} كلمات.`)); else if (chain.length && !current) say(c.t(`Your next word starts with ${chain.at(-1).slice(-1)}.`, `تبدأ الكلمة التالية بحرف «${chain.at(-1).slice(-1)}».`)); }
  input.addEventListener('input', () => { current = normalizeWord(input.value, lang); update(); }); form.addEventListener('submit', event => { event.preventDefault(); submit(); });
  function submit() { if (complete()) return; const word = normalizeWord(input.value, lang), error = validateSquareWord(word, puzzle, chain.at(-1), lang); const messages = { short: c.t('Use at least three letters.', 'استخدم ثلاثة أحرف على الأقل.'), chain: c.t(`Start with ${chain.at(-1)?.slice(-1)}.`, `ابدأ بحرف «${chain.at(-1)?.slice(-1)}».`), letters: c.t('Use only letters around the square.', 'استخدم الحروف حول المربع فقط.'), side: c.t('Two consecutive letters are on the same side.', 'حرفان متتاليان من الجانب نفسه.'), dictionary: c.t('Not in this puzzle’s practice dictionary.', 'ليست في قاموس هذا اللغز.') }; if (error) return say(messages[error]); chain.push(word); current = ''; input.value = ''; say(''); update(); }
  update(); return () => {};
}

export function mount(root, context) {
  const previousDir = root.getAttribute('dir'), previousTabIndex = root.getAttribute('tabindex');
  const lang = context.lang === 'ar' ? 'ar' : 'en', c = { ...context, lang, t: context.t || ((en, ar) => lang === 'ar' ? ar : en) };
  const mounts = { word: mountWord, hive: mountHive, links: mountLinks, trails: mountTrails, 'letter-square': mountSquare };
  if (!mounts[c.game]) throw new Error(`Unknown word puzzle: ${c.game}`);
  const cleanup = mounts[c.game](root, c); return () => { cleanup?.(); root.classList.remove('pw-root'); if (previousDir === null) root.removeAttribute('dir'); else root.setAttribute('dir', previousDir); if (previousTabIndex === null) root.removeAttribute('tabindex'); else root.setAttribute('tabindex', previousTabIndex); };
}
