import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as stateModule from '../kids-state.js';

// Execute the actual module and generated HTML with a small DOM interaction
// harness. This verifies fallback behavior, not browser layout or native audio.
const source = fs.readFileSync(new URL('../kids-learning.js', import.meta.url), 'utf8');
const catalog = JSON.parse(fs.readFileSync(new URL('../data/kids/catalog.json', import.meta.url), 'utf8'));
const activity = catalog.activities[0];
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const dataKey = name => name.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());

async function runtime({ lang = 'en', page = 'hub', storageFailure = '', printFailure = false, speechFailure = 'unsupported', speechStarts = true } = {}) {
  const base = lang === 'ar' ? 'ar/topics/kids-riddles' : 'kids-riddles';
  const file = page === 'activity' ? `${base}/activities/${activity.id}/index.html` : lang === 'ar' ? `${base}/index.html` : 'kids-riddles.html';
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const legacy = new Map([
    ['jakh-guest-solved', '{"kids-riddles-001":"correct"}'],
    ['jakh-guest-favorites', '["kids-riddles-002"]'],
    ['jakh-user-progress', '{"retained":true}'],
    ['unrelated-user-setting', 'keep-me'],
  ]);
  const storage = new Map(legacy);
  const storageCalls = [];
  const printCalls = [];
  const speechCalls = [];
  const document = { listeners: {}, activeElement: null };
  let currentURL = new URL(`https://riddlearabia.com/${base}${page === 'activity' ? `/activities/${activity.id}/` : lang === 'ar' ? '/' : ''}`);

  class Element {
    constructor(tag) {
      this.nodeType = 1;
      this.tagName = tag.toUpperCase(); this.attributes = {}; this.dataset = {}; this.childNodes = [];
      this.listeners = {}; this.className = ''; this.hidden = false; this.disabled = false; this.checked = false;
      this.defaultChecked = false; this.defaultSelected = false; this.defaultValue = ''; this.value = '';
    }
    get children() { return this.childNodes.filter(child => child instanceof Element); }
    get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
    set textContent(value) { this.replaceChildren({ nodeType: 3, textContent: String(value) }); }
    get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
    get href() { return new URL(this.getAttribute('href') || '', currentURL).href; }
    set href(value) { this.setAttribute('href', value); }
    get isConnected() { return this === document.documentElement || Boolean(this.parentElement?.isConnected); }
    get classList() {
      const node = this;
      return {
        contains: name => node.className.split(/\s+/u).includes(name),
        add(...names) { node.className = [...new Set([...node.className.split(/\s+/u).filter(Boolean), ...names])].join(' '); },
        remove(...names) { node.className = node.className.split(/\s+/u).filter(name => !names.includes(name)).join(' '); },
        toggle(name, force) { const enabled = force ?? !this.contains(name); this[enabled ? 'add' : 'remove'](name); return enabled; },
      };
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
      else if (name === 'class') this.className = String(value);
      else if (['id', 'type', 'name', 'value', 'lang', 'dir'].includes(name)) this[name] = String(value);
      else if (['hidden', 'disabled', 'open'].includes(name)) this[name] = true;
      else if (name === 'checked') this.checked = this.defaultChecked = true;
      else if (name === 'selected') this.defaultSelected = true;
    }
    getAttribute(name) {
      if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
      if (name === 'class') return this.className;
      return this.attributes[name] ?? null;
    }
    removeAttribute(name) { delete this.attributes[name]; if (name.startsWith('data-')) delete this.dataset[dataKey(name)]; }
    remove() { if (!this.parentElement) return; this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this); this.parentElement = null; }
    cloneNode(deep = false) {
      const copy = new Element(this.tagName);
      for (const [name, value] of Object.entries(this.attributes)) copy.setAttribute(name, value);
      copy.dataset = { ...this.dataset };
      copy.className = this.className;
      copy.hidden = this.hidden;
      copy.open = this.open;
      if (deep) copy.append(...this.childNodes.map(child => child instanceof Element ? child.cloneNode(true) : { nodeType: 3, textContent: child.textContent }));
      return copy;
    }
    append(...children) { for (const child of children) { child.parentElement = this; this.childNodes.push(child); } }
    prepend(child) { child.parentElement = this; this.childNodes.unshift(child); }
    replaceChildren(...children) { for (const child of this.childNodes) child.parentElement = null; this.childNodes = []; this.append(...children); }
    focus() { document.activeElement = this; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    showModal() { this.open = true; }
    close() { this.open = false; for (const listener of this.listeners.close || []) listener(); }
    scrollIntoView() {}
    matches(selector) {
      return selector.split(',').some(part => {
        const pieces = part.trim().split(/\s+(?![^[]*\])/u);
        const own = pieces.pop();
        if (!own) return false;
        const not = own.match(/:not\(([^)]+)\)/u)?.[1];
        if (not && this.matches(not)) return false;
        const simple = own.replace(/:not\([^)]+\)/gu, '');
        const tag = simple.match(/^[a-z][\w-]*/iu)?.[0];
        if (tag && this.tagName !== tag.toUpperCase()) return false;
        const id = simple.match(/#([\w-]+)/u)?.[1];
        if (id && this.id !== id) return false;
        for (const [, cls] of simple.matchAll(/\.([\w-]+)/gu)) if (!this.classList.contains(cls)) return false;
        for (const [, name, quote, expected] of simple.matchAll(/\[([\w-]+)(?:=(["']?)([^\]"']*)\2)?\]/gu)) {
          const actual = this.getAttribute(name);
          if (actual === null || (expected !== undefined && actual !== expected)) return false;
        }
        let ancestor = this.parentElement;
        while (pieces.length) {
          const target = pieces.pop();
          while (ancestor && !ancestor.matches(target)) ancestor = ancestor.parentElement;
          if (!ancestor) return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) {
      const results = [];
      for (const child of this.children) { if (child.matches(selector)) results.push(child); results.push(...child.querySelectorAll(selector)); }
      return results;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }

  const root = new Element('document');
  const stack = [root];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of html.matchAll(/<\s*(\/)?([a-z][a-z0-9-]*)\b([^>]*)>|([^<]+)/giu)) {
    if (token[4]) { stack.at(-1).append({ nodeType: 3, textContent: decode(token[4]) }); continue; }
    const [, closing, tag, attributes] = token;
    if (closing) {
      const index = stack.findLastIndex(node => node.tagName === tag.toUpperCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const node = new Element(tag);
    for (const [, name, double, single, bare] of attributes.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) node.setAttribute(name, decode(double ?? single ?? bare ?? ''));
    stack.at(-1).append(node);
    if (!voidTags.has(tag.toLowerCase()) && !attributes.trimEnd().endsWith('/')) stack.push(node);
  }
  document.documentElement = root.querySelector('html');
  document.body = root.querySelector('body');
  document.activeElement = document.body;
  document.createElement = tag => new Element(tag);
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  document.querySelector = selector => root.querySelector(selector);
  document.getElementById = id => root.querySelector(`#${id}`);
  document.addEventListener = (type, listener) => { (document.listeners[type] ||= []).push(listener); };
  for (const select of root.querySelectorAll('select')) select.value = select.options.find(option => option.defaultSelected)?.value || select.options[0]?.value || '';
  const unavailable = () => Object.assign(new Error('Browser storage is unavailable'), { name: 'SecurityError' });
  const localStorage = {
    getItem(key) { storageCalls.push(['get', key]); if (storageFailure === 'read') throw unavailable(); return storage.get(key) ?? null; },
    setItem(key, value) { storageCalls.push(['set', key]); if (storageFailure === 'write') throw Object.assign(new Error('Storage quota'), { name: 'QuotaExceededError' }); storage.set(key, value); },
    removeItem(key) { storageCalls.push(['remove', key]); storage.delete(key); },
    clear() { assert.fail('Kids toolkit must never clear all browser storage'); },
  };
  const location = {
    get href() { return currentURL.href; }, get origin() { return currentURL.origin; }, get pathname() { return currentURL.pathname; },
    get search() { return currentURL.search; }, get hash() { return currentURL.hash; },
    assign(value) { currentURL = new URL(value, currentURL); }, replace(value) { currentURL = new URL(value, currentURL); },
  };
  const window = {
    document, location, listeners: {},
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    print() {
      const sheet = document.getElementById('kids-print-sheet');
      printCalls.push({
        sheetPresent: Boolean(sheet?.isConnected),
        printView: document.body.classList.contains('kids-printing-plan'),
        lang: sheet?.getAttribute('lang'),
        dir: sheet?.getAttribute('dir'),
        days: sheet?.querySelectorAll('h2').map(node => node.textContent),
        content: sheet?.textContent,
        urls: sheet?.querySelectorAll('.kids-print-url').map(node => node.textContent),
      });
      if (printFailure) throw new Error('Native printing unavailable');
    },
  };
  const speakNaturally = options => {
    const call = { ...options, cancelled: false, cancelCalls: 0 };
    speechCalls.push(call);
    if (speechFailure) { options.onError(speechFailure); options.onEnd(); return null; }
    const controller = { cancel() { call.cancelled = true; call.cancelCalls += 1; } };
    if (speechStarts) options.onStart();
    return controller;
  };
  const context = vm.createContext({ ...stateModule, importSpeech: async () => ({ speakNaturally }), document, window, location, localStorage, URL, URLSearchParams, console, setTimeout, clearTimeout,
    history: { replaceState(_state, _title, value) { currentURL = new URL(value, currentURL); } },
    requestAnimationFrame: callback => callback(),
    fetch: async url => { assert.equal(url, '/data/kids/catalog.json'); return { ok: true, json: async () => structuredClone(catalog) }; },
  });
  if (storageFailure === 'access') Object.defineProperty(context, 'localStorage', { get() { throw unavailable(); } });
  const moduleBody = source.replace(/^import [^\n]+from '\/kids-state\.js';\n/gmu, '').replace('import(path)', 'importSpeech(path)').replace('void initialize();', 'globalThis.initialization = initialize();');
  assert.notEqual(moduleBody, source, 'only imports and bootstrap promise are adapted to the harness');
  vm.runInContext(moduleBody, context, { filename: 'kids-learning.js' });
  await context.initialization;
  assert.ok(document.body.classList.contains('kids-ready'), 'the actual runtime completed bootstrap');
  const query = selector => { const node = document.querySelector(selector); assert.ok(node, `missing ${selector}`); return node; };
  const click = async selector => {
    const node = typeof selector === 'string' ? query(selector) : selector;
    document.activeElement = node;
    const event = { target: node, preventDefault() {} };
    for (const listener of node.listeners.click || []) await listener(event);
    for (const listener of document.listeners.click || []) await listener(event);
    await Promise.resolve();
  };
  const assertLegacy = () => {
    for (const [key, value] of legacy) assert.equal(storage.get(key), value, `${key} is preserved byte-for-byte`);
    assert.ok(storageCalls.every(([, key]) => key === stateModule.KIDS_STORAGE_KEY), 'runtime never reads, writes or removes legacy progress');
  };
  return { document, query, click, storage, storageCalls, assertLegacy, context, printCalls, speechCalls, window };
}

for (const lang of ['en', 'ar']) {
  test(`${lang}: denied storage access/read still allows tab-only saves, planner and completion`, async () => {
    for (const storageFailure of ['access', 'read']) {
      const app = await runtime({ lang, storageFailure });
      const originalCard = app.query(`[data-activity-id="${activity.id}"]`);
      const originalText = originalCard.textContent;
      assert.equal(originalCard.hidden, false);
      assert.match(app.query('[data-kids-storage-note]').textContent, lang === 'ar' ? /غير متاح/u : /unavailable/u);
      await app.click(`[data-kids-save="${activity.id}"]`);
      assert.equal(app.query(`[data-kids-save="${activity.id}"]`).getAttribute('aria-pressed'), 'true');
      assert.ok(app.query('[data-kids-saved-list]').textContent.includes(activity.title[lang]));
      app.query(`[data-kids-day="${activity.id}"]`).value = 'mon';
      await app.click(`[data-kids-add="${activity.id}"]`);
      assert.ok(app.query('[data-kids-planner-day="mon"]').textContent.includes(activity.title[lang]));
      await app.click(`[data-kids-complete="${activity.id}"]`);
      assert.equal(app.query('[data-kids-completed-count]').textContent, '1');
      assert.ok(originalCard.textContent.includes(activity.summary[lang]));
      assert.ok(originalText.includes(activity.summary[lang]));
      assert.equal(originalCard.hidden, false, 'the readable activity is still visible');
      assert.match(app.query('[data-kids-status]').textContent, lang === 'ar' ? /الصفحة المفتوحة فقط/u : /only kept in the current tab/u);
      assert.equal(app.storage.has(stateModule.KIDS_STORAGE_KEY), false);
      app.assertLegacy();
    }
  });

  test(`${lang}: a write quota failure retains the saved activity and explains the tab-only limitation`, async () => {
    const app = await runtime({ lang, storageFailure: 'write' });
    await app.click(`[data-kids-save="${activity.id}"]`);
    assert.equal(app.query(`[data-kids-save="${activity.id}"]`).getAttribute('aria-pressed'), 'true');
    assert.ok(app.query('[data-kids-saved-list]').textContent.includes(activity.title[lang]));
    assert.match(app.query('[data-kids-storage-note]').textContent, lang === 'ar' ? /غير متاح/u : /unavailable/u);
    assert.equal(app.storage.has(stateModule.KIDS_STORAGE_KEY), false);
    assert.equal(app.storageCalls.filter(([operation]) => operation === 'set').length, 1);
    await app.click(`[data-kids-save="${activity.id}"]`);
    assert.equal(app.query(`[data-kids-save="${activity.id}"]`).getAttribute('aria-pressed'), 'false');
    assert.equal(app.storageCalls.filter(([operation]) => operation === 'set').length, 1, 'subsequent actions do not repeatedly throw against blocked storage');
    app.assertLegacy();
  });

  test(`${lang}: unavailable browser speech gives a localized fallback and leaves real activity instructions usable`, async () => {
    const app = await runtime({ lang, page: 'activity' });
    const instructions = app.query('[data-kids-read]');
    const original = instructions.textContent;
    assert.ok(original.length > 500, 'actual authored activity content is loaded');
    await app.click('[data-kids-speak]');
    assert.match(app.query('[data-kids-status]').textContent, lang === 'ar' ? /القراءة الصوتية غير متاحة/u : /Read aloud is unavailable/u);
    assert.equal(app.query('[data-kids-speech-feedback]').textContent, app.query('[data-kids-status]').textContent, 'failure is visible next to the read-aloud controls as well as announced');
    assert.equal(instructions.textContent, original);
    assert.equal(instructions.hidden, false);
    assert.equal(app.query('[data-kids-speak]').disabled, false);
    await app.click(`[data-kids-save="${activity.id}"]`);
    assert.equal(app.query(`[data-kids-save="${activity.id}"]`).getAttribute('aria-pressed'), 'true', 'speech failure does not break other tools');
    app.assertLegacy();
  });

  test(`${lang}: shared speech receives authored blocks and inline wording, without hidden answers or controls`, async () => {
    const app = await runtime({ lang, page: 'activity', speechFailure: '', speechStarts: false });
    const instructions = app.query('[data-kids-read]');
    const firstSection = instructions.querySelector('section');
    const heading = firstSection.querySelector('h2').textContent;
    const expectedOpening = `${heading}${/[.!?؟،؛:;]["'”’»)\]]*$/u.test(heading) ? '' : '.'} ${firstSection.querySelector('p').textContent}`;
    const closedAnswer = instructions.querySelector('.kids-answer').querySelector('p').textContent;
    const paragraph = app.document.createElement('p');
    paragraph.textContent = lang === 'ar' ? 'قَرَأَ طِف' : 'Read a word: un';
    const emphasis = app.document.createElement('em');
    emphasis.textContent = lang === 'ar' ? 'لٌ' : 'broken';
    paragraph.append(emphasis);
    const hidden = app.document.createElement('p');
    hidden.setAttribute('hidden', '');
    hidden.textContent = 'Hidden answer must stay hidden';
    const control = app.document.createElement('button');
    control.textContent = 'Do not speak this control';
    const punctuatedBlocks = ['.', '!', '?', '؟', '،', '؛', ':', ';', '."', '؟»', '.”', '.)', '?]'].map((mark, index) => {
      const block = app.document.createElement('p');
      block.textContent = `${lang === 'ar' ? 'فِكرة' : 'Thought'} ${index}${mark}`;
      return block;
    });
    instructions.append(paragraph, ...punctuatedBlocks, hidden, control);
    const original = instructions.textContent;
    await app.click('[data-kids-speak]');
    assert.equal(app.speechCalls.length, 1, 'engine is invoked directly in the click handler');
    const call = app.speechCalls[0];
    assert.equal(call.lang, lang);
    assert.ok(call.text.startsWith(expectedOpening), 'adjacent heading and paragraph have a spoken boundary');
    assert.ok(call.text.includes(lang === 'ar' ? 'قَرَأَ طِفلٌ' : 'Read a word: unbroken'), 'diacritics and adjacent inline fragments are preserved');
    assert.ok(call.text.includes(`${paragraph.textContent}. ${punctuatedBlocks[0].textContent}`), 'an unpunctuated block receives a spoken pause');
    for (const [index, block] of punctuatedBlocks.entries()) {
      const next = punctuatedBlocks[index + 1];
      if (next) assert.ok(call.text.includes(`${block.textContent} ${next.textContent}`), 'existing punctuation supplies the pause without another period');
    }
    assert.ok(!call.text.includes('..'), 'existing sentence endings do not acquire double periods');
    assert.ok(!call.text.includes(closedAnswer), 'closed answer details are excluded');
    assert.ok(!call.text.includes(hidden.textContent));
    assert.ok(!call.text.includes(control.textContent));
    assert.equal(instructions.textContent, original, 'extraction does not change authored page content');
    const reader = app.query('[data-kids-speak]');
    const originalLabel = reader.textContent;
    assert.equal(reader.getAttribute('aria-pressed'), 'false', 'pending audio does not claim to be playing');
    assert.equal(reader.getAttribute('aria-busy'), 'true');
    call.onStart();
    assert.equal(reader.getAttribute('aria-pressed'), 'true');
    assert.equal(reader.textContent, lang === 'ar' ? 'أوقف القراءة' : 'Stop reading');
    call.onEnd();
    assert.equal(reader.getAttribute('aria-pressed'), 'false');
    assert.equal(reader.getAttribute('aria-busy'), null);
    assert.equal(reader.textContent, originalLabel);
    app.assertLegacy();
  });

  test(`${lang}: rapid replay, hidden tabs and page exit cancel only their speech and ignore stale callbacks`, async () => {
    const app = await runtime({ lang, page: 'activity', speechFailure: '', speechStarts: false });
    const reader = app.query('[data-kids-speak]');
    const originalLabel = reader.textContent;
    await app.click(reader);
    const first = app.speechCalls[0];
    await app.click(reader);
    assert.equal(first.cancelCalls, 1);
    await app.click(reader);
    const second = app.speechCalls[1];
    first.onStart();
    first.onError('synthesis-failed');
    first.onEnd();
    assert.equal(reader.getAttribute('aria-busy'), 'true', 'callbacks from the cancelled request cannot finish the new request');
    assert.equal(app.document.querySelector('[data-kids-speech-feedback]'), null);
    second.onStart();
    app.document.hidden = true;
    for (const listener of app.document.listeners.visibilitychange || []) listener();
    assert.equal(second.cancelCalls, 1);
    assert.equal(reader.textContent, originalLabel);
    app.document.hidden = false;
    await app.click(reader);
    const third = app.speechCalls[2];
    for (const listener of app.window.listeners.pagehide || []) listener();
    assert.equal(third.cancelCalls, 1);
    third.onStart();
    third.onError('start-timeout');
    assert.equal(reader.getAttribute('aria-pressed'), 'false');
    assert.equal(reader.getAttribute('aria-busy'), null);
    assert.equal(app.document.querySelector('[data-kids-speech-feedback]'), null);
    await app.click(reader);
    app.speechCalls[3].onError('voice-unavailable');
    assert.ok(app.query('[data-kids-speech-feedback]').textContent, 'a current failure is shown');
    await app.click(reader);
    assert.equal(app.query('[data-kids-speech-feedback]').textContent, '', 'retry removes its previous visible failure');
    assert.equal(app.query('[data-kids-status]').textContent, '', 'retry removes its previous announced failure');
    await app.click(`[data-kids-save="${activity.id}"]`);
    const savedStatus = app.query('[data-kids-status]').textContent;
    await app.click(reader);
    await app.click(reader);
    assert.equal(app.query('[data-kids-status]').textContent, savedStatus, 'speech retry preserves unrelated toolkit feedback');
    app.assertLegacy();
  });

  test(`${lang}: voice and playback failures reset the control and give localized visible guidance`, async () => {
    const expected = {
      'voice-unavailable': lang === 'ar' ? /صوت عربي/u : /English voice/u,
      'not-allowed': lang === 'ar' ? /مرة أخرى/u : /Tap Read aloud again/u,
      network: lang === 'ar' ? /الاتصال/u : /connection/u,
      'start-timeout': lang === 'ar' ? /تعذّر تشغيل الصوت/u : /voice could not play/u,
      'synthesis-failed': lang === 'ar' ? /تعذّر تشغيل الصوت/u : /voice could not play/u,
    };
    for (const [speechFailure, pattern] of Object.entries(expected)) {
      const app = await runtime({ lang, page: 'activity', speechFailure });
      const reader = app.query('[data-kids-speak]');
      const originalLabel = reader.textContent;
      await app.click(reader);
      assert.match(app.query('[data-kids-speech-feedback]').textContent, pattern);
      assert.equal(reader.getAttribute('aria-pressed'), 'false');
      assert.equal(reader.getAttribute('aria-busy'), null);
      assert.equal(reader.textContent, originalLabel);
      assert.equal(reader.disabled, false, 'reader remains available for a fresh user gesture');
      app.assertLegacy();
    }
  });

  test(`${lang}: the seven-day printable plan is complete before native printing starts and restores after printing`, async () => {
    const app = await runtime({ lang });
    const planned = [catalog.activities[0], catalog.activities[1]];
    for (const [index, item] of planned.entries()) {
      await app.click(`[data-kids-save="${item.id}"]`);
      app.query(`[data-kids-day="${item.id}"]`).value = index === 0 ? 'mon' : 'sun';
      await app.click(`[data-kids-add="${item.id}"]`);
    }
    await app.click('[data-kids-print-plan]');
    assert.equal(app.printCalls.length, 1);
    const print = app.printCalls[0];
    assert.equal(print.sheetPresent, true, 'print content is attached before calling window.print');
    assert.equal(print.printView, true, 'print-only styling is enabled before calling window.print');
    assert.equal(print.lang, lang);
    assert.equal(print.dir, lang === 'ar' ? 'rtl' : 'ltr');
    assert.deepEqual(print.days, lang === 'ar'
      ? ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
      : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    const prefix = lang === 'ar' ? '/ar/topics/kids-riddles' : '/kids-riddles';
    for (const item of planned) {
      assert.ok(print.content.includes(item.title[lang]), 'planned activity title is printed');
      assert.ok(print.content.includes(item.summary[lang]), 'instructions summary is printed');
      assert.ok(print.urls.includes(`https://riddlearabia.com${prefix}/activities/${item.id}/`), 'printed activity URL preserves the chosen language');
    }
    for (const listener of app.window.listeners.afterprint || []) listener();
    assert.equal(app.document.body.classList.contains('kids-printing-plan'), false, 'closing print returns to the regular view');
    assert.ok(app.query('[data-kids-planner-day="mon"]').textContent.includes(planned[0].title[lang]));
    app.assertLegacy();
  });

  test(`${lang}: failed native printing restores the page and retains the plan with localized feedback`, async () => {
    const app = await runtime({ lang, printFailure: true });
    await app.click(`[data-kids-save="${activity.id}"]`);
    app.query(`[data-kids-day="${activity.id}"]`).value = 'fri';
    await app.click(`[data-kids-add="${activity.id}"]`);
    const saved = app.storage.get(stateModule.KIDS_STORAGE_KEY);
    await app.click('[data-kids-print-plan]');
    assert.equal(app.printCalls.length, 1);
    assert.equal(app.printCalls[0].sheetPresent, true);
    assert.equal(app.document.body.classList.contains('kids-printing-plan'), false);
    assert.match(app.query('[data-kids-status]').textContent, lang === 'ar' ? /الطباعة غير متاحة/u : /Printing is unavailable/u);
    assert.ok(app.query('[data-kids-planner-day="fri"]').textContent.includes(activity.title[lang]));
    assert.equal(app.storage.get(stateModule.KIDS_STORAGE_KEY), saved, 'failed printing does not alter saved state');
    app.assertLegacy();
  });
}

test('confirmed toolkit reset removes only its own storage key and preserves existing riddle progress', async () => {
  const app = await runtime();
  await app.click(`[data-kids-save="${activity.id}"]`);
  assert.ok(app.storage.has(stateModule.KIDS_STORAGE_KEY));
  await app.click('[data-kids-reset-toolkit]');
  assert.equal(app.query('dialog').open, true);
  assert.ok(app.storage.has(stateModule.KIDS_STORAGE_KEY), 'opening the dialog does not clear saved data');
  await app.click('[data-kids-cancel-reset]');
  assert.ok(app.storage.has(stateModule.KIDS_STORAGE_KEY), 'cancel keeps saved data');
  await app.click('[data-kids-reset-toolkit]');
  await app.click('[data-kids-confirm-reset]');
  assert.equal(app.storage.has(stateModule.KIDS_STORAGE_KEY), false);
  assert.deepEqual(app.storageCalls.filter(([operation]) => operation === 'remove'), [['remove', stateModule.KIDS_STORAGE_KEY]]);
  app.assertLegacy();
});
