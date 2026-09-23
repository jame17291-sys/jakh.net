(function () {
  'use strict';

  const STORAGE_KEY = 'jakh-riddles-settings';
  let memorySettings = '{}';

  function readSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) memorySettings = raw;
      return JSON.parse(raw || memorySettings || '{}');
    } catch (_) {
      try { return JSON.parse(memorySettings || '{}'); } catch { return {}; }
    }
  }

  function writeSettings(settings) {
    memorySettings = JSON.stringify(settings);
    try { localStorage.setItem(STORAGE_KEY, memorySettings); return true; } catch (_) { return false; }
  }

  const COMMON = {
    en: {
      language: 'Language',
      navHome: 'Home',
      navMindLab: 'Riddles & Quizzes',
      navCategories: 'Riddles & Quizzes',
      navCollections: 'Short collections',
      navGames: 'Games',
      navGameHub: 'Games',
      skipMain: 'Skip to main content',
      footerNote: 'All rights reserved to Riddle Arabia 2026',
      footerCollections: 'Short collections',
      footerAbout: 'About & content standards',
      footerPrivacy: 'Privacy Centre',
      footerInfoLabel: 'Riddle Arabia information',
      quickActionsLabel: 'Quick actions',
      languageControlsLabel: 'Language controls',
      menu: 'Menu',
      brandHomeLabel: 'Riddle Arabia home',
      instagramLabel: 'Riddle Arabia on Instagram',
      facebookLabel: 'Riddle Arabia on Facebook',
      socialImageAlt: 'Riddle Arabia — bilingual riddles, quizzes, and brain games',
      englishLabel: 'English',
      arabicLabel: 'العربية',
    },
    ar: {
      language: 'اللغة',
      navHome: 'الرئيسية',
      navMindLab: 'ألغاز واختبارات',
      navCategories: 'ألغاز واختبارات',
      navCollections: 'مجموعات قصيرة',
      navGames: 'الألعاب',
      navGameHub: 'الألعاب',
      skipMain: 'انتقل إلى المحتوى الرئيسي',
      footerNote: 'جميع الحقوق محفوظة لـ ريدل أرابيا 2026',
      footerCollections: 'مجموعات قصيرة',
      footerAbout: 'عن ريدل أرابيا ومعايير المحتوى',
      footerPrivacy: 'مركز الخصوصية',
      footerInfoLabel: 'معلومات ريدل أرابيا',
      quickActionsLabel: 'خيارات سريعة',
      languageControlsLabel: 'خيارات اللغة',
      menu: 'القائمة',
      brandHomeLabel: 'الصفحة الرئيسية لريدل أرابيا',
      instagramLabel: 'ريدل أرابيا على إنستغرام',
      facebookLabel: 'ريدل أرابيا على فيسبوك',
      socialImageAlt: 'ريدل أرابيا — ألغاز واختبارات وألعاب ذهنية بالعربية والإنجليزية',
      englishLabel: 'English',
      arabicLabel: 'العربية',
    },
  };

  const PAGES = {
    about: {
      en: {
        metaTitle: 'About Riddle Arabia & Our Content Standards',
        metaDescription: 'Learn how Riddle Arabia organizes, translates, and improves its 3,553 bilingual questions, plus how to report a correction.',
        aboutEyebrow: 'About Riddle Arabia',
        aboutTitle: 'A friendly bilingual place to think, learn, and play',
        aboutIntro: 'Riddle Arabia is a free English-and-Arabic riddle, quiz, and browser-game website. The library currently includes 3,553 question cards mapped into 56 topics and five clear sections.',
        standardsOrganizedTitle: 'How content is organized',
        standardsOrganizedText: 'Every question belongs to one category, one practical subtopic, and one difficulty level. Related categories and focused collections help people move through the library without a maze of overlapping pages.',
        standardsTranslationTitle: 'Translation and consistency',
        standardsTranslationText: 'Questions require complete English and Arabic prompts and answers. Automated audits catch missing fields, taxonomy drift, and exact duplicates; high-traffic collections receive additional meaning and answer-parity checks before publication.',
        standardsAccuracyTitle: 'Accuracy and corrections',
        standardsAccuracyText: 'Evergreen facts are preferred. Time-sensitive facts and professional topics receive additional validation. You can flag an individual card from its share/report controls or send a correction through the suggestion box in the <a href="/mind-lab">Mind Lab</a>.',
        standardsBoundariesTitle: 'Educational boundaries',
        standardsBoundariesText: 'Riddle Arabia is for learning and entertainment. Medical, legal, financial, pharmacy, and psychology questions are not professional advice and should not be used to make personal decisions.',
        standardsIndependenceTitle: 'Independence',
        standardsIndependenceText: 'Fan-made quizzes are clearly labelled and do not imply affiliation, endorsement, or ownership of third-party names or marks. Riddle Arabia does not use unlicensed character artwork in its focused collections.',
        standardsConnectedTitle: 'Stay connected',
        standardsConnectedText: 'Follow <a class="social-link" rel="me noopener noreferrer" href="https://www.instagram.com/jakhriddles/">Riddle Arabia on Instagram</a> and <a class="social-link" rel="me noopener noreferrer" href="https://www.facebook.com/profile.php?id=61588921894305">Riddle Arabia on Facebook</a> for new riddles and site updates.',
      },
      ar: {
        metaTitle: 'عن ريدل أرابيا ومعايير المحتوى',
        metaDescription: 'تعرّف إلى طريقة تنظيم 3,553 سؤالًا في ريدل أرابيا، وترجمتها وتحسينها، وتعلّم كيف ترسل لنا تصحيحًا.',
        aboutEyebrow: 'عن ريدل أرابيا',
        aboutTitle: 'مكان مرح للتفكير، والتعلّم، واللعب، بالعربية والإنجليزية',
        aboutIntro: 'ريدل أرابيا موقع مجاني يجمع الألغاز، والاختبارات، وألعاب المتصفح، بالعربية والإنجليزية. وتضم مكتبتنا حاليًا 3,553 بطاقة موزّعة على 56 موضوعًا في خمسة أقسام.',
        standardsOrganizedTitle: 'كيف ننظم المحتوى',
        standardsOrganizedText: 'نصنّف كل سؤال ضمن موضوع واحد، وموضوع فرعي واضح، ومستوى صعوبة محدد. ونربط بين الموضوعات القريبة، ونضع بعض الأسئلة في مجموعات قصيرة، ليكون الاستكشاف سهلًا وممتعًا.',
        standardsTranslationTitle: 'الترجمة والاتساق',
        standardsTranslationText: 'لكل سؤال نص وإجابة كاملان بالعربية والإنجليزية. وتساعدنا الفحوص الآلية على اكتشاف الحقول الناقصة، وأخطاء التصنيف، والتكرار. أما المجموعات الأكثر زيارة، فتخضع لفحوص إضافية للمعنى وتطابق الإجابات قبل النشر.',
        standardsAccuracyTitle: 'الدقة والتصحيحات',
        standardsAccuracyText: 'نفضّل الحقائق الثابتة، وتخضع المعلومات المتغيرة والموضوعات المهنية لتحققات إضافية. وإذا لاحظت خطأً، فيمكنك الإبلاغ عن البطاقة نفسها، أو إرسال التصحيح من صندوق الاقتراحات في <a href="/mind-lab">مختبر العقول</a>.',
        standardsBoundariesTitle: 'الحدود التعليمية',
        standardsBoundariesText: 'يقدم ريدل أرابيا محتوى للتعلم والترفيه. لا تُعد أسئلة الطب أو القانون أو المال أو الصيدلة أو علم النفس نصيحة مهنية، ولا ينبغي استخدامها لاتخاذ قرارات شخصية.',
        standardsIndependenceTitle: 'الاستقلالية',
        standardsIndependenceText: 'نوضّح عندما يكون الاختبار من إعداد المعجبين. وهذه الاختبارات لا تعني وجود أي ارتباط أو تأييد من أصحاب الأسماء أو العلامات المذكورة. كما أننا لا نستخدم رسوم شخصيات غير مرخّصة في مجموعات ريدل أرابيا.',
        standardsConnectedTitle: 'ابقَ على تواصل',
        standardsConnectedText: 'تابع <a class="social-link" rel="me noopener noreferrer" href="https://www.instagram.com/jakhriddles/">ريدل أرابيا على إنستغرام</a> و<a class="social-link" rel="me noopener noreferrer" href="https://www.facebook.com/profile.php?id=61588921894305">ريدل أرابيا على فيسبوك</a> لمعرفة الألغاز الجديدة وتحديثات الموقع.',
      },
    },
    notFound: {
      en: {
        metaTitle: 'Page Not Found | Riddle Arabia',
        metaDescription: 'The page could not be found. Return to Riddle Arabia or browse the bilingual riddle categories.',
        notFoundTitle: 'Page not found',
        notFoundText: 'That page does not exist or may have moved. Head back home to find what you are looking for.',
        notFoundHome: 'Back to home',
        notFoundBrowse: 'Browse categories',
      },
      ar: {
        metaTitle: 'الصفحة غير موجودة | ريدل أرابيا',
        metaDescription: 'تعذر العثور على الصفحة. عُد إلى ريدل أرابيا، أو تصفّح موضوعات الألغاز المتاحة بالعربية والإنجليزية.',
        notFoundTitle: 'الصفحة غير موجودة',
        notFoundText: 'لا توجد هذه الصفحة، أو لعلها انتقلت إلى عنوان جديد. عُد إلى الرئيسية، أو تصفّح الموضوعات المتاحة.',
        notFoundHome: 'العودة إلى الرئيسية',
        notFoundBrowse: 'تصفّح الموضوعات',
      },
    },
  };

  let activePage = document.body?.dataset.i18nPage || '';
  let extraPages = {};

  function normalizeLanguage(value) {
    return value === 'ar' ? 'ar' : 'en';
  }

  const SHARED_LANGUAGE_ROUTES = Object.freeze([
    { en: '/', ar: '/ar/' },
    { en: '/mind-lab', ar: '/ar/mind-lab/' },
    { en: '/collections', ar: '/ar/collections/' },
    { en: '/play', ar: '/ar/play/' },
    { en: '/daily', ar: '/ar/daily/' },
    { en: '/about', ar: '/ar/about/' },
    { en: '/privacy', ar: '/ar/privacy/' },
    ...['chess', 'mastermind', 'go', 'reversi', 'codenames', 'catan', 'backgammon', 'set', 'hanabi', 'diplomacy']
      .map((slug) => ({ en: `/${slug}`, ar: `/ar/games/${slug}/` })),
  ]);

  function normalizeRoutePath(pathname) {
    let normalized = String(pathname || '/').replace(/\/{2,}/g, '/');
    normalized = normalized.replace(/\/index(?:\.html)?$/i, '/').replace(/\.html$/i, '');
    if (normalized !== '/') normalized = normalized.replace(/\/+$/, '');
    return normalized || '/';
  }

  function sharedRoute(pathname = window.location.pathname) {
    const normalized = normalizeRoutePath(pathname);
    for (const route of SHARED_LANGUAGE_ROUTES) {
      if (normalizeRoutePath(route.en) === normalized) return { ...route, lang: 'en' };
      if (normalizeRoutePath(route.ar) === normalized) return { ...route, lang: 'ar' };
    }
    return null;
  }

  function routeForLanguage(pathname, lang) {
    const route = sharedRoute(pathname);
    return route ? route[normalizeLanguage(lang)] : '';
  }

  function localizedHref(href, lang) {
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return href;
      const pathname = routeForLanguage(url.pathname, lang);
      if (!pathname) return href;
      url.searchParams.delete('lang');
      return `${pathname}${url.search}${url.hash}`;
    } catch (_) {
      return href;
    }
  }

  function readLanguage() {
    try {
      const saved = readSettings();
      return normalizeLanguage(saved.lang);
    } catch (_) {
      return 'en';
    }
  }

  function saveLanguage(nextLanguage) {
    try {
      const saved = readSettings();
      const settings = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      settings.lang = normalizeLanguage(nextLanguage);
      writeSettings(settings);
    } catch (_) {}
  }

  function consumeRequestedLanguage() {
    try {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get('lang');
      const route = sharedRoute(url.pathname);
      if (requested === 'en' || requested === 'ar') {
        saveLanguage(requested);
        url.searchParams.delete('lang');
        const pathname = route ? route[requested] : url.pathname;
        const target = `${pathname}${url.search}${url.hash}`;
        if (normalizeRoutePath(pathname) !== normalizeRoutePath(url.pathname)) window.location.replace(target);
        else window.history.replaceState(null, '', target);
        return requested;
      }
      return route?.lang || null;
    } catch (_) {
      return null;
    }
  }

  let language = consumeRequestedLanguage() || readLanguage();

  function pageMessages(page = activePage) {
    return extraPages[page] || PAGES[page] || { en: {}, ar: {} };
  }

  function message(key, lang = language) {
    const page = pageMessages();
    return page?.[lang]?.[key] ?? COMMON?.[lang]?.[key] ?? page?.en?.[key] ?? COMMON.en[key] ?? key;
  }

  function format(key, values = {}, lang = language) {
    return String(message(key, lang)).replace(/\{(\w+)\}/g, (_, token) => String(values[token] ?? ''));
  }

  function apply(root = document) {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

    root.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = message(node.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((node) => {
      node.innerHTML = message(node.dataset.i18nHtml);
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', message(node.dataset.i18nAriaLabel));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((node) => {
      node.setAttribute('title', message(node.dataset.i18nTitle));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', message(node.dataset.i18nPlaceholder));
    });
    root.querySelectorAll('a[href]').forEach((node) => {
      if (node.classList.contains('language-route-link')) return;
      const href = node.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const localized = localizedHref(href, language);
      if (localized !== href) node.setAttribute('href', localized);
    });

    const select = document.getElementById('langSelect');
    if (select) select.value = language;

    const title = message('metaTitle');
    if (title !== 'metaTitle') {
      document.title = title;
      document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
      document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
    }
    const description = message('metaDescription');
    if (description !== 'metaDescription') {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
      document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
    }
    const socialImageAlt = message('socialImageAlt');
    document.querySelector('meta[property="og:image:alt"]')?.setAttribute('content', socialImageAlt);
    document.querySelector('meta[name="twitter:image:alt"]')?.setAttribute('content', socialImageAlt);

    document.dispatchEvent(new CustomEvent('jakh:languagechange', {
      detail: { lang: language, dir: document.documentElement.dir },
    }));
  }

  function setLanguage(nextLanguage) {
    language = normalizeLanguage(nextLanguage);
    saveLanguage(language);
    const pathname = routeForLanguage(window.location.pathname, language);
    if (pathname) {
      const url = new URL(window.location.href);
      url.searchParams.delete('lang');
      window.location.assign(`${pathname}${url.search}${url.hash}`);
      return;
    }
    apply();
  }

  function register(page, translations) {
    extraPages[page] = translations;
    if (!activePage) activePage = page;
  }

  function activate(page) {
    activePage = page;
    apply();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('langSelect');
    select?.addEventListener('change', () => setLanguage(select.value));
    apply();
  }, { once: true });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    if (sharedRoute()) return;
    const nextLanguage = readLanguage();
    if (nextLanguage === language) return;
    language = nextLanguage;
    apply();
  });

  window.JakhI18n = {
    activate,
    apply,
    format,
    get lang() { return language; },
    register,
    setLanguage,
    t: message,
  };
})();
