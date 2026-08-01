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
      footerPrivacy: 'Privacy Centre',
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
      footerPrivacy: 'مركز الخصوصية',
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

  var SHARED_LANGUAGE_ROUTES = [
    { en: '/', ar: '/ar/' },
    { en: '/mind-lab', ar: '/ar/mind-lab/' },
    { en: '/collections', ar: '/ar/collections/' },
    { en: '/play', ar: '/ar/play/' },
    { en: '/about', ar: '/ar/about/' },
    { en: '/privacy', ar: '/ar/privacy/' }
  ];
  ['chess', 'mastermind', 'go', 'reversi', 'codenames', 'catan', 'backgammon', 'set', 'hanabi', 'diplomacy']
    .forEach(function (slug) {
      SHARED_LANGUAGE_ROUTES.push({ en: '/' + slug, ar: '/ar/games/' + slug + '/' });
    });

  function normalizeRoutePath(pathname) {
    var normalized = String(pathname || '/').replace(/\/{2,}/g, '/');
    normalized = normalized.replace(/\/index(?:\.html)?$/i, '/').replace(/\.html$/i, '');
    if (normalized !== '/') normalized = normalized.replace(/\/+$/, '');
    return normalized || '/';
  }

  function sharedRoute(pathname) {
    var normalized = normalizeRoutePath(pathname || window.location.pathname);
    for (var index = 0; index < SHARED_LANGUAGE_ROUTES.length; index += 1) {
      var route = SHARED_LANGUAGE_ROUTES[index];
      if (normalizeRoutePath(route.en) === normalized) return { en: route.en, ar: route.ar, lang: 'en' };
      if (normalizeRoutePath(route.ar) === normalized) return { en: route.en, ar: route.ar, lang: 'ar' };
    }
    return null;
  }

  function routeForLanguage(pathname, lang) {
    var route = sharedRoute(pathname);
    return route ? route[normalizeLanguage(lang)] : '';
  }

  function localizedHref(href, lang) {
    try {
      var url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return href;
      var pathname = routeForLanguage(url.pathname, lang);
      if (!pathname) return href;
      url.searchParams.delete('lang');
      return pathname + url.search + url.hash;
    } catch (_) {
      return href;
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function (registration) {
          registration.update().catch(function () {});
        })
        .catch(function () {});
    } catch (_) {}
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
      var route = sharedRoute(url.pathname);
      if (requested === 'en' || requested === 'ar') {
        persistLanguage(requested);
        url.searchParams.delete('lang');
        var pathname = route ? route[requested] : url.pathname;
        var target = pathname + url.search + url.hash;
        if (normalizeRoutePath(pathname) !== normalizeRoutePath(url.pathname)) window.location.replace(target);
        else window.history.replaceState(null, '', target);
        return requested;
      }
      return route ? route.lang : null;
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
    scope.querySelectorAll('a[href]').forEach(function (node) {
      var href = node.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      var localized = localizedHref(href, language);
      if (localized !== href) node.setAttribute('href', localized);
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
    var pathname = routeForLanguage(window.location.pathname, language);
    if (pathname) {
      var url = new URL(window.location.href);
      url.searchParams.delete('lang');
      window.location.assign(pathname + url.search + url.hash);
      return;
    }
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
  registerServiceWorker();

  document.addEventListener('DOMContentLoaded', function () {
    bindControls();
    apply();
  }, { once: true });

  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY) return;
    if (sharedRoute()) return;
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
