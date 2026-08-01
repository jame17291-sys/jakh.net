(() => {
  'use strict';

  const STORAGE_KEY = 'jakh-consent-v1';
  const CONSENT_VERSION = 2;
  const NOTICE_VERSION = '2026-08-01';
  const ANALYTICS_ID = 'G-VQZQNK6VSV';
  const ANALYTICS_SCRIPT_ID = 'jakhGoogleAnalyticsScript';
  const ANALYTICS_DISABLE_KEY = `ga-disable-${ANALYTICS_ID}`;
  const BANNER_ID = 'privacyConsentBanner';
  const FIXED_UI_GAP_PX = 8;
  let analyticsLoaded = false;
  let analyticsExecutedThisPage = false;
  let analyticsLibraryReady = false;
  let volatilePreference = null;
  let fixedUiFrame = 0;
  let fixedUiSignature = '';
  let fixedUiObservedElements = new Set();
  const fixedUiResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => scheduleFixedUiLayout())
    : null;

  const ANALYTICS_STORAGE_KEY = /^(?:_ga(?:_|$)|_gid$|_gat(?:_|$)|_gac_|_gcl_|AMP_TOKEN$|__ut)/u;

  function visibleHeight(element) {
    if (!element || element.hidden) return 0;
    return Math.max(0, Math.ceil(element.getBoundingClientRect().height));
  }

  function updateFixedUiLayout() {
    fixedUiFrame = 0;
    const bottomNav = document.getElementById('bottomNav');
    const installBanner = document.getElementById('installBanner');
    const privacyBanner = document.getElementById(BANNER_ID);
    const bottomNavHeight = visibleHeight(bottomNav);
    const installBannerHeight = visibleHeight(installBanner);
    const privacyBannerHeight = visibleHeight(privacyBanner);
    const installStackHeight = installBannerHeight > 0
      ? installBannerHeight + FIXED_UI_GAP_PX
      : 0;
    const privacyStackHeight = privacyBannerHeight > 0
      ? privacyBannerHeight + FIXED_UI_GAP_PX
      : 0;
    const contentInset = bottomNavHeight + installStackHeight + privacyStackHeight;
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty('--jakh-bottom-nav-height', `${bottomNavHeight}px`);
    rootStyle.setProperty('--jakh-install-banner-height', `${installBannerHeight}px`);
    rootStyle.setProperty('--jakh-install-stack-height', `${installStackHeight}px`);
    rootStyle.setProperty('--jakh-privacy-banner-height', `${privacyBannerHeight}px`);
    rootStyle.setProperty('--jakh-fixed-content-inset', `${contentInset}px`);

    const nextObservedElements = new Set([bottomNav, installBanner, privacyBanner].filter(Boolean));
    fixedUiObservedElements.forEach((element) => {
      if (!nextObservedElements.has(element)) fixedUiResizeObserver?.unobserve(element);
    });
    nextObservedElements.forEach((element) => {
      if (!fixedUiObservedElements.has(element)) fixedUiResizeObserver?.observe(element);
    });
    fixedUiObservedElements = nextObservedElements;

    const signature = [bottomNavHeight, installBannerHeight, privacyBannerHeight].join(':');
    if (signature !== fixedUiSignature) {
      fixedUiSignature = signature;
      document.dispatchEvent(new CustomEvent('jakh:fixeduilayout', {
        detail: {
          bottomNavHeight,
          installBannerHeight,
          privacyBannerHeight,
          contentInset,
        },
      }));
    }
  }

  function scheduleFixedUiLayout() {
    if (fixedUiFrame) cancelAnimationFrame(fixedUiFrame);
    fixedUiFrame = requestAnimationFrame(updateFixedUiLayout);
  }

  window.JakhFixedUi = Object.freeze({ refresh: scheduleFixedUiLayout });
  window.addEventListener('resize', scheduleFixedUiLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleFixedUiLayout, { passive: true });

  function readPreference() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (
        !value
        || value.version !== CONSENT_VERSION
        || value.noticeVersion !== NOTICE_VERSION
        || typeof value.analytics !== 'boolean'
      ) {
        return volatilePreference;
      }
      return value;
    } catch {
      return volatilePreference;
    }
  }

  function analyticsAllowed() {
    return readPreference()?.analytics === true;
  }

  function consentPayload(analytics) {
    return {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: analytics ? 'granted' : 'denied',
    };
  }

  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  function loadAnalytics() {
    const existingScript = document.getElementById(ANALYTICS_SCRIPT_ID);
    if (analyticsLoaded && existingScript) return;
    analyticsLoaded = true;
    window[ANALYTICS_DISABLE_KEY] = false;
    ensureGtag();
    if (analyticsLibraryReady) {
      window.gtag('consent', 'update', consentPayload(true));
      return;
    }
    analyticsExecutedThisPage = true;
    window.gtag('consent', 'default', consentPayload(false));
    window.gtag('consent', 'update', consentPayload(true));
    window.gtag('set', {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    window.gtag('js', new Date());
    window.gtag('config', ANALYTICS_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    const script = document.createElement('script');
    script.id = ANALYTICS_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
    script.dataset.jakhAnalytics = 'true';
    script.dataset.analyticsProvider = 'google-analytics';
    script.addEventListener('load', () => {
      analyticsLibraryReady = true;
    }, { once: true });
    script.addEventListener('error', () => {
      analyticsLoaded = false;
      script.remove();
    }, { once: true });
    document.head.appendChild(script);
  }

  function expireCookie(name) {
    const hostname = location.hostname.replace(/^www\./u, '');
    const domainAttributes = [
      '',
      `; Domain=${location.hostname}`,
      `; Domain=.${location.hostname}`,
      hostname ? `; Domain=${hostname}` : '',
      hostname ? `; Domain=.${hostname}` : '',
    ];
    for (const domain of new Set(domainAttributes)) {
      try {
        document.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/${domain}; SameSite=Lax`;
      } catch {
        // Cookie access may be blocked by browser policy.
      }
    }
  }

  function clearAnalyticsStorage(storageName) {
    try {
      const storage = window[storageName];
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key && ANALYTICS_STORAGE_KEY.test(key)) storage.removeItem(key);
      }
    } catch {
      // Storage can be blocked independently from the saved consent choice.
    }
  }

  function disableAnalytics() {
    window[ANALYTICS_DISABLE_KEY] = true;
    if (window.gtag) window.gtag('consent', 'update', consentPayload(false));
    document.getElementById(ANALYTICS_SCRIPT_ID)?.remove();
    document.querySelectorAll('script[data-jakh-analytics="true"]').forEach((script) => script.remove());
    analyticsLoaded = false;

    try {
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim();
        if (name && ANALYTICS_STORAGE_KEY.test(name)) expireCookie(name);
      }
    } catch {
      // Cookie access may be blocked by browser policy.
    }
    clearAnalyticsStorage('localStorage');
    clearAnalyticsStorage('sessionStorage');
  }

  function applyPreference(preference) {
    if (preference?.analytics) {
      loadAnalytics();
      return;
    }
    disableAnalytics();
  }

  function updateChoiceControls() {
    const preference = readPreference();
    document.querySelectorAll('[data-analytics-consent]').forEach((control) => {
      const enabled = preference?.analytics === true;
      if (control instanceof HTMLInputElement) {
        control.checked = enabled;
      } else {
        const requested = control.dataset.analyticsConsent;
        const selected = requested === 'grant' ? enabled : requested === 'deny' && !enabled;
        control.setAttribute('aria-pressed', String(selected));
        control.dataset.consentState = preference ? (enabled ? 'granted' : 'denied') : 'default-denied';
      }
    });
    document.querySelectorAll('[data-consent-status]').forEach((node) => {
      const isAr = document.documentElement.lang === 'ar';
      node.textContent = preference
        ? (preference.analytics
          ? (isAr ? 'القياس الاختياري مفعّل' : 'Optional analytics is on')
          : (isAr ? 'القياس الاختياري متوقف' : 'Optional analytics is off'))
        : (isAr ? 'القياس متوقف افتراضياً حتى تختار' : 'Analytics is denied by default until you choose');
    });
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
    scheduleFixedUiLayout();
  }

  function setAnalyticsConsent(analytics, source = 'privacy-controls') {
    const preference = {
      version: CONSENT_VERSION,
      noticeVersion: NOTICE_VERSION,
      analytics: Boolean(analytics),
      updatedAt: new Date().toISOString(),
    };
    volatilePreference = preference;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
    } catch {
      // The choice still applies to the current page when storage is blocked.
    }
    applyPreference(preference);
    removeBanner();
    updateChoiceControls();
    document.dispatchEvent(new CustomEvent('jakh:consentchange', {
      detail: {
        analytics: preference.analytics,
        source,
        reloadRecommended: !preference.analytics && analyticsExecutedThisPage,
      },
    }));
    return preference;
  }

  function bannerCopy() {
    const isAr = document.documentElement.lang === 'ar';
    return isAr ? {
      title: 'خصوصيتك أولاً',
      text: 'تعمل الميزات الأساسية من دون قياس. يمكنك السماح بقياس إجمالي اختياري يساعدنا على تحسين JAKH، أو الاكتفاء بالميزات الأساسية.',
      allow: 'السماح بالقياس',
      essential: 'الأساسي فقط',
      choices: 'خيارات الخصوصية',
      label: 'خيارات الخصوصية',
      dismiss: 'إغلاق والاكتفاء بالميزات الأساسية',
    } : {
      title: 'Your privacy comes first',
      text: 'Essential features work without analytics. You can allow optional aggregate website measurement to help improve JAKH, or keep only essential features.',
      allow: 'Allow analytics',
      essential: 'Essential only',
      choices: 'Privacy choices',
      label: 'Privacy choices',
      dismiss: 'Dismiss and keep essential only',
    };
  }

  function showBanner() {
    if (readPreference() || document.getElementById(BANNER_ID)) return;
    const copy = bannerCopy();
    const banner = document.createElement('aside');
    banner.id = BANNER_ID;
    banner.className = 'privacy-consent-banner';
    banner.setAttribute('aria-label', copy.label);
    banner.setAttribute('aria-describedby', 'privacyConsentCopy');
    banner.innerHTML = `
      <button type="button" class="privacy-consent-dismiss" data-consent-action="dismiss" aria-label="${copy.dismiss}">×</button>
      <div class="privacy-consent-copy" id="privacyConsentCopy">
        <strong>${copy.title}</strong>
        <p>${copy.text}</p>
      </div>
      <div class="privacy-consent-actions">
        <button type="button" class="primary-btn mini-btn" data-consent-action="allow">${copy.allow}</button>
        <button type="button" class="secondary-btn mini-btn" data-consent-action="essential">${copy.essential}</button>
        <a class="text-btn mini-btn" href="/privacy#choices">${copy.choices}</a>
      </div>`;
    banner.querySelector('[data-consent-action="allow"]')?.addEventListener('click', () => {
      setAnalyticsConsent(true, 'consent-banner');
    });
    banner.querySelector('[data-consent-action="essential"]')?.addEventListener('click', () => {
      setAnalyticsConsent(false, 'consent-banner');
    });
    banner.querySelector('[data-consent-action="dismiss"]')?.addEventListener('click', () => {
      setAnalyticsConsent(false, 'consent-banner-dismiss');
    });
    document.body.appendChild(banner);
    scheduleFixedUiLayout();
  }

  function bindChoiceControls() {
    document.querySelectorAll('[data-analytics-consent]').forEach((control) => {
      if (control.dataset.consentBound === 'true') return;
      control.dataset.consentBound = 'true';
      if (control instanceof HTMLInputElement) {
        control.addEventListener('change', () => setAnalyticsConsent(control.checked));
        return;
      }
      control.addEventListener('click', () => {
        const requested = control.dataset.analyticsConsent;
        if (requested === 'grant' || requested === 'deny') {
          setAnalyticsConsent(requested === 'grant');
        }
      });
    });
    updateChoiceControls();
  }

  function initialize() {
    applyPreference(readPreference());
    bindChoiceControls();
    showBanner();
    scheduleFixedUiLayout();
  }

  window.JakhPrivacy = Object.freeze({
    analyticsAllowed,
    getPreference: readPreference,
    setAnalyticsConsent,
    showChoices: () => {
      location.assign('/privacy#choices');
    },
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }

  document.addEventListener('jakh:languagechange', () => {
    if (!readPreference()) {
      removeBanner();
      showBanner();
    }
    updateChoiceControls();
  });
})();
