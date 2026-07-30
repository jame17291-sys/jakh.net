(function () {
  'use strict';

  var STORAGE_KEY = 'jakh-riddles-settings';
  var COMMON = {
    en: {
      language: 'Language',
      languageControlsLabel: 'Language controls',
      quickActionsLabel: 'Quick actions',
      brandHomeLabel: 'JAKH Riddles home',
      navHome: 'Home',
      navCategories: 'Categories',
      navGamesBack: '← Games',
      skipMain: 'Skip to main content',
      footerNote: 'All rights reserved to JAKH 2026',
      footerCollections: 'Collections',
      footerAbout: 'About & content standards',
      footerInfoLabel: 'JAKH information',
      instagramName: 'Instagram',
      facebookName: 'Facebook',
      instagramLabel: 'JAKH Riddles on Instagram',
      facebookLabel: 'JAKH Riddles on Facebook',
      socialImageAlt: 'JAKH — 3,553 bilingual riddles across 56 topics and 10 games'
    },
    ar: {
      language: 'اللغة',
      languageControlsLabel: 'خيارات اللغة',
      quickActionsLabel: 'روابط سريعة',
      brandHomeLabel: 'الصفحة الرئيسية لألغاز JAKH',
      navHome: 'الرئيسية',
      navCategories: 'الفئات',
      navGamesBack: 'الألعاب ←',
      skipMain: 'انتقل إلى المحتوى الرئيسي',
      footerNote: 'جميع الحقوق محفوظة لـ JAKH 2026',
      footerCollections: 'المجموعات',
      footerAbout: 'عن JAKH ومعايير المحتوى',
      footerInfoLabel: 'معلومات JAKH',
      instagramName: 'إنستغرام',
      facebookName: 'فيسبوك',
      instagramLabel: 'ألغاز JAKH على إنستغرام',
      facebookLabel: 'ألغاز JAKH على فيسبوك',
      socialImageAlt: 'JAKH — 3,553 لغزاً ثنائي اللغة ضمن 56 موضوعاً و10 ألعاب'
    }
  };

  var activeGame = '';
  var games = {};
  var listeners = [];

  function normalizeLanguage(value) {
    return value === 'ar' ? 'ar' : 'en';
  }

  function readSettings() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function persistLanguage(nextLanguage) {
    try {
      var settings = readSettings();
      settings.lang = normalizeLanguage(nextLanguage);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  function consumeRequestedLanguage() {
    try {
      var url = new URL(window.location.href);
      var requested = url.searchParams.get('lang');
      if (requested !== 'en' && requested !== 'ar') return null;
      persistLanguage(requested);
      url.searchParams.delete('lang');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      return requested;
    } catch (_) {
      return null;
    }
  }

  var language = consumeRequestedLanguage() || normalizeLanguage(readSettings().lang);

  function gameMessages(game) {
    return games[game || activeGame] || { en: {}, ar: {} };
  }

  function resolveMessage(key, lang) {
    var normalized = normalizeLanguage(lang || language);
    var page = gameMessages();
    return page[normalized] && page[normalized][key] !== undefined
      ? page[normalized][key]
      : COMMON[normalized] && COMMON[normalized][key] !== undefined
        ? COMMON[normalized][key]
        : page.en && page.en[key] !== undefined
          ? page.en[key]
          : COMMON.en[key] !== undefined
            ? COMMON.en[key]
            : key;
  }

  function t(key, values, lang) {
    var normalized = normalizeLanguage(lang || language);
    var resolved = resolveMessage(key, normalized);
    if (typeof resolved === 'function') {
      return String(resolved(values || {}, normalized));
    }
    return String(resolved).replace(/\{(\w+)\}/g, function (_, token) {
      return String(values && values[token] !== undefined ? values[token] : '');
    });
  }

  function number(value, options, lang) {
    try {
      return new Intl.NumberFormat(normalizeLanguage(lang || language), options || {
        useGrouping: false
      }).format(value);
    } catch (_) {
      return String(value);
    }
  }

  function applyMetadata() {
    var title = resolveMessage('metaTitle', language);
    if (title !== 'metaTitle') document.title = String(title);

    var description = resolveMessage('metaDescription', language);
    if (description !== 'metaDescription') {
      var descriptionText = String(description);
      var descriptionMeta = document.querySelector('meta[name="description"]');
      if (descriptionMeta) descriptionMeta.setAttribute('content', descriptionText);
      var ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) ogDescription.setAttribute('content', descriptionText);
      var twitterDescription = document.querySelector('meta[name="twitter:description"]');
      if (twitterDescription) twitterDescription.setAttribute('content', descriptionText);
    }

    var socialTitle = resolveMessage('metaTitle', language);
    if (socialTitle !== 'metaTitle') {
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', String(socialTitle));
      var twitterTitle = document.querySelector('meta[name="twitter:title"]');
      if (twitterTitle) twitterTitle.setAttribute('content', String(socialTitle));
    }

    var socialImageAlt = resolveMessage('socialImageAlt', language);
    var ogImageAlt = document.querySelector('meta[property="og:image:alt"]');
    if (ogImageAlt) ogImageAlt.setAttribute('content', String(socialImageAlt));
    var twitterImageAlt = document.querySelector('meta[name="twitter:image:alt"]');
    if (twitterImageAlt) twitterImageAlt.setAttribute('content', String(socialImageAlt));
  }

  function apply(root) {
    var scope = root || document;
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

    scope.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (node) {
      node.innerHTML = t(node.dataset.i18nHtml);
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(function (node) {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      node.setAttribute('title', t(node.dataset.i18nTitle));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
      node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
    });

    var select = document.getElementById('langSelect');
    if (select) select.value = language;
    applyMetadata();

    listeners.slice().forEach(function (listener) {
      try {
        listener({ lang: language, dir: document.documentElement.dir });
      } catch (error) {
        setTimeout(function () { throw error; }, 0);
      }
    });

    document.dispatchEvent(new CustomEvent('jakh:game-languagechange', {
      detail: { lang: language, dir: document.documentElement.dir, game: activeGame }
    }));
  }

  function setLanguage(nextLanguage) {
    language = normalizeLanguage(nextLanguage);
    persistLanguage(language);
    apply();
  }

  function register(game, messages) {
    games[game] = messages || { en: {}, ar: {} };
    activeGame = game;
    if (document.readyState !== 'loading') apply();
  }

  function onChange(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    return function () {
      listeners = listeners.filter(function (candidate) {
        return candidate !== listener;
      });
    };
  }

  function bindControls() {
    var select = document.getElementById('langSelect');
    if (select && select.dataset.gameI18nBound !== 'true') {
      select.dataset.gameI18nBound = 'true';
      select.addEventListener('change', function () {
        setLanguage(select.value);
      });
    }
  }

  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

  document.addEventListener('DOMContentLoaded', function () {
    bindControls();
    apply();
  }, { once: true });

  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY) return;
    var nextLanguage = normalizeLanguage(readSettings().lang);
    if (nextLanguage === language) return;
    language = nextLanguage;
    apply();
  });

  window.JakhGameI18n = {
    apply: apply,
    number: number,
    onChange: onChange,
    register: register,
    setLanguage: setLanguage,
    t: t,
    get dir() { return language === 'ar' ? 'rtl' : 'ltr'; },
    get lang() { return language; }
  };
})();
