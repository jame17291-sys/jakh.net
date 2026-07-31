(() => {
  'use strict';

  const STORAGE_KEY = 'jakh-consent-v1';
  const ANALYTICS_ID = 'G-VQZQNK6VSV';
  const BANNER_ID = 'privacyConsentBanner';
  let analyticsLoaded = false;
  let volatilePreference = null;

  function readPreference() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!value || value.version !== 1 || typeof value.analytics !== 'boolean') {
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
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    ensureGtag();
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
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
    script.dataset.jakhAnalytics = 'true';
    document.head.appendChild(script);
  }

  function applyPreference(preference) {
    if (preference?.analytics) {
      loadAnalytics();
      return;
    }
    if (window.gtag) window.gtag('consent', 'update', consentPayload(false));
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0]?.trim();
      if (!name || !/^_ga(?:_|$)/u.test(name)) continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.jakh.net; SameSite=Lax`;
    }
  }

  function updateChoiceControls() {
    const preference = readPreference();
    document.querySelectorAll('[data-analytics-consent]').forEach((control) => {
      const enabled = preference?.analytics === true;
      if (control instanceof HTMLInputElement) {
        control.checked = enabled;
      } else {
        const requested = control.dataset.analyticsConsent;
        const selected = preference
          ? (requested === 'grant' ? enabled : requested === 'deny' && !enabled)
          : false;
        control.setAttribute('aria-pressed', String(selected));
        control.dataset.consentState = preference ? (enabled ? 'granted' : 'denied') : 'unset';
      }
    });
    document.querySelectorAll('[data-consent-status]').forEach((node) => {
      const isAr = document.documentElement.lang === 'ar';
      node.textContent = preference
        ? (preference.analytics
          ? (isAr ? 'القياس الاختياري مفعّل' : 'Optional analytics is on')
          : (isAr ? 'القياس الاختياري متوقف' : 'Optional analytics is off'))
        : (isAr ? 'لم تختر بعد' : 'No choice saved yet');
    });
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  function setAnalyticsConsent(analytics, source = 'privacy-controls') {
    const preference = {
      version: 1,
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
      detail: { analytics: preference.analytics, source },
    }));
    return preference;
  }

  function bannerCopy() {
    const isAr = document.documentElement.lang === 'ar';
    return isAr ? {
      title: 'خصوصيتك أولاً',
      text: 'تعمل الميزات الأساسية من دون قياس. يمكنك السماح بقياس استخدام مجهول يساعدنا على تحسين JAKH، أو الاكتفاء بالميزات الأساسية.',
      allow: 'السماح بالقياس',
      essential: 'الأساسي فقط',
      choices: 'خيارات الخصوصية',
      label: 'خيارات الخصوصية',
    } : {
      title: 'Your privacy comes first',
      text: 'Essential features work without analytics. You can allow anonymous usage measurement to help improve JAKH, or keep only essential features.',
      allow: 'Allow analytics',
      essential: 'Essential only',
      choices: 'Privacy choices',
      label: 'Privacy choices',
    };
  }

  function showBanner() {
    if (readPreference() || document.getElementById(BANNER_ID)) return;
    const copy = bannerCopy();
    const banner = document.createElement('aside');
    banner.id = BANNER_ID;
    banner.className = 'privacy-consent-banner';
    banner.setAttribute('aria-label', copy.label);
    banner.innerHTML = `
      <div class="privacy-consent-copy">
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
    document.body.appendChild(banner);
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
