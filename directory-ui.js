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

  function renderDirectory() {
    if (!els.categoryDirectoryGrid || !state.catalog) return;
    const sections = getDirectorySections();
    const searchTerm = state.directorySearch;
    const isAr = state.lang === 'ar';
    const visibleSections = state.cluster === 'all'
      ? sections
      : sections.filter((section) => section.key === state.cluster);
    let visibleCategoryCount = 0;
    let totalMatchingCount = 0;
    const shouldCollapse = state.cluster === 'all' && !searchTerm && !state.directoryExpanded;

    const markup = visibleSections.map((section) => {
      const matchingCategories = section.categories.filter((meta) => {
        if (!searchTerm) return true;
        const topicText = (meta.topics || []).flatMap((topic) => [topic.en, topic.ar]).filter(Boolean);
        return [meta.title.en, meta.title.ar, meta.description.en, meta.description.ar, ...topicText]
          .filter(Boolean).join(' ').toLowerCase().includes(searchTerm);
      });
      totalMatchingCount += matchingCategories.length;
      const categories = shouldCollapse ? matchingCategories.slice(0, 3) : matchingCategories;
      if (!categories.length) return '';
      visibleCategoryCount += categories.length;
      const title = escapeHtml(section.title[state.lang] || section.title.en);
      const description = escapeHtml(section.description[state.lang] || section.description.en);
      const questionTotal = categories.reduce((total, category) => total + Number(category.count || 0), 0);
      const categoryLabel = isAr ? `${categories.length} موضوعًا` : `${categories.length} topics`;
      const questionLabel = isAr ? `${questionTotal} سؤال` : `${questionTotal} questions`;
      return `<section class="directory-section-header" style="--section-gradient:${escapeHtml(section.gradient)};--section-accent:${escapeHtml(section.accent)};">
        <span class="directory-section-mark" aria-hidden="true">${escapeHtml(section.mark)}</span>
        <div><h3>${title}</h3><p>${description}</p></div>
        <p class="directory-section-count">${categoryLabel} · ${questionLabel}</p>
      </section>${categories.map(createCategoryCardMarkup).join('')}`;
    }).join('');

    els.directoryResultsLabel.textContent = searchTerm
      ? (isAr ? `عُثر على ${visibleCategoryCount} موضوعًا مطابقًا.` : `${visibleCategoryCount} matching topics found.`)
      : isAr
        ? (shouldCollapse
          ? `نعرض ${visibleCategoryCount} موضوعًا مقترحًا من أصل ${totalMatchingCount} ضمن ${visibleSections.length} أقسام.`
          : `اختر مباشرة من ${visibleCategoryCount} موضوعًا موزّعًا على ${visibleSections.length} أقسام واضحة.`)
        : (shouldCollapse
          ? `Showing ${visibleCategoryCount} featured topics from ${totalMatchingCount} across ${visibleSections.length} sections.`
          : `Choose directly from ${visibleCategoryCount} topics in ${visibleSections.length} clear sections.`);
    if (els.directoryExpandBtn) {
      els.directoryExpandBtn.hidden = state.cluster !== 'all' || Boolean(searchTerm);
      els.directoryExpandBtn.textContent = t(state.directoryExpanded ? 'showFewerTopics' : 'showAllTopics');
      els.directoryExpandBtn.setAttribute('aria-expanded', String(state.directoryExpanded));
    }
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
    const sections = getDirectorySections();
    const tabs = [{
      key: 'all',
      title: { en: 'All topics', ar: 'كل الموضوعات' },
      categoryCount: state.catalog.categories.length,
      mark: 'ALL',
      gradient: 'linear-gradient(135deg,#fff8eb,#edf5ff)',
    }, ...sections];
    tabBar.innerHTML = tabs.map((section) => {
      const name = section.title[state.lang] || section.title.en;
      const active = state.cluster === section.key;
      return `<button type="button" class="ml-cluster-tab${active ? ' is-active' : ''}" data-cluster="${escapeHtml(section.key)}" role="tab" aria-selected="${active}" aria-controls="categoryDirectoryGrid" tabindex="${active ? '0' : '-1'}" aria-label="${escapeHtml(name)}">
        <div class="ml-cluster-tab-bg" style="background:${escapeHtml(section.gradient)};" aria-hidden="true"></div>
        <div class="ml-cluster-tab-content"><span class="ml-cluster-tab-emoji directory-parent-mark" aria-hidden="true">${escapeHtml(section.mark)}</span><div class="ml-cluster-tab-text"><span class="ml-cluster-tab-name">${escapeHtml(name)}</span><span class="ml-cluster-tab-count">${section.categoryCount} ${isAr ? 'موضوعًا' : 'topics'}</span></div></div>
      </button>`;
    }).join('');
    const renderedTabs = [...tabBar.querySelectorAll('[role="tab"][data-cluster]')];
    renderedTabs.forEach((button) => button.addEventListener('click', () => {
      const next = button.dataset.cluster;
      if (state.cluster === next) return;
      state.cluster = next;
      state.directoryExpanded = next !== 'all';
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
      state.directorySearch = '';
      state.cluster = 'all';
      state.directoryExpanded = false;
      if (els.categorySearchInput) els.categorySearchInput.value = '';
      renderTabs();
      renderDirectory();
      showToast(t('directoryResetDone'));
    });
    els.categorySearchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.directorySearch = els.categorySearchInput.value.trim().toLowerCase();
        renderTabs();
        renderDirectory();
        if (state.directorySearch) {
          trackEvent('search', { search_term: state.directorySearch, search_scope: 'directory' });
        }
      }, 250);
    });
    els.directoryExpandBtn?.addEventListener('click', () => {
      state.directoryExpanded = !state.directoryExpanded;
      renderDirectory();
      if (!state.directoryExpanded) els.categoryDirectoryGrid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return { bind, renderDirectory, renderTabs };
}
