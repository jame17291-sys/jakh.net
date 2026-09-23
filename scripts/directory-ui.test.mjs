import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createDirectoryUi } from '../directory-ui.js';
import { loadProductionQuarantine, publicCatalogProjection } from './publication-quarantine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const quarantine = loadProductionQuarantine(root);
const catalog = publicCatalogProjection(
  JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8')),
  quarantine,
);
const categories = new Map(catalog.categories.map((category) => [category.slug, category]));
const sections = catalog.sections.map((section) => ({
  ...section,
  categories: section.members.map((slug) => categories.get(slug)),
  categoryCount: section.members.length,
}));
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function element() {
  return {
    attributes: {},
    listeners: {},
    value: '',
    textContent: '',
    innerHTML: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
    dispatch(name) { for (const callback of this.listeners[name] || []) callback({ target: this }); },
  };
}

function fixture(overrides = {}) {
  const state = { catalog, lang: 'en', cluster: 'all', directorySearch: '', ...overrides };
  const els = Object.fromEntries(['categoryDirectoryGrid', 'directoryResultsLabel', 'resetDirectoryBtn', 'categorySearchInput'].map((id) => [id, element()]));
  const calls = { cards: [], events: [], toasts: [] };
  const ui = createDirectoryUi({
    state,
    els,
    t: (key) => key,
    escapeHtml,
    getDirectorySections: () => sections,
    createCategoryCardMarkup: (category) => {
      calls.cards.push(category.slug);
      return `<a class="category-card" href="/${category.slug}">${escapeHtml(category.title[state.lang])}</a>`;
    },
    showToast: (message) => calls.toasts.push(message),
    trackEvent: (...args) => calls.events.push(args),
  });
  return { ui, state, els, calls };
}

function withTabs(run) {
  const previousDocument = globalThis.document;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const tabBar = {
    markup: '',
    tabs: [],
    contains: (target) => tabBar.tabs.includes(target),
    querySelectorAll: () => tabBar.tabs,
    querySelector: () => tabBar.tabs.find((tab) => tab.attributes['aria-selected'] === 'true'),
    set innerHTML(markup) {
      this.markup = markup;
      this.tabs = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gu)].map(([, rawAttributes, content]) => {
        const tab = element();
        tab.attributes = Object.fromEntries([...rawAttributes.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, key, value]) => [key, value]));
        tab.dataset = { cluster: tab.attributes['data-cluster'] };
        tab.innerHTML = content;
        tab.closest = () => tab;
        tab.click = () => tab.dispatch('click');
        tab.focus = () => { globalThis.document.activeElement = tab; };
        return tab;
      });
    },
    get innerHTML() { return this.markup; },
  };
  globalThis.document = { getElementById: (id) => id === 'clusterTabBar' ? tabBar : null, activeElement: null };
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    return run(tabBar);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousAnimationFrame;
  }
}

test('All topics displays every public topic without a hidden featured subset', () => {
  const { ui, els, calls } = fixture();
  ui.renderDirectory();
  assert.equal(calls.cards.length, 51);
  assert.equal(new Set(calls.cards).size, 51);
  assert.deepEqual(new Set(calls.cards), new Set(catalog.categories.map((category) => category.slug)));
  for (const slug of quarantine.categorySlugs) assert.equal(calls.cards.includes(slug), false);
  assert.equal(els.directoryResultsLabel.textContent, '51 topics in 5 sections.');
  assert.equal(els.categoryDirectoryGrid.attributes['aria-labelledby'], 'directory-tab-all');
});

test('subject filters and section totals match the public catalog', () => {
  for (const section of sections) {
    const { ui, els, calls } = fixture({ cluster: section.key });
    ui.renderDirectory();
    assert.deepEqual(calls.cards, section.members);
    assert.equal(els.directoryResultsLabel.textContent, `${section.members.length} topics in 1 section.`);
    assert.equal(els.categoryDirectoryGrid.attributes['aria-labelledby'], `directory-tab-${section.key}`);
    const questionCount = section.categories.reduce((sum, category) => sum + category.count, 0);
    assert.ok(els.categoryDirectoryGrid.innerHTML.includes(`${questionCount} questions`));
  }
});

test('search finds either language and reports localized results and empty states', () => {
  for (const lang of ['en', 'ar']) {
    for (const directorySearch of ['football', 'كرة القدم']) {
      const { ui, els, calls } = fixture({ lang, directorySearch });
      ui.renderDirectory();
      assert.ok(calls.cards.includes('football'), `${lang}: ${directorySearch}`);
      assert.ok(calls.cards.length < 51);
      assert.match(els.directoryResultsLabel.textContent, lang === 'ar' ? /عُثر على/ : /matching topics found/);
    }
    const { ui, els, calls } = fixture({ lang, directorySearch: 'not-a-real-topic-92811' });
    ui.renderDirectory();
    assert.equal(calls.cards.length, 0);
    assert.match(els.categoryDirectoryGrid.innerHTML, lang === 'ar' ? /لا توجد نتائج مطابقة/ : /No matching topics/);
  }
});

test('tabs expose truthful counts, one keyboard stop, and a labeled panel', () => withTabs((tabBar) => {
  const { ui } = fixture();
  ui.renderTabs();
  assert.equal(tabBar.tabs.length, 6);
  assert.equal(tabBar.tabs.filter((tab) => tab.attributes.tabindex === '0').length, 1);
  assert.match(tabBar.tabs[0].innerHTML, /51 topics/);
  for (const tab of tabBar.tabs) {
    assert.equal(tab.attributes.id, `directory-tab-${tab.dataset.cluster}`);
    assert.equal(tab.attributes['aria-controls'], 'categoryDirectoryGrid');
    const count = tab.dataset.cluster === 'all' ? 51 : sections.find((section) => section.key === tab.dataset.cluster).categoryCount;
    assert.ok(tab.innerHTML.includes(`${count} topics`));
  }
}));

test('arrow, Home, and End keys preserve tab selection and focus in English and Arabic', () => withTabs((tabBar) => {
  for (const lang of ['en', 'ar']) {
    const { ui, state } = fixture({ lang });
    ui.renderTabs();
    const key = (name, index) => {
      let prevented = false;
      tabBar.onkeydown({ key: name, target: tabBar.tabs[index], preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    };
    key(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight', 0);
    assert.equal(state.cluster, 'mind');
    assert.equal(globalThis.document.activeElement.dataset.cluster, 'mind');
    key('End', 1);
    assert.equal(state.cluster, 'culture');
    key('Home', 5);
    assert.equal(state.cluster, 'all');
    key(lang === 'ar' ? 'ArrowRight' : 'ArrowLeft', 0);
    assert.equal(state.cluster, 'culture');
  }
}));

test('reset restores all public topics and binding is idempotent', () => withTabs(() => {
  const { ui, state, els, calls } = fixture({ lang: 'ar', cluster: 'culture', directorySearch: 'football' });
  els.categorySearchInput.value = 'football';
  ui.bind();
  ui.bind();
  assert.equal(els.resetDirectoryBtn.listeners.click.length, 1);
  els.resetDirectoryBtn.dispatch('click');
  assert.equal(state.cluster, 'all');
  assert.equal(state.directorySearch, '');
  assert.equal(els.categorySearchInput.value, '');
  assert.equal(calls.cards.length, 51);
  assert.deepEqual(calls.toasts, ['directoryResetDone']);
  assert.match(els.directoryResultsLabel.textContent, /51 موضوعًا/);
}));

test('directory document puts search first and exposes collections without an extra promotion', () => {
  const html = readFileSync(new URL('../mind-lab.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="categorySearchInput"') < html.indexOf('id="clusterTabBar"'));
  assert.match(html, /class="library-subnav"[\s\S]*?href="\/collections"/u);
  assert.match(html, /id="directoryResultsLabel" role="status" aria-live="polite"/u);
  assert.match(html, /id="categoryDirectoryGrid"[^>]*role="tabpanel"[^>]*aria-labelledby="directory-tab-all"/u);
  assert.doesNotMatch(html, /directoryExpandBtn|directory-collection-callout|16 curated/u);
});
