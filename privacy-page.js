(() => {
  'use strict';

  const API_ORIGIN = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? `${location.protocol}//${location.hostname}:8787`
    : 'https://api.jakh.net';
  const API_URL = `${API_ORIGIN}/api`;
  const LANGUAGE_KEY = 'jakh-privacy-language';

  const copy = Object.freeze({
    en: {
      title: 'Privacy Centre | JAKH',
      description: 'Control analytics, export your JAKH account data, permanently delete your account, and read the bilingual JAKH privacy notice.',
      languageLabel: 'Language',
      deviceUnset: 'No device analytics choice has been saved yet.',
      deviceAllowed: 'Optional website analytics is allowed on this device.',
      deviceDenied: 'Only essential features are active on this device.',
      deviceUnavailable: 'Privacy controls are temporarily unavailable. No new analytics choice was saved.',
      clearConfirm: 'Clear JAKH preferences, local progress, favorites, and privacy choice from this browser?',
      clearingDevice: 'Device data will be cleared and this page will reopen.',
      accountCheckingTitle: 'Account controls are checking your existing session',
      accountCheckingText: 'No account data is changed by this check.',
      signedOutTitle: 'You are not signed in on this browser',
      signedOutText: 'Sign in from the JAKH home page, then return here to manage account data.',
      signedInTitle: 'Account controls are ready',
      signedInText: (username) => `Signed in as ${username}.`,
      accountUnavailableTitle: 'Account controls could not connect',
      accountUnavailableText: 'Nothing was changed. Please try again later.',
      analyticsAllowed: 'Account learning-time analytics is allowed.',
      analyticsDenied: 'Account learning-time analytics is off.',
      analyticsRenewal: 'A previous choice expired after the privacy notice changed. Analytics remains off until you choose again.',
      analyticsSavedAllowed: 'Account analytics is now allowed.',
      analyticsSavedDenied: 'Account analytics is off and existing account time analytics was deleted.',
      actionFailed: 'The request could not be completed. Nothing was changed.',
      exportReady: 'Your account export was downloaded.',
      exportFailed: 'The export could not be prepared. Please try again.',
      deleteMissing: 'Enter your exact username, current password, and tick the permanent-deletion confirmation.',
      deleteUsernameMismatch: (username) => `The username must exactly match ${username}.`,
      deleteConfirm: 'Permanently delete this JAKH account and all account-linked data? This cannot be undone.',
      deleteDone: 'The account and account-linked data were permanently deleted.',
      deleteFailed: 'The account was not deleted. Check the username and current password, then try again.',
      usernamePlaceholder: 'Exact username',
      passwordPlaceholder: 'Current password',
    },
    ar: {
      title: 'مركز الخصوصية | JAKH',
      description: 'تحكّم في القياس، ونزّل بيانات حساب JAKH، واحذف حسابك نهائياً، واقرأ إشعار الخصوصية ثنائي اللغة.',
      languageLabel: 'اللغة',
      deviceUnset: 'لم يتم حفظ اختيار لقياس الجهاز بعد.',
      deviceAllowed: 'القياس الاختياري للموقع مسموح على هذا الجهاز.',
      deviceDenied: 'الميزات الأساسية فقط مفعّلة على هذا الجهاز.',
      deviceUnavailable: 'أدوات الخصوصية غير متاحة مؤقتاً. لم يتم حفظ اختيار جديد.',
      clearConfirm: 'هل تريد مسح تفضيلات JAKH والتقدّم المحلي والمفضلة وخيار الخصوصية من هذا المتصفح؟',
      clearingDevice: 'سيتم مسح بيانات الجهاز ثم إعادة فتح هذه الصفحة.',
      accountCheckingTitle: 'تتحقق أدوات الحساب من جلسة الدخول الحالية',
      accountCheckingText: 'لا يغيّر هذا الفحص أي بيانات في الحساب.',
      signedOutTitle: 'لم تسجّل الدخول في هذا المتصفح',
      signedOutText: 'سجّل الدخول من صفحة JAKH الرئيسية، ثم عُد إلى هنا لإدارة بيانات الحساب.',
      signedInTitle: 'أدوات الحساب جاهزة',
      signedInText: (username) => `الحساب المسجّل: ${username}.`,
      accountUnavailableTitle: 'تعذر اتصال أدوات الحساب',
      accountUnavailableText: 'لم يتغير شيء. حاول مرة أخرى لاحقاً.',
      analyticsAllowed: 'قياس وقت التعلّم للحساب مسموح.',
      analyticsDenied: 'قياس وقت التعلّم للحساب متوقف.',
      analyticsRenewal: 'انتهى اختيار سابق بعد تغيير إشعار الخصوصية. يبقى القياس متوقفاً حتى تختار من جديد.',
      analyticsSavedAllowed: 'تم السماح بقياس الحساب.',
      analyticsSavedDenied: 'تم إيقاف قياس الحساب وحذف قياسات وقت الحساب الحالية.',
      actionFailed: 'تعذر إكمال الطلب. لم يتغير شيء.',
      exportReady: 'تم تنزيل نسخة بيانات حسابك.',
      exportFailed: 'تعذر إعداد ملف التصدير. حاول مرة أخرى.',
      deleteMissing: 'أدخل اسم المستخدم كما هو وكلمة المرور الحالية وحدد تأكيد الحذف النهائي.',
      deleteUsernameMismatch: (username) => `يجب أن يطابق اسم المستخدم ${username} تماماً.`,
      deleteConfirm: 'هل تريد حذف حساب JAKH هذا وجميع البيانات المرتبطة به نهائياً؟ لا يمكن التراجع عن ذلك.',
      deleteDone: 'تم حذف الحساب والبيانات المرتبطة به نهائياً.',
      deleteFailed: 'لم يتم حذف الحساب. تحقق من اسم المستخدم وكلمة المرور الحالية ثم حاول مرة أخرى.',
      usernamePlaceholder: 'اسم المستخدم كما هو',
      passwordPlaceholder: 'كلمة المرور الحالية',
    },
  });

  const state = {
    lang: 'en',
    user: null,
    privacy: null,
    accountMode: 'checking',
    accountStatusOverride: '',
    accountStatusTone: '',
  };

  const elements = {};

  function currentCopy() {
    return copy[state.lang];
  }

  function setStatus(element, message, tone = '') {
    if (!element) return;
    element.textContent = message || '';
    if (tone) element.dataset.tone = tone;
    else delete element.dataset.tone;
  }

  function updateMetadata() {
    const localized = currentCopy();
    document.title = localized.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', localized.description);
    elements.language?.setAttribute('aria-label', localized.languageLabel);
    elements.deleteUsername?.setAttribute('placeholder', localized.usernamePlaceholder);
    elements.deletePassword?.setAttribute('placeholder', localized.passwordPlaceholder);
  }

  function updateDeviceStatus() {
    const localized = currentCopy();
    const preference = window.JakhPrivacy?.getPreference?.() || null;
    const message = !preference
      ? localized.deviceUnset
      : preference.analytics
        ? localized.deviceAllowed
        : localized.deviceDenied;
    setStatus(elements.deviceConsentStatus, message, preference?.analytics ? 'success' : '');
  }

  function updateAccountPresentation() {
    const localized = currentCopy();
    let title = localized.accountCheckingTitle;
    let message = localized.accountCheckingText;

    if (state.accountMode === 'signed-out') {
      title = localized.signedOutTitle;
      message = localized.signedOutText;
    } else if (state.accountMode === 'signed-in' && state.user) {
      title = localized.signedInTitle;
      message = localized.signedInText(state.user.username);
    } else if (state.accountMode === 'unavailable') {
      title = localized.accountUnavailableTitle;
      message = localized.accountUnavailableText;
    } else if (state.accountMode === 'deleted') {
      title = localized.signedOutTitle;
      message = localized.deleteDone;
    }

    elements.accountStatusTitle.textContent = title;
    elements.accountStatusText.textContent = message;
    elements.accountControls.disabled = state.accountMode !== 'signed-in';
    elements.accountHomeLink.hidden = state.accountMode === 'signed-in';

    if (state.privacy) {
      const analyticsMessage = state.privacy.needsRenewal
        ? localized.analyticsRenewal
        : state.privacy.usageAnalyticsEnabled
          ? localized.analyticsAllowed
          : localized.analyticsDenied;
      setStatus(
        elements.accountAnalyticsStatus,
        state.accountStatusOverride || analyticsMessage,
        state.accountStatusTone || (state.privacy.usageAnalyticsEnabled ? 'success' : ''),
      );
    } else if (state.accountMode !== 'signed-in') {
      setStatus(elements.accountAnalyticsStatus, '');
    }
  }

  function setLanguage(language, updateUrl = true) {
    const nextLanguage = language === 'ar' ? 'ar' : 'en';
    if (state.lang !== nextLanguage) {
      state.accountStatusOverride = '';
      state.accountStatusTone = '';
    }
    state.lang = nextLanguage;
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    elements.language.value = state.lang;
    try {
      localStorage.setItem(LANGUAGE_KEY, state.lang);
    } catch {
      // Language still applies for this page view when storage is unavailable.
    }
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('lang', state.lang);
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    updateMetadata();
    updateDeviceStatus();
    updateAccountPresentation();
    document.dispatchEvent(new CustomEvent('jakh:languagechange', {
      detail: { language: state.lang },
    }));
  }

  async function apiRequest(endpoint, options = {}) {
    const requestOptions = {
      ...options,
      credentials: 'include',
      headers: new Headers(options.headers || {}),
    };
    requestOptions.headers.set('Accept', 'application/json');
    if (requestOptions.body && !requestOptions.headers.has('Content-Type')) {
      requestOptions.headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${API_URL}${endpoint}`, requestOptions);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : null;
    if (!response.ok) {
      const error = new Error(payload?.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = payload?.code || `HTTP_${response.status}`;
      throw error;
    }
    return payload;
  }

  async function loadAccount() {
    state.accountMode = 'checking';
    updateAccountPresentation();
    try {
      const user = await apiRequest('/user/profile');
      const privacyResponse = await apiRequest('/user/privacy');
      state.user = user;
      state.privacy = privacyResponse.privacy;
      state.accountMode = 'signed-in';
    } catch (error) {
      state.user = null;
      state.privacy = null;
      state.accountMode = error?.status === 401 ? 'signed-out' : 'unavailable';
    }
    updateAccountPresentation();
  }

  function setDeviceAnalytics(allowed) {
    const localized = currentCopy();
    if (!window.JakhPrivacy?.setAnalyticsConsent) {
      setStatus(elements.deviceConsentStatus, localized.deviceUnavailable, 'error');
      return;
    }
    window.JakhPrivacy.setAnalyticsConsent(Boolean(allowed), 'privacy-centre');
    updateDeviceStatus();
  }

  async function clearDeviceData() {
    const localized = currentCopy();
    if (!window.confirm(localized.clearConfirm)) return;
    setStatus(elements.deviceClearStatus, localized.clearingDevice, 'success');
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } finally {
      const url = new URL('/privacy', location.origin);
      url.searchParams.set('lang', state.lang);
      url.hash = 'choices';
      location.replace(url.toString());
    }
  }

  async function updateAccountAnalytics(allowed) {
    if (!state.user) return;
    const localized = currentCopy();
    elements.allowAccountAnalytics.disabled = true;
    elements.denyAccountAnalytics.disabled = true;
    state.accountStatusOverride = '';
    state.accountStatusTone = '';
    try {
      const response = await apiRequest('/user/privacy', {
        method: 'PUT',
        body: JSON.stringify({ analytics: allowed ? 'allowed' : 'denied' }),
      });
      state.privacy = response.privacy;
      state.accountStatusOverride = allowed
        ? localized.analyticsSavedAllowed
        : localized.analyticsSavedDenied;
      state.accountStatusTone = 'success';
    } catch {
      state.accountStatusOverride = localized.actionFailed;
      state.accountStatusTone = 'error';
    } finally {
      elements.allowAccountAnalytics.disabled = false;
      elements.denyAccountAnalytics.disabled = false;
      updateAccountPresentation();
    }
  }

  async function exportAccountData() {
    if (!state.user) return;
    const localized = currentCopy();
    elements.exportAccount.disabled = true;
    setStatus(elements.exportStatus, '');
    try {
      const payload = await apiRequest('/user/export');
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
        type: 'application/json',
      });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `jakh-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      setStatus(elements.exportStatus, localized.exportReady, 'success');
    } catch {
      setStatus(elements.exportStatus, localized.exportFailed, 'error');
    } finally {
      elements.exportAccount.disabled = false;
    }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    if (!state.user) return;
    const localized = currentCopy();
    const username = elements.deleteUsername.value;
    const currentPassword = elements.deletePassword.value;
    if (!username || !currentPassword || !elements.deleteConfirmation.checked) {
      setStatus(elements.deleteStatus, localized.deleteMissing, 'error');
      return;
    }
    if (username !== state.user.username) {
      setStatus(
        elements.deleteStatus,
        localized.deleteUsernameMismatch(state.user.username),
        'error',
      );
      return;
    }
    if (!window.confirm(localized.deleteConfirm)) return;

    elements.deleteAccount.disabled = true;
    setStatus(elements.deleteStatus, '');
    try {
      await apiRequest('/user/account', {
        method: 'DELETE',
        body: JSON.stringify({
          username,
          currentPassword,
          confirmPermanentDeletion: true,
        }),
      });
      elements.deleteAccountForm.reset();
      state.user = null;
      state.privacy = null;
      state.accountMode = 'deleted';
      setStatus(elements.deleteStatus, localized.deleteDone, 'success');
      updateAccountPresentation();
    } catch {
      setStatus(elements.deleteStatus, localized.deleteFailed, 'error');
    } finally {
      elements.deleteAccount.disabled = false;
    }
  }

  function cacheElements() {
    elements.language = document.getElementById('privacyLanguage');
    elements.deviceConsentStatus = document.getElementById('deviceConsentStatus');
    elements.deviceClearStatus = document.getElementById('deviceClearStatus');
    elements.allowDeviceAnalytics = document.getElementById('allowDeviceAnalytics');
    elements.denyDeviceAnalytics = document.getElementById('denyDeviceAnalytics');
    elements.clearDeviceData = document.getElementById('clearDeviceData');
    elements.accountStatusTitle = document.getElementById('accountStatusTitle');
    elements.accountStatusText = document.getElementById('accountStatusText');
    elements.accountHomeLink = document.getElementById('accountHomeLink');
    elements.accountControls = document.getElementById('accountControls');
    elements.allowAccountAnalytics = document.getElementById('allowAccountAnalytics');
    elements.denyAccountAnalytics = document.getElementById('denyAccountAnalytics');
    elements.accountAnalyticsStatus = document.getElementById('accountAnalyticsStatus');
    elements.exportAccount = document.getElementById('exportAccount');
    elements.exportStatus = document.getElementById('exportStatus');
    elements.deleteAccountForm = document.getElementById('deleteAccountForm');
    elements.deleteUsername = document.getElementById('deleteUsername');
    elements.deletePassword = document.getElementById('deletePassword');
    elements.deleteConfirmation = document.getElementById('deleteConfirmation');
    elements.deleteAccount = document.getElementById('deleteAccount');
    elements.deleteStatus = document.getElementById('deleteStatus');
  }

  function bindEvents() {
    elements.language.addEventListener('change', () => setLanguage(elements.language.value));
    elements.allowDeviceAnalytics.addEventListener('click', () => setDeviceAnalytics(true));
    elements.denyDeviceAnalytics.addEventListener('click', () => setDeviceAnalytics(false));
    elements.clearDeviceData.addEventListener('click', clearDeviceData);
    elements.allowAccountAnalytics.addEventListener('click', () => updateAccountAnalytics(true));
    elements.denyAccountAnalytics.addEventListener('click', () => updateAccountAnalytics(false));
    elements.exportAccount.addEventListener('click', exportAccountData);
    elements.deleteAccountForm.addEventListener('submit', deleteAccount);
    document.addEventListener('jakh:consentchange', updateDeviceStatus);
  }

  function initialLanguage() {
    const requested = new URL(location.href).searchParams.get('lang');
    if (requested === 'ar' || requested === 'en') return requested;
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      if (stored === 'ar' || stored === 'en') return stored;
    } catch {
      // Fall through to the browser language.
    }
    return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  }

  function initialize() {
    cacheElements();
    bindEvents();
    setLanguage(initialLanguage(), false);
    void loadAccount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
