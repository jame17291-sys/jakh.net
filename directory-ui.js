import { illustrationMarkup, SECTION_ILLUSTRATIONS, TOPIC_ILLUSTRATIONS } from './site-illustrations.js';
import { AR_COUNT, arabicCount } from './arabic-count.js';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
// After على/في the dual takes its genitive form.
const AR_MATCHING_TOPICS = { one: 'موضوع واحد مطابق', two: 'موضوعين مطابقين', few: 'موضوعات مطابقة', many: 'موضوعًا مطابقًا', other: 'موضوع مطابق' };
const AR_SECTIONS_GENITIVE = { ...AR_COUNT.section, two: 'قسمين' };

export function createDirectoryUi({
  state,
  els,
  t,
  escapeHtml,
  getDirectorySections,
  createCategoryCardMarkup,
  showToast,
  trackEvent,
}) {
  let bound = false;
  let searchTimer = null;

  // Kids Riddles opens the Kids hub, which already has its own menu entry, so
  // topics with listedInDirectory: false keep their section but get no card.
  function listedSections() {
    return getDirectorySections().map((section) => {
      const categories = section.categories.filter((category) => category.listedInDirectory !== false);
      return { ...section, categories, categoryCount: categories.length };
    }).filter((section) => section.categoryCount > 0);
  }

  function renderDirectory() {
    if (!els.categoryDirectoryGrid || !state.catalog) return;
    const sections = listedSections();
    const searchTerm = state.directorySearch;
    const isAr = state.lang === 'ar';
    const visibleSections = state.cluster === 'all'
      ? sections
      : sections.filter((section) => section.key === state.cluster);
    let visibleCategoryCount = 0;
    let visibleSectionCount = 0;

    const markup = visibleSections.map((section) => {
      const categories = section.categories.filter((meta) => {
        if (!searchTerm) return true;
        const topicText = (meta.topics || []).flatMap((topic) => [topic.en, topic.ar]).filter(Boolean);
        return [meta.title.en, meta.title.ar, meta.description.en, meta.description.ar, ...topicText]
          .filter(Boolean).join(' ').toLowerCase().includes(searchTerm);
      });
      if (!categories.length) return '';
      visibleCategoryCount += categories.length;
      visibleSectionCount += 1;
      const title = escapeHtml(section.title[state.lang] || section.title.en);
      const description = escapeHtml(section.description[state.lang] || section.description.en);
      const questionTotal = categories.reduce((total, category) => total + Number(category.count || 0), 0);
      const categoryLabel = isAr ? arabicCount(categories.length, AR_COUNT.topic) : plural(categories.length, 'topic', 'topics');
      const questionLabel = isAr ? arabicCount(questionTotal, AR_COUNT.question) : plural(questionTotal, 'question', 'questions');
      return `<section id="section-${escapeHtml(section.key)}" class="directory-section-header" style="--section-gradient:${escapeHtml(section.gradient)};--section-accent:${escapeHtml(section.accent)};">
        ${illustrationMarkup(SECTION_ILLUSTRATIONS[section.key], 'section')}
        <div><h3>${title}</h3><p>${description}</p></div>
        <p class="directory-section-count">${categoryLabel} · ${questionLabel}</p>
      </section>${categories.map(meta => createCategoryCardMarkup(meta, { art: illustrationMarkup(TOPIC_ILLUSTRATIONS[meta.slug], 'directory') })).join('')}`;
    }).join('');

    els.directoryResultsLabel.textContent = searchTerm
      ? (isAr ? `عُثر على ${arabicCount(visibleCategoryCount, AR_MATCHING_TOPICS)}.` : `${plural(visibleCategoryCount, 'matching topic', 'matching topics')} found.`)
      : isAr
        ? `${arabicCount(visibleCategoryCount, AR_COUNT.topic)} في ${arabicCount(visibleSectionCount, AR_SECTIONS_GENITIVE)}.`
        : `${plural(visibleCategoryCount, 'topic', 'topics')} in ${plural(visibleSectionCount, 'section', 'sections')}.`;
    els.categoryDirectoryGrid.setAttribute('aria-labelledby', `directory-tab-${state.cluster}`);
    els.categoryDirectoryGrid.innerHTML = markup || `<div class="empty-state directory-empty-state"><h3>${isAr ? 'لا توجد نتائج مطابقة.' : 'No matching topics.'}</h3><p>${isAr ? 'جرّب قسمًا آخر أو امسح البحث الحالي.' : 'Try another section or clear the current search.'}</p></div>`;
  }

  function renderTabs(focusCluster = '') {
    const tabBar = document.getElementById('clusterTabBar');
    if (!tabBar || !state.catalog) return;
    const activeCluster = tabBar.contains(document.activeElement)
      ? document.activeElement.closest('[data-cluster]')?.dataset.cluster || ''
      : '';
    const focusKey = focusCluster || activeCluster;
    const isAr = state.lang === 'ar';
    const sections = listedSections();
    const tabs = [{
      key: 'all',
      title: { en: 'All topics', ar: 'كل الموضوعات' },
      categoryCount: sections.reduce((total, section) => total + section.categoryCount, 0),
    }, ...sections];
    tabBar.innerHTML = tabs.map((section) => {
      const name = section.title[state.lang] || section.title.en;
      const active = state.cluster === section.key;
      return `<button type="button" id="directory-tab-${escapeHtml(section.key)}" class="ml-cluster-tab${active ? ' is-active' : ''}" data-cluster="${escapeHtml(section.key)}" role="tab" aria-selected="${active}" aria-controls="categoryDirectoryGrid" tabindex="${active ? '0' : '-1'}" aria-label="${escapeHtml(name)}">
        <span class="ml-cluster-tab-name">${escapeHtml(name)}</span><span class="ml-cluster-tab-count">${isAr ? arabicCount(section.categoryCount, AR_COUNT.topic) : plural(section.categoryCount, 'topic', 'topics')}</span>
      </button>`;
    }).join('');
    const renderedTabs = [...tabBar.querySelectorAll('[role="tab"][data-cluster]')];
    renderedTabs.forEach((button) => button.addEventListener('click', () => {
      const next = button.dataset.cluster;
      if (state.cluster === next) return;
      state.cluster = next;
      renderTabs(next);
      renderDirectory();
    }));
    tabBar.onkeydown = (event) => {
      const current = renderedTabs.indexOf(event.target.closest('[role="tab"]'));
      if (current < 0) return;
      const forward = state.lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
      const backward = state.lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
      let next = current;
      if (event.key === forward) next = (current + 1) % renderedTabs.length;
      else if (event.key === backward) next = (current - 1 + renderedTabs.length) % renderedTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = renderedTabs.length - 1;
      else return;
      event.preventDefault();
      renderedTabs[next].click();
    };
    if (focusKey) requestAnimationFrame(() => (
      renderedTabs.find((tab) => tab.dataset.cluster === focusKey)
      || tabBar.querySelector('[aria-selected="true"]')
    )?.focus());
  }

  function bind() {
    if (bound) return;
    bound = true;
    els.resetDirectoryBtn?.addEventListener('click', () => {
      clearTimeout(searchTimer);
      state.directorySearch = '';
      state.cluster = 'all';
      if (els.categorySearchInput) els.categorySearchInput.value = '';
      renderTabs();
      renderDirectory();
      showToast(t('directoryResetDone'));
    });
    els.categorySearchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.directorySearch = els.categorySearchInput.value.trim().toLowerCase();
        renderDirectory();
        if (state.directorySearch) {
          trackEvent('search', { search_term: state.directorySearch, search_scope: 'directory' });
        }
      }, 250);
    });
  }

  return { bind, renderDirectory, renderTabs };
}
