(function () {
  'use strict';

  const STORAGE_KEY = 'jakh-riddles-settings';

  const COMMON = {
    en: {
      language: 'Language',
      navHome: 'Home',
      navMindLab: 'Mind Lab',
      navCollections: 'Collections',
      navGames: 'Games',
      skipMain: 'Skip to main content',
      footerNote: 'All rights reserved to JAKH 2026',
      footerCollections: 'Collections',
      footerAbout: 'About & content standards',
      footerInfoLabel: 'JAKH information',
      quickActionsLabel: 'Quick actions',
      languageControlsLabel: 'Language controls',
      brandHomeLabel: 'JAKH Riddles home',
      instagramLabel: 'JAKH Riddles on Instagram',
      facebookLabel: 'JAKH Riddles on Facebook',
      socialImageAlt: 'JAKH — 3,553 bilingual riddles across 56 topics and 10 games',
      englishLabel: 'English',
      arabicLabel: 'العربية',
    },
    ar: {
      language: 'اللغة',
      navHome: 'الرئيسية',
      navMindLab: 'مختبر العقول',
      navCollections: 'المجموعات',
      navGames: 'الألعاب',
      skipMain: 'انتقل إلى المحتوى الرئيسي',
      footerNote: 'جميع الحقوق محفوظة لـ JAKH 2026',
      footerCollections: 'المجموعات',
      footerAbout: 'عن JAKH ومعايير المحتوى',
      footerInfoLabel: 'معلومات JAKH',
      quickActionsLabel: 'روابط سريعة',
      languageControlsLabel: 'خيارات اللغة',
      brandHomeLabel: 'الصفحة الرئيسية لألغاز JAKH',
      instagramLabel: 'ألغاز JAKH على إنستغرام',
      facebookLabel: 'ألغاز JAKH على فيسبوك',
      socialImageAlt: 'JAKH — 3,553 لغزاً ثنائي اللغة ضمن 56 موضوعاً و10 ألعاب',
      englishLabel: 'English',
      arabicLabel: 'العربية',
    },
  };

  const PAGES = {
    collections: {
      en: {
        metaTitle: 'Riddles & Quiz Collections in English and Arabic | JAKH',
        metaDescription: 'Explore focused JAKH collections of riddles, kids questions, logic puzzles, general knowledge, football, and nostalgia quizzes in English and Arabic.',
        collectionsEyebrow: 'Focused ways to play',
        collectionsTitle: 'Riddles and quiz collections',
        collectionsIntro: 'Start with a focused collection, reveal each answer at your own pace, then continue into the full 3,553-question Mind Lab.',
        collectionClassicMeta: '16 questions · Classic Riddles',
        collectionClassicTitle: '16 Riddles With Answers in English & Arabic',
        collectionClassicText: 'Start with approachable clues, then work up to trickier classics. Reveal each answer only after you have made your best guess.',
        collectionKidsMeta: '16 questions · Kids Riddles',
        collectionKidsTitle: '16 Kids’ Riddles With Answers | English & Arabic',
        collectionKidsText: 'These friendly riddles use familiar objects, simple numbers, and clear clues. Guess first, then reveal the answer together.',
        collectionLogicMeta: '16 questions · Logic Puzzles',
        collectionLogicTitle: '16 Logic Puzzles With Answers and Explanations',
        collectionLogicText: 'Work through 16 logic puzzles that reward careful reading, deduction, and a little arithmetic. Each answer includes the key reasoning.',
        collectionGeneralMeta: '16 questions · General Knowledge',
        collectionGeneralTitle: '16 General Knowledge Quiz Questions & Answers',
        collectionGeneralText: 'Test what you know across geography, history, science, animals, arts, food, music, and money with one balanced 16-question quiz.',
        collectionSpacetoonMeta: '16 questions · Spacetoon Classics',
        collectionSpacetoonTitle: 'Spacetoon Classics Quiz: 16 Nostalgia Questions',
        collectionSpacetoonText: 'How much do you remember from classic Arabic-dubbed cartoons? Test your memory across Treasure Island, Sally, Maruko, Remi, and Tom and Jerry.',
        collectionFootballMeta: '16 questions · Football',
        collectionFootballTitle: 'Football Rules & Tactics Quiz: 16 Questions',
        collectionFootballText: 'Check your understanding of football laws, restarts, match terms, transfers, and tactics in one practical 16-question challenge.',
      },
      ar: {
        metaTitle: 'مجموعات ألغاز واختبارات بالعربية والإنجليزية | JAKH',
        metaDescription: 'استكشف مجموعات JAKH المختارة من الألغاز وأسئلة الأطفال والمنطق والمعلومات العامة وكرة القدم وذكريات سبيستون بالعربية والإنجليزية.',
        collectionsEyebrow: 'طرق مركزة للعب',
        collectionsTitle: 'مجموعات الألغاز والاختبارات',
        collectionsIntro: 'ابدأ بمجموعة مركزة، واكشف كل إجابة بالسرعة التي تناسبك، ثم واصل اللعب في مختبر العقول الذي يضم 3,553 سؤالاً.',
        collectionClassicMeta: '16 سؤالاً · ألغاز كلاسيكية',
        collectionClassicTitle: '16 لغزاً مع الحل بالعربية والإنجليزية',
        collectionClassicText: 'ابدأ بألغاز سهلة الاقتراب ثم انتقل إلى ألغاز كلاسيكية أصعب. حاول الوصول إلى أفضل تخمين قبل كشف الإجابة.',
        collectionKidsMeta: '16 سؤالاً · ألغاز للأطفال',
        collectionKidsTitle: '16 لغزاً للأطفال مع الحل | عربي وإنجليزي',
        collectionKidsText: 'ألغاز ودية تعتمد على أشياء مألوفة وأرقام بسيطة وتلميحات واضحة. خمنوا أولاً، ثم اكشفوا الإجابة معاً.',
        collectionLogicMeta: '16 سؤالاً · ألغاز منطقية',
        collectionLogicTitle: '16 لغزاً منطقياً مع الحل والشرح',
        collectionLogicText: 'حل 16 لغزاً منطقياً تكافئ القراءة المتأنية والاستنتاج وبعض الحساب. تتضمن كل إجابة الفكرة الأساسية للحل.',
        collectionGeneralMeta: '16 سؤالاً · معلومات عامة',
        collectionGeneralTitle: '16 سؤالاً عاماً مع الأجوبة للمسابقات',
        collectionGeneralText: 'اختبر معلوماتك في الجغرافيا والتاريخ والعلوم والحيوانات والفنون والطعام والموسيقى والعملات ضمن اختبار متوازن من 16 سؤالاً.',
        collectionSpacetoonMeta: '16 سؤالاً · كلاسيكيات سبيستون',
        collectionSpacetoonTitle: 'اختبار سبيستون: 16 سؤالاً من ذكريات الطفولة',
        collectionSpacetoonText: 'كم تتذكر من الرسوم المتحركة الكلاسيكية المدبلجة للعربية؟ اختبر ذاكرتك مع جزيرة الكنز وسالي وماروكو وريمي وتوم وجيري.',
        collectionFootballMeta: '16 سؤالاً · كرة القدم',
        collectionFootballTitle: 'اختبار قوانين وخطط كرة القدم: 16 سؤالاً',
        collectionFootballText: 'اختبر فهمك لقوانين كرة القدم واستئناف اللعب ومصطلحات المباريات والانتقالات والخطط ضمن تحدٍ عملي من 16 سؤالاً.',
      },
    },
    about: {
      en: {
        metaTitle: 'About JAKH & Our Content Standards',
        metaDescription: 'Learn how JAKH organizes, reviews, translates, and improves its 3,553 bilingual questions, plus how to report a correction.',
        aboutEyebrow: 'About JAKH',
        aboutTitle: 'A friendly bilingual place to think, learn, and play',
        aboutIntro: 'JAKH is a free English-and-Arabic riddle, quiz, and browser-game website. The library currently includes 3,553 question cards mapped into 56 topics and five clear sections.',
        standardsOrganizedTitle: 'How content is organized',
        standardsOrganizedText: 'Every question belongs to one category, one practical subtopic, and one difficulty level. Related categories and focused collections help people move through the library without a maze of overlapping pages.',
        standardsTranslationTitle: 'Review and translation',
        standardsTranslationText: 'Questions require complete English and Arabic prompts and answers. Automated audits catch missing fields, taxonomy drift, and exact duplicates; high-traffic collections receive an additional meaning and answer-parity review before publication.',
        standardsAccuracyTitle: 'Accuracy and corrections',
        standardsAccuracyText: 'Evergreen facts are preferred. Time-sensitive facts and professional topics need extra review. You can flag an individual card from its share/report controls or send a correction through the suggestion box in the <a href="/mind-lab">Mind Lab</a>.',
        standardsBoundariesTitle: 'Educational boundaries',
        standardsBoundariesText: 'JAKH is for learning and entertainment. Medical, legal, financial, pharmacy, and psychology questions are not professional advice and should not be used to make personal decisions.',
        standardsIndependenceTitle: 'Independence',
        standardsIndependenceText: 'Fan-made quizzes are clearly labelled and do not imply affiliation, endorsement, or ownership of third-party names or marks. JAKH does not use unlicensed character artwork in its focused collections.',
        standardsConnectedTitle: 'Stay connected',
        standardsConnectedText: 'Follow <a class="social-link" rel="me noopener noreferrer" href="https://www.instagram.com/jakhriddles/">JAKH Riddles on Instagram</a> and <a class="social-link" rel="me noopener noreferrer" href="https://www.facebook.com/profile.php?id=61588921894305">JAKH Riddles on Facebook</a> for new riddles and site updates.',
      },
      ar: {
        metaTitle: 'عن JAKH ومعايير المحتوى',
        metaDescription: 'تعرّف إلى طريقة تنظيم JAKH ومراجعة وترجمة وتحسين 3,553 سؤالاً ثنائي اللغة، وكيفية الإبلاغ عن تصحيح.',
        aboutEyebrow: 'عن JAKH',
        aboutTitle: 'مساحة ثنائية اللغة للتفكير والتعلم واللعب',
        aboutIntro: 'JAKH موقع مجاني للألغاز والاختبارات وألعاب المتصفح بالعربية والإنجليزية. تضم المكتبة حالياً 3,553 بطاقة سؤال موزعة على 56 موضوعاً وخمسة أقسام واضحة.',
        standardsOrganizedTitle: 'كيف ننظم المحتوى',
        standardsOrganizedText: 'ينتمي كل سؤال إلى فئة واحدة وموضوع فرعي عملي ومستوى صعوبة محدد. تساعد الفئات المرتبطة والمجموعات المركزة على استكشاف المكتبة من دون متاهة من الصفحات المتداخلة.',
        standardsTranslationTitle: 'المراجعة والترجمة',
        standardsTranslationText: 'يجب أن يتضمن كل سؤال نصاً وإجابة مكتملين بالعربية والإنجليزية. تكشف المراجعات الآلية الحقول الناقصة وانحراف التصنيف والتكرار التام، كما تخضع المجموعات الأكثر زيارة لمراجعة إضافية للمعنى وتطابق الإجابات قبل النشر.',
        standardsAccuracyTitle: 'الدقة والتصحيحات',
        standardsAccuracyText: 'نفضّل الحقائق الثابتة، بينما تتطلب المعلومات المتغيرة والموضوعات المهنية مراجعة إضافية. يمكنك الإبلاغ عن بطاقة بعينها من أدوات المشاركة والإبلاغ، أو إرسال تصحيح عبر صندوق الاقتراحات في <a href="/mind-lab">مختبر العقول</a>.',
        standardsBoundariesTitle: 'الحدود التعليمية',
        standardsBoundariesText: 'يقدم JAKH محتوى للتعلم والترفيه. لا تُعد أسئلة الطب أو القانون أو المال أو الصيدلة أو علم النفس نصيحة مهنية، ولا ينبغي استخدامها لاتخاذ قرارات شخصية.',
        standardsIndependenceTitle: 'الاستقلالية',
        standardsIndependenceText: 'تُعرّف الاختبارات المصنوعة من المعجبين بوضوح، ولا تعني وجود ارتباط أو تأييد أو ملكية لأسماء أو علامات تخص جهات أخرى. ولا يستخدم JAKH رسومات شخصيات غير مرخصة في مجموعاته المركزة.',
        standardsConnectedTitle: 'ابقَ على تواصل',
        standardsConnectedText: 'تابع <a class="social-link" rel="me noopener noreferrer" href="https://www.instagram.com/jakhriddles/">ألغاز JAKH على إنستغرام</a> و<a class="social-link" rel="me noopener noreferrer" href="https://www.facebook.com/profile.php?id=61588921894305">ألغاز JAKH على فيسبوك</a> لمعرفة الألغاز الجديدة وتحديثات الموقع.',
      },
    },
    notFound: {
      en: {
        metaTitle: 'Page Not Found | JAKH Riddles',
        metaDescription: 'The page could not be found. Return to JAKH or browse the bilingual riddle categories.',
        notFoundTitle: 'Page not found',
        notFoundText: 'That page does not exist or may have moved. Head back home to find what you are looking for.',
        notFoundHome: 'Back to home',
        notFoundBrowse: 'Browse categories',
      },
      ar: {
        metaTitle: 'الصفحة غير موجودة | ألغاز JAKH',
        metaDescription: 'تعذر العثور على الصفحة. عد إلى JAKH أو تصفح فئات الألغاز ثنائية اللغة.',
        notFoundTitle: 'الصفحة غير موجودة',
        notFoundText: 'هذه الصفحة غير موجودة أو ربما نُقلت. عد إلى الصفحة الرئيسية للعثور على ما تبحث عنه.',
        notFoundHome: 'العودة إلى الرئيسية',
        notFoundBrowse: 'تصفح الفئات',
      },
    },
  };

  let activePage = document.body?.dataset.i18nPage || '';
  let extraPages = {};

  function normalizeLanguage(value) {
    return value === 'ar' ? 'ar' : 'en';
  }

  function readLanguage() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return normalizeLanguage(saved.lang);
    } catch (_) {
      return 'en';
    }
  }

  function saveLanguage(nextLanguage) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const settings = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      settings.lang = normalizeLanguage(nextLanguage);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  function consumeRequestedLanguage() {
    try {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get('lang');
      if (requested !== 'en' && requested !== 'ar') return null;
      saveLanguage(requested);
      url.searchParams.delete('lang');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      return requested;
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
