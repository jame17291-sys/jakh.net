const SIZE = 9;
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const normalize = value => String(value).normalize('NFKC').toLowerCase().trim().replace(/[\u064b-\u065f\u0670\u0640]/gu, '').replace(/[أإآٱ]/gu, 'ا').replace(/ى/gu, 'ي');
const premium = index => [0, 8, 40, 72, 80].includes(index) ? '2W' : [12, 14, 28, 34, 46, 52, 66, 68].includes(index) ? '2L' : '';
const value = (letter, lang) => lang === 'ar' ? ('اظضغثذؤئء'.includes(letter) ? 3 : 'جحخقشطزص'.includes(letter) ? 2 : 1) : /[qz]/i.test(letter) ? 8 : /[jkx]/i.test(letter) ? 5 : /[bcfhvwy]/i.test(letter) ? 3 : /[dgmp]/i.test(letter) ? 2 : 1;
const errors = {
  NAME_REQUIRED: ['Enter a visible player name.', 'أدخل اسم لاعب بحروف ظاهرة.'],
  INVALID_ROOM: ['Enter a player name and choose a room language.', 'أدخل اسم اللاعب واختر لغة الغرفة.'],
  INVALID_SWAP: ['Choose at least one tile to exchange.', 'اختر حرفاً واحداً على الأقل للتبديل.'],
  ROOM_CREATE_FAILED: ['Could not create the room. Please try again.', 'تعذّر إنشاء الغرفة. حاول مجدداً.'],
  ROOM_NOT_FOUND: ['Room not found. Check the eight-character code.', 'لم نجد الغرفة. تحقق من الرمز المكوّن من ثمانية أحرف.'],
  ROOM_EXPIRED: ['This room expired. Start a new match.', 'انتهت صلاحية الغرفة. ابدأ مباراة جديدة.'],
  ROOM_FULL: ['This room already has two players. Resume on the device you joined from.', 'تضم الغرفة لاعبين بالفعل. عُد إليها من الجهاز الذي انضممت منه.'],
  UNAUTHORIZED: ['This device cannot resume that seat. Use your original device or join a new room.', 'لا يمكن لهذا الجهاز استعادة مقعدك. استخدم جهازك الأصلي أو انضم إلى غرفة جديدة.'],
  RATE_LIMITED: ['Please wait a minute before trying again.', 'انتظر دقيقة قبل المحاولة مجدداً.'],
  DUEL_UNAVAILABLE: ['Online Word Duel is temporarily unavailable. Please try again later.', 'مبارزة الكلمات عبر الإنترنت غير متاحة مؤقتاً. حاول لاحقاً.'],
  STALE_REVISION: ['The board changed. Review the latest turn and try again.', 'تغيّرت اللوحة. راجع آخر دور وحاول مجدداً.'],
  NOT_YOUR_TURN: ['Wait for your turn.', 'انتظر دورك.'],
  CENTER_REQUIRED: ['Your opening word must cross the center star.', 'يجب أن تمر كلمة البداية بنجمة الوسط.'],
  NOT_CONNECTED: ['Connect your word to a letter already on the board.', 'صِل كلمتك بحرف موجود على اللوحة.'],
  NOT_STRAIGHT: ['Place your tiles in one row or column.', 'ضع حروفك في صف واحد أو عمود واحد.'],
  GAP: ['Fill every square between your new tiles.', 'املأ الفراغات بين حروفك الجديدة.'],
  WORD_TOO_SHORT: ['Make a word of at least two letters.', 'كوّن كلمة من حرفين على الأقل.'],
  WORD_NOT_LISTED: ['Every word you form must be in the curated vocabulary below.', 'يجب أن تكون كل كلمة تكوّنها ضمن قائمة الكلمات المختارة أدناه.'],
  BAG_TOO_SMALL: ['Exchange needs at least seven tiles left in the bag.', 'يتطلب التبديل بقاء سبعة أحرف على الأقل في الكيس.'],
  INVALID_TILES: ['Choose letters from your rack and place them on the board.', 'اختر أحرفاً من رصيدك وضعها على اللوحة.'],
  OCCUPIED_CELL: ['That square is already occupied.', 'هذه الخانة مشغولة.'],
  MISSING_TILE: ['Your rack changed. Place your tiles again.', 'تغيّر رصيد أحرفك. أعد وضع الحروف.'],
  NOT_PLAYING: ['The match has not started or has finished.', 'لم تبدأ المباراة بعد أو انتهت.'],
};

export function mount(root, context) {
  const t = context.t;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const origin = local ? `${location.protocol}//${location.hostname}:8787` : 'https://api.riddlearabia.com';
  const saved = context.load({ session: null });
  let session = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved.session : null;
  if (!session || typeof session !== 'object' || typeof session.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session.token) || (session.code !== null && (typeof session.code !== 'string' || !/^[A-HJ-NP-Z2-9]{8}$/.test(session.code)))) session = null;
  let state = null, stopped = false, busy = false, polling = false, timer = null;
  let selected = null, staged = [], swapping = false, swapTiles = new Set(), menu = !session?.code;
  let message = '', messageError = false, vocabulary = [], vocabularyLang = '', dictionaryOpen = false;
  let vocabRequest = null, connectionLost = false, resignConfirm = false, requestController = null;
  const invite = (new URL(location.href).searchParams.get('duelRoom') || '').trim().toUpperCase();
  let formName = session?.name || '', formCode = invite, formLang = context.lang;
  if (invite && session?.code !== invite) menu = true;

  function persist() { context.save({ session }); }
  function notify(text, isError = false) {
    message = text; messageError = isError;
    const node = root.querySelector('.pd-duel-notice');
    if (node) { node.textContent = text; node.classList.toggle('pd-duel-notice-error', isError); }
  }
  async function api(path, body, signal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${origin}/api/word-duel/${path}`, {
        method: body ? 'POST' : 'GET', credentials: 'omit', signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
      if (!response.ok) { const error = new Error(data.error || `Request failed (${response.status})`); error.code = data.code; error.status = response.status; throw error; }
      return data;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); }
  }
  function errorText(error) {
    if (errors[error.code]) {
      const translated = t(...errors[error.code]);
      const rejected = error.code === 'WORD_NOT_LISTED' ? /“([^”]{1,30})”/u.exec(error.message)?.[1] : '';
      return rejected ? `${translated} (${rejected})` : translated;
    }
    return t('Could not reach the room. Check your connection and retry; your saved seat is safe on this device.', 'تعذّر الاتصال بالغرفة. تحقق من الإنترنت وحاول مجدداً؛ مقعدك محفوظ على هذا الجهاز.');
  }
  function token() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function gameLanguage() { return state?.lang || session?.lang || context.lang; }
  function noticeHTML() { return `<p class="pd-duel-notice${messageError ? ' pd-duel-notice-error' : ''}" role="status" aria-live="polite">${e(message)}</p>`; }
  function renderMenu() {
    root.innerHTML = `<section class="pd-duel"><div class="pd-duel-intro"><span class="pd-duel-eyebrow">${t('TWO PLAYERS · ONLINE', 'لاعبان · عبر الإنترنت')}</span><h2>${t('A word from you. A move from them.', 'كلمة منك. وخطوة من صديقك.')}</h2><p>${t('Invite a friend, build connected words, and make every letter count. Play together on separate devices.', 'ادعُ صديقاً، وابنيا كلمات متصلة واجمعا النقاط. العب من جهازك وصديقك من جهازه.')}</p></div><form class="pd-duel-lobby" id="pd-duel-form"><label>${t('Your name', 'اسمك')}<input id="pd-duel-name" name="name" maxlength="20" autocomplete="nickname" required value="${e(formName)}" placeholder="${t('How should we call you?', 'بأي اسم نناديك؟')}"></label><label>${t('New room language', 'لغة الغرفة الجديدة')}<select id="pd-duel-language"><option value="en" ${formLang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${formLang === 'ar' ? 'selected' : ''}>العربية</option></select></label><button type="submit" class="pd-duel-primary" ${busy ? 'disabled' : ''}>${busy ? t('Connecting…', 'جارٍ الاتصال…') : t('Create a room', 'أنشئ غرفة')}</button><div class="pd-duel-or">${t('or join a friend', 'أو انضم إلى صديق')}</div><label>${t('Eight-character room code', 'رمز الغرفة: ثمانية أحرف')}<input id="pd-duel-code" name="code" dir="ltr" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${e(formCode)}" placeholder="ABCD2345"></label><button type="button" id="pd-duel-join" ${busy ? 'disabled' : ''}>${t('Join room', 'انضم إلى الغرفة')}</button>${session?.code ? `<button type="button" id="pd-duel-resume" class="pd-duel-link">${t('Resume your saved room', 'عُد إلى غرفتك المحفوظة')} · ${e(session.code)}</button>` : ''}</form>${noticeHTML()}<p class="pd-duel-small">${t('No account needed. Your private seat is saved on this browser. Rooms wait for a guest for 30 minutes and expire after 24 hours without a move.', 'لا تحتاج إلى حساب. يُحفظ مقعدك الخاص في هذا المتصفح. تنتظر الغرفة صديقك ٣٠ دقيقة، وتنتهي بعد ٢٤ ساعة دون أي حركة.')}</p></section>`;
    root.querySelector('#pd-duel-form').addEventListener('submit', event => { event.preventDefault(); enterRoom(false); });
    root.querySelector('#pd-duel-join').addEventListener('click', () => enterRoom(true));
    root.querySelector('#pd-duel-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''); });
    root.querySelector('#pd-duel-resume')?.addEventListener('click', () => { menu = false; refresh(true); });
  }
  async function enterRoom(joining) {
    if (busy || stopped) return;
    const input = root.querySelector('#pd-duel-name');
    const name = input.value.trim();
    if (!name) { input.reportValidity(); return; }
    const lang = root.querySelector('#pd-duel-language').value;
    const code = root.querySelector('#pd-duel-code').value.trim().toUpperCase();
    if (joining && !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) { notify(t('Enter the full eight-character room code.', 'أدخل رمز الغرفة كاملاً: ثمانية أحرف.'), true); root.querySelector('#pd-duel-code').focus(); return; }
    busy = true;
    for (const button of root.querySelectorAll('button')) button.disabled = true;
    const oldSession = session;
    formName = name; formCode = code; formLang = lang;
    const canResume = joining ? session?.code === code : session && !session.code && session.name === name && session.lang === lang;
    session = canResume ? session : { token: token(), name, lang, code: joining ? code : null };
    persist();
    notify(t('Connecting to your room…', 'جارٍ الاتصال بغرفتك…'));
    try {
      const data = await api(joining ? `${code}/join` : 'create', { token: session.token, name, lang });
      if (stopped) return;
      session = { ...session, code: data.code, lang: data.lang, name };
      persist(); state = data; menu = false; message = ''; messageError = false; connectionLost = false;
      staged = []; selected = null; swapping = false; swapTiles.clear(); resignConfirm = false;
      loadVocabulary();
    } catch (error) {
      if (error.status) { session = oldSession; persist(); }
      message = errorText(error); messageError = true;
    } finally { busy = false; if (!stopped) { render(); schedule(); } }
  }
  function inviteURL() { const url = new URL(location.href); url.searchParams.set('duelRoom', state.code); return url.href; }
  function controlsDisabled() { return busy || connectionLost || state.phase !== 'playing' || state.turnId !== state.you; }
  function render() {
    if (stopped) return;
    if (menu) { renderMenu(); return; }
    if (!state) {
      root.innerHTML = `<section class="pd-duel"><p>${t('Resuming your room…', 'جارٍ استعادة غرفتك…')}</p>${noticeHTML()}<button type="button" id="pd-duel-retry">${t('Retry', 'حاول مجدداً')}</button><button type="button" id="pd-duel-menu">${t('Room menu', 'قائمة الغرف')}</button></section>`;
      root.querySelector('#pd-duel-retry').addEventListener('click', () => refresh(true));
      root.querySelector('#pd-duel-menu').addEventListener('click', () => { menu = true; render(); });
      return;
    }
    const focus = document.activeElement?.closest('[data-cell], [data-rack]');
    const focusType = focus?.hasAttribute('data-cell') ? 'cell' : 'rack';
    const focusIndex = focus?.getAttribute(`data-${focusType}`);
    const yourTurn = state.phase === 'playing' && state.turnId === state.you;
    const disabled = controlsDisabled();
    const finished = state.phase === 'finished';
    const playerName = id => state.players.find(player => player.id === id)?.name || '';
    const ending = state.reason === 'resigned' ? t('A player resigned.', 'انسحب أحد اللاعبين.') : state.reason === 'scoreless' ? t('Six turns without a score. Remaining letters have been deducted.', 'ستة أدوار دون نقاط. خُصمت قيمة الأحرف المتبقية.') : state.reason === 'turn-limit' ? t('The 80-turn limit was reached. Remaining letters have been deducted.', 'اكتملت ٨٠ حركة. خُصمت قيمة الأحرف المتبقية.') : t('The bag is empty and a player used every tile. Final rack adjustments are included.', 'فرغ الكيس واستخدم لاعب جميع أحرفه. حُسبت تسوية نقاط الأحرف المتبقية.');
    const status = finished ? state.winnerId ? `${playerName(state.winnerId)} ${t('wins!', 'فاز!')}` : t('A draw. Well played!', 'تعادل. أحسنتما!') : state.phase === 'waiting' ? t('Waiting for your friend', 'بانتظار صديقك') : yourTurn ? t('Your turn', 'دورك الآن') : `${t('Waiting for', 'بانتظار')} ${playerName(state.turnId)}`;
    const board = state.board.map((letter, index) => {
      const draft = staged.find(tile => tile.cell === index);
      const shown = letter || (draft ? state.rack[draft.rack] : '');
      const bonus = premium(index);
      const row = Math.floor(index / SIZE), col = index % SIZE;
      const label = `${t('Row', 'صف')} ${row + 1}, ${t('column', 'عمود')} ${col + 1}: ${shown || (index === 40 ? t('center star', 'نجمة الوسط') : bonus || t('empty', 'فارغة'))}${draft ? `, ${t('new tile, select to remove', 'حرف جديد، اضغط لإزالته')}` : ''}`;
      return `<button type="button" class="pd-duel-cell ${shown ? 'pd-duel-filled' : ''} ${draft ? 'pd-duel-draft' : ''} ${!shown && bonus ? 'pd-duel-bonus' : ''} ${state.lastMove?.cells.includes(index) ? 'pd-duel-last' : ''}" data-cell="${index}" aria-label="${e(label)}" ${disabled || (letter && !draft) || swapping ? 'disabled' : ''}>${shown ? `<span>${e(shown.toLocaleUpperCase())}</span><small>${value(shown, state.lang)}</small>` : `<span class="pd-duel-square-label">${index === 40 ? '✦' : bonus === '2W' ? t('2W', '٢ك') : bonus === '2L' ? t('2L', '٢ح') : ''}</span>`}</button>`;
    }).join('');
    const rack = state.rack.map((letter, index) => `<button type="button" data-rack="${index}" class="pd-duel-tile ${selected === index || swapTiles.has(index) ? 'pd-duel-selected' : ''}" aria-pressed="${selected === index || swapTiles.has(index)}" aria-label="${e(letter)}, ${value(letter, state.lang)} ${t('points', 'نقاط')}" ${disabled || staged.some(tile => tile.rack === index) ? 'disabled' : ''}><span>${e(letter.toLocaleUpperCase())}</span><small>${value(letter, state.lang)}</small></button>`).join('');
    const last = state.lastMove;
    const lastText = last ? last.kind === 'place' ? `${playerName(last.playerId)}: ${last.words.join(' · ')} (+${last.score})` : `${playerName(last.playerId)}: ${last.kind === 'swap' ? t('exchanged tiles', 'بدّل أحرفاً') : last.kind === 'resign' ? t('resigned', 'انسحب') : t('passed', 'مرّر الدور')}` : t('Your first word starts on the star.', 'ابدأ أول كلمة من النجمة.');
    root.innerHTML = `<section class="pd-duel"><div class="pd-duel-roomhead"><div><span class="pd-duel-eyebrow">${t('ROOM', 'الغرفة')} <b dir="ltr">${e(state.code)}</b> · ${state.lang === 'ar' ? 'العربية' : 'English'}</span><h2>${e(status)}</h2></div><span class="pd-duel-connection ${connectionLost ? 'pd-duel-offline' : ''}">${connectionLost ? t('Reconnecting…', 'إعادة الاتصال…') : t('Online', 'متصل')}</span></div><div class="pd-duel-scoreboard">${state.players.map(player => `<div class="pd-duel-player ${state.turnId === player.id && !finished ? 'pd-duel-current' : ''}"><span>${e(player.name)}${player.id === state.you ? ` <small>(${t('you', 'أنت')})</small>` : ''}</span><strong>${player.score}</strong><small>${player.tiles} ${t('tiles', 'أحرف')}</small></div>`).join('')}${state.players.length < 2 ? `<div class="pd-duel-player pd-duel-empty"><span>${t('Your friend’s seat', 'مقعد صديقك')}</span><strong>—</strong></div>` : ''}</div>${state.phase === 'waiting' ? `<div class="pd-duel-invite"><p>${t('Send your friend this link or room code. The match starts when they join.', 'أرسل لصديقك الرابط أو رمز الغرفة. تبدأ المباراة عندما ينضم.')}</p><div><input aria-label="${t('Invitation link', 'رابط الدعوة')}" id="pd-duel-invite-link" readonly dir="ltr" value="${e(inviteURL())}"><button type="button" id="pd-duel-copy">${t('Copy invite', 'انسخ الدعوة')}</button></div></div>` : ''}${finished ? `<div class="pd-duel-result"><p>${e(ending)}</p><button type="button" id="pd-duel-new" class="pd-duel-primary">${t('Play another match', 'العب مباراة أخرى')}</button></div>` : ''}${noticeHTML()}<div class="pd-duel-play"><div><div class="pd-duel-board" dir="${state.lang === 'ar' ? 'rtl' : 'ltr'}" role="group" aria-label="${t('Word board, nine rows and nine columns', 'لوحة الكلمات: تسعة صفوف وتسعة أعمدة')}">${board}</div><div class="pd-duel-boardkey"><span>✦ / ${t('2W · double word', '٢ك · ضعف نقاط الكلمة')}</span><span>${t('2L · double letter', '٢ح · ضعف نقاط الحرف')}</span></div></div><div class="pd-duel-sidebar"><div class="pd-duel-rackhead"><h3>${t('Your letters', 'أحرفك')}</h3><span>${state.remaining} ${t('in bag', 'في الكيس')}</span></div><div class="pd-duel-rack" dir="${state.lang === 'ar' ? 'rtl' : 'ltr'}">${rack}</div><p class="pd-duel-hint">${swapping ? t('Select the letters you want to exchange. This uses your turn.', 'اختر الأحرف التي تريد تبديلها. يستهلك التبديل دورك.') : selected !== null ? t('Now choose an empty square. Tap a new tile to take it back.', 'اختر الآن خانة فارغة. اضغط على الحرف الجديد لاسترجاعه.') : yourTurn ? t('Choose a letter, then a square. Build words across or down.', 'اختر حرفاً ثم خانة. كوّن كلمات أفقياً أو عمودياً.') : t('Your letters stay private. Plan your next word while you wait.', 'أحرفك خاصة بك. خطط لكلمتك التالية وأنت تنتظر.')}</p><div class="pd-duel-actions">${swapping ? `<button type="button" class="pd-duel-primary" id="pd-duel-swap-submit" ${disabled || !swapTiles.size ? 'disabled' : ''}>${t('Exchange selected', 'بدّل الأحرف المختارة')}</button><button type="button" id="pd-duel-swap-cancel">${t('Cancel', 'إلغاء')}</button>` : `<button type="button" class="pd-duel-primary" id="pd-duel-submit" ${disabled || !staged.length ? 'disabled' : ''}>${busy ? t('Sending…', 'جارٍ الإرسال…') : t('Play word', 'العب الكلمة')}</button><button type="button" id="pd-duel-clear" ${!staged.length || busy ? 'disabled' : ''}>${t('Recall tiles', 'استرجع الأحرف')}</button><button type="button" id="pd-duel-pass" ${disabled ? 'disabled' : ''}>${t('Pass', 'مرّر الدور')}</button><button type="button" id="pd-duel-swap" ${disabled || state.remaining < 7 ? 'disabled' : ''}>${t('Exchange', 'بدّل')}</button>`}</div><p class="pd-duel-lastmove" aria-live="polite">${e(lastText)}</p><p class="pd-duel-small">${state.scoreless}/6 ${t('consecutive turns without a score', 'أدوار متتالية دون نقاط')} · ${t('Move', 'الحركة')} ${state.turns}/80</p><details class="pd-duel-rules"><summary>${t('How to play', 'طريقة اللعب')}</summary><p>${t('Make words using your rack. The opening word crosses the star; later moves connect to the board. Place new tiles in one row or column with no gaps. Every crossing word must also appear in the vocabulary.', 'كوّن كلمات بأحرفك. تمر كلمة البداية بالنجمة، ثم تتصل كل حركة باللوحة. ضع الحروف الجديدة في صف أو عمود واحد دون فراغات. يجب أن تكون الكلمات المتقاطعة ضمن القائمة أيضاً.')}</p><p>${t('Bonus squares count only for newly placed tiles. Play all seven letters for 15 extra points. Arabic words read right to left across, and top to bottom down. Alef variants and yaa/alef maqsura are normalized; taa marbuta remains distinct.', 'تُحسب مكافآت الخانات للأحرف الجديدة فقط. استخدام الأحرف السبعة يمنح ١٥ نقطة إضافية. تُقرأ الكلمات العربية من اليمين لليسار أفقياً ومن الأعلى للأسفل عمودياً. تُوحّد أشكال الألف والياء والألف المقصورة، وتبقى التاء المربوطة حرفاً مستقلاً.')}</p><p>${t('Six scoreless turns, 80 moves, or an empty rack with an empty bag ends the match. Unused letters are deducted; a player who empties their rack also receives the opponent’s deduction. Highest final score wins.', 'تنتهي المباراة بعد ستة أدوار دون نقاط أو ٨٠ حركة أو نفاد رصيد لاعب مع فراغ الكيس. تُخصم قيمة الأحرف المتبقية؛ ويحصل من أنهى أحرفه على النقاط المخصومة من خصمه. يفوز صاحب أعلى مجموع.')}</p></details></div></div><details class="pd-duel-dictionary" ${dictionaryOpen ? 'open' : ''}><summary>${t('Explore the curated vocabulary', 'تصفّح قائمة الكلمات المختارة')}</summary><p>${t('This edition uses an original, limited house vocabulary—not a full dictionary. Both players use the same list. Check words here before playing.', 'تستخدم هذه النسخة قائمة كلمات أصلية محدودة، وليست معجماً كاملاً. يستخدم اللاعبان القائمة نفسها. تحقق من كلمتك هنا قبل اللعب.')}</p><label>${t('Find a word', 'ابحث عن كلمة')}<input id="pd-duel-word-search" type="search" autocomplete="off" placeholder="${t('Search accepted words…', 'ابحث في الكلمات المقبولة…')}" dir="${state.lang === 'ar' ? 'rtl' : 'ltr'}"></label><div id="pd-duel-words" class="pd-duel-words" dir="${state.lang === 'ar' ? 'rtl' : 'ltr'}"></div></details><details class="pd-duel-options"><summary>${t('Room options', 'خيارات الغرفة')}</summary><p>${t('Your seat resumes on this browser. Closing this page does not resign. Rooms expire 24 hours after the latest move; completed rooms remain for one hour.', 'يمكنك استعادة مقعدك من هذا المتصفح. إغلاق الصفحة لا يعني الانسحاب. تنتهي الغرفة بعد ٢٤ ساعة من آخر حركة؛ وتبقى نتائج المباراة ساعة واحدة.')}</p><button type="button" id="pd-duel-menu">${t('Room menu', 'قائمة الغرف')}</button>${state.phase === 'playing' ? `<button type="button" id="pd-duel-resign" ${busy ? 'disabled' : ''}>${resignConfirm ? t('Confirm resignation', 'أكّد الانسحاب') : t('Resign match', 'انسحب من المباراة')}</button>${resignConfirm ? `<button type="button" id="pd-duel-resign-cancel">${t('Keep playing', 'تابع اللعب')}</button>` : ''}` : ''}</details></section>`;
    root.querySelectorAll('[data-rack]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.rack);
      if (swapping) swapTiles.has(index) ? swapTiles.delete(index) : swapTiles.add(index);
      else selected = selected === index ? null : index;
      render();
    }));
    root.querySelectorAll('[data-cell]').forEach(button => {
      button.addEventListener('click', () => place(Number(button.dataset.cell)));
      button.addEventListener('keydown', boardKey);
    });
    on('#pd-duel-submit', () => act({ kind: 'place', placements: staged.map(tile => ({ row: Math.floor(tile.cell / SIZE), col: tile.cell % SIZE, letter: state.rack[tile.rack] })) }));
    on('#pd-duel-clear', () => { staged = []; selected = null; render(); });
    on('#pd-duel-pass', () => act({ kind: 'pass' }));
    on('#pd-duel-swap', () => { staged = []; selected = null; swapping = true; swapTiles.clear(); render(); });
    on('#pd-duel-swap-cancel', () => { swapping = false; swapTiles.clear(); render(); });
    on('#pd-duel-swap-submit', () => act({ kind: 'swap', indices: [...swapTiles] }));
    on('#pd-duel-menu', () => { menu = true; render(); });
    on('#pd-duel-new', () => { menu = true; session = null; persist(); render(); });
    on('#pd-duel-resign', () => { if (resignConfirm) act({ kind: 'resign' }); else { resignConfirm = true; render(); root.querySelector('.pd-duel-options').open = true; } });
    on('#pd-duel-resign-cancel', () => { resignConfirm = false; render(); });
    on('#pd-duel-copy', async () => {
      try { await navigator.clipboard.writeText(inviteURL()); notify(t('Invitation copied. Send it to your friend.', 'نُسخت الدعوة. أرسلها لصديقك.')); }
      catch { root.querySelector('#pd-duel-invite-link').select(); notify(t('Select and copy the invitation link.', 'حدد رابط الدعوة وانسخه.')); }
    });
    root.querySelector('.pd-duel-dictionary').addEventListener('toggle', event => { dictionaryOpen = event.target.open; if (dictionaryOpen) loadVocabulary(); });
    root.querySelector('#pd-duel-word-search').addEventListener('input', showWords);
    showWords();
    if (focusIndex !== undefined && focusIndex !== null) root.querySelector(`[data-${focusType}="${focusIndex}"]`)?.focus({ preventScroll: true });
  }
  function on(selector, callback) { root.querySelector(selector)?.addEventListener('click', callback); }
  function place(cell) {
    if (controlsDisabled() || swapping) return;
    const existing = staged.findIndex(tile => tile.cell === cell);
    if (existing >= 0) { selected = staged[existing].rack; staged.splice(existing, 1); render(); return; }
    if (state.board[cell]) return;
    if (selected === null) { notify(t('Choose a letter from your rack first.', 'اختر حرفاً من رصيدك أولاً.')); return; }
    staged.push({ cell, rack: selected }); selected = null; message = ''; render();
  }
  function boardKey(event) {
    const index = Number(event.currentTarget.dataset.cell);
    const rtl = state.lang === 'ar';
    const delta = { ArrowDown: SIZE, ArrowUp: -SIZE, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    if (delta) {
      event.preventDefault();
      let target = index + delta;
      while (target >= 0 && target < 81 && (Math.abs(delta) !== 1 || Math.floor(target / SIZE) === Math.floor(index / SIZE))) {
        const node = root.querySelector(`[data-cell="${target}"]`);
        if (node && !node.disabled) { node.focus(); break; }
        target += delta;
      }
    } else if (['Delete', 'Backspace'].includes(event.key) && staged.some(tile => tile.cell === index)) { event.preventDefault(); place(index); }
    else if ([...event.key].length === 1 && /[a-z\u0621-\u064a]/iu.test(event.key)) {
      const rackIndex = state.rack.findIndex((letter, i) => normalize(letter) === normalize(event.key) && !staged.some(tile => tile.rack === i));
      if (rackIndex >= 0) { event.preventDefault(); selected = rackIndex; place(index); }
    }
  }
  async function act(action) {
    if (busy || stopped || !session?.code) return;
    const activeSession = { ...session };
    busy = true; message = ''; render();
    try {
      const next = await api(`${activeSession.code}/action`, { ...action, revision: state.revision, token: activeSession.token });
      if (stopped || session?.code !== activeSession.code || session?.token !== activeSession.token) return;
      if (!state || next.revision >= state.revision) state = next;
      staged = []; selected = null; swapping = false; swapTiles.clear(); resignConfirm = false;
      connectionLost = false;
      notify(t('Move saved.', 'حُفظت الحركة.'));
    } catch (error) {
      message = errorText(error); messageError = true;
      if (error.code === 'STALE_REVISION' || !error.status) { staged = []; selected = null; await refresh(false); }
    } finally { busy = false; if (!stopped) render(); schedule(); }
  }
  async function loadVocabulary() {
    const lang = gameLanguage();
    if (vocabularyLang === lang && vocabulary.length) { showWords(); return; }
    if (vocabRequest) return;
    vocabRequest = api(`vocabulary?lang=${lang}`);
    try { const data = await vocabRequest; if (!stopped && lang === gameLanguage()) { vocabulary = data.words; vocabularyLang = data.lang; showWords(); } }
    catch { const node = root.querySelector('#pd-duel-words'); if (node) node.textContent = t('Vocabulary could not load. Close and reopen this panel to retry.', 'تعذّر تحميل الكلمات. أغلق هذه اللوحة وافتحها للمحاولة مجدداً.'); }
    finally { vocabRequest = null; if (!stopped && lang !== gameLanguage()) loadVocabulary(); }
  }
  function showWords() {
    const node = root.querySelector('#pd-duel-words');
    if (!node) return;
    if (!vocabulary.length || vocabularyLang !== gameLanguage()) { node.textContent = t('Loading vocabulary…', 'جارٍ تحميل الكلمات…'); return; }
    const query = normalize(root.querySelector('#pd-duel-word-search')?.value || '');
    const words = vocabulary.filter(word => word.includes(query));
    node.innerHTML = `<p>${words.length} ${t('matching words', 'كلمة مطابقة')}${words.length > 80 ? ` · ${t('First 80 shown; type to narrow the list.', 'تُعرض أول ٨٠ كلمة؛ اكتب لتضييق البحث.')}` : ''}${query && vocabulary.includes(query) ? ` · ${t('✓ This word is accepted', '✓ هذه الكلمة مقبولة')}` : ''}</p><div>${words.slice(0, 80).map(word => `<span>${e(word)}</span>`).join('')}</div>`;
  }
  async function refresh(force) {
    if (stopped || polling || !session?.code || (!force && (menu || document.hidden))) return;
    const activeSession = { ...session };
    polling = true; requestController = new AbortController();
    try {
      const next = await api(`${activeSession.code}/state`, { token: activeSession.token }, requestController.signal);
      if (stopped || session?.code !== activeSession.code || session?.token !== activeSession.token || next.code !== activeSession.code) return;
      if (state?.code === next.code && next.revision < state.revision) return;
      const changed = !state || next.revision > state.revision || next.code !== state.code;
      const wasOffline = connectionLost;
      connectionLost = false;
      if (changed) { state = next; staged = []; selected = null; swapping = false; swapTiles.clear(); loadVocabulary(); }
      if (force || changed || wasOffline) { if (!messageError || wasOffline) { message = ''; messageError = false; } render(); }
    } catch (error) {
      if (stopped || session?.code !== activeSession.code || session?.token !== activeSession.token) return;
      connectionLost = true;
      if ([403, 404, 410].includes(error.status)) { menu = true; state = null; }
      message = errorText(error); messageError = true; render();
    } finally { polling = false; requestController = null; schedule(); }
  }
  function schedule() {
    clearTimeout(timer);
    if (!stopped && session?.code && !menu && state?.phase !== 'finished') timer = setTimeout(() => { if (!busy) refresh(false); else schedule(); }, connectionLost ? 8000 : 4000);
  }
  function visibility() { if (!document.hidden && !menu && !busy) refresh(true); }
  document.addEventListener('visibilitychange', visibility);
  render();
  if (!menu && session?.code) refresh(true);
  return () => { stopped = true; clearTimeout(timer); requestController?.abort(); document.removeEventListener('visibilitychange', visibility); };
}
