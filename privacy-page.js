(() => {
  'use strict';

  const API_ORIGIN = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? `${location.protocol}//${location.hostname}:8787`
    : 'https://api.jakh.net';
  const API_URL = `${API_ORIGIN}/api`;
  const LANGUAGE_KEY = 'jakh-privacy-language';
  const PRIVACY_ROUTES = Object.freeze({ en: '/privacy', ar: '/ar/privacy/' });
  const PRIVACY_REQUEST_TYPES = new Set([
    'access',
    'correction',
    'deletion-help',
    'objection',
    'other',
  ]);

  const copy = Object.freeze({
    en: {
      title: 'Privacy Centre | JAKH',
      description: 'Control analytics, export your JAKH account data, permanently delete your account, and read the bilingual JAKH privacy notice.',
      languageLabel: 'Language',
      deviceUnset: 'No current choice is saved. Website analytics remains denied by default.',
      deviceAllowed: 'Optional website analytics is allowed on this device.',
      deviceDenied: 'Only essential features are active. Future analytics is disabled and known analytics browser data was cleared where the browser permits.',
      deviceDeniedAfterLoad: 'Future analytics is disabled, the injected loader was removed, and known analytics browser data was cleared where possible. Analytics code already executed on this page cannot be undone; reload to finish with a clean page.',
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
      privacyRequestLinkChecking: 'Checking whether account linking is available. You can send this request unlinked now.',
      privacyRequestLinkReady: 'Account linking is available and remains off unless you tick the checkbox.',
      privacyRequestLinkSignedOut: 'This request will remain unlinked. Sign in first if you want it included in account export and deletion.',
      privacyRequestLinkUnavailable: 'Account linking could not be checked. You can still send this request unlinked.',
      privacyRequestInvalidType: 'Choose a valid privacy request type.',
      privacyRequestInvalidText: 'Enter between 5 and 2,000 characters of request details.',
      privacyRequestInvalidEmail: 'Enter a valid reply email or leave the email field empty.',
      privacyRequestSending: 'Sending your privacy request…',
      privacyRequestDone: 'Your privacy request was accepted.',
      privacyRequestFailed: 'The privacy request could not be sent. Your entries are still here; please try again.',
      privacyRequestAuthFailed: 'Account linking failed because the sign-in is no longer active. Sign in again, or send the request without linking it.',
      privacyRequestRateLimited: 'Too many privacy requests were sent from this network. Please wait before retrying.',
    },
    ar: {
      title: 'مركز الخصوصية | JAKH',
      description: 'تحكّم في القياس، ونزّل بيانات حساب JAKH، واحذف حسابك نهائياً، واقرأ إشعار الخصوصية ثنائي اللغة.',
      languageLabel: 'اللغة',
      deviceUnset: 'لا يوجد اختيار حالي محفوظ. يبقى قياس الموقع مرفوضاً افتراضياً.',
      deviceAllowed: 'القياس الاختياري للموقع مسموح على هذا الجهاز.',
      deviceDenied: 'الميزات الأساسية فقط مفعّلة. تم إيقاف القياس اللاحق ومسح بيانات القياس المعروفة في المتصفح حيث يسمح المتصفح.',
      deviceDeniedAfterLoad: 'تم إيقاف القياس اللاحق وإزالة أداة التحميل ومسح بيانات القياس المعروفة حيث أمكن. لا يمكن التراجع عن برنامج القياس الذي نُفذ بالفعل في هذه الصفحة؛ أعد تحميلها لإكمال الإيقاف بصفحة نظيفة.',
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
      privacyRequestLinkChecking: 'يجري التحقق من توفر ربط الحساب. يمكنك إرسال هذا الطلب الآن من دون ربطه.',
      privacyRequestLinkReady: 'ربط الحساب متاح وسيبقى متوقفاً ما لم تحدد مربع الاختيار.',
      privacyRequestLinkSignedOut: 'سيبقى هذا الطلب غير مرتبط. سجّل الدخول أولاً إذا أردت تضمينه في تصدير الحساب وحذفه.',
      privacyRequestLinkUnavailable: 'تعذر التحقق من ربط الحساب. ما زال بإمكانك إرسال الطلب من دون ربطه.',
      privacyRequestInvalidType: 'اختر نوعاً صالحاً لطلب الخصوصية.',
      privacyRequestInvalidText: 'أدخل تفاصيل الطلب في نص يتراوح بين 5 و2,000 حرف.',
      privacyRequestInvalidEmail: 'أدخل بريداً صالحاً للرد أو اترك حقل البريد فارغاً.',
      privacyRequestSending: 'جارٍ إرسال طلب الخصوصية…',
      privacyRequestDone: 'تم قبول طلب الخصوصية.',
      privacyRequestFailed: 'تعذر إرسال طلب الخصوصية. ما زالت مدخلاتك موجودة؛ حاول مرة أخرى.',
      privacyRequestAuthFailed: 'تعذر ربط الحساب لأن جلسة الدخول لم تعد نشطة. سجّل الدخول من جديد أو أرسل الطلب من دون ربطه.',
      privacyRequestRateLimited: 'أُرسلت طلبات خصوصية كثيرة من هذه الشبكة. انتظر قبل إعادة المحاولة.',
    },
  });

  const state = {
    lang: 'en',
    user: null,
    privacy: null,
    accountMode: 'checking',
    accountStatusOverride: '',
    accountStatusTone: '',
    deviceReloadRecommended: false,
  };

  const elements = {};

  function normalizePrivacyPath(pathname) {
    let normalized = String(pathname || '/').replace(/\/{2,}/g, '/');
    normalized = normalized.replace(/\/index(?:\.html)?$/i, '/').replace(/\.html$/i, '');
    if (normalized !== '/') normalized = normalized.replace(/\/+$/, '');
    return normalized || '/';
  }

  function privacyRouteLanguage(pathname = location.pathname) {
    const normalized = normalizePrivacyPath(pathname);
    if (normalized === normalizePrivacyPath(PRIVACY_ROUTES.ar)) return 'ar';
    if (normalized === normalizePrivacyPath(PRIVACY_ROUTES.en)) return 'en';
    return '';
  }

  function localizePrivacyLinks() {
    const sharedRoutes = new Map([
      ['/', { en: '/', ar: '/ar/' }],
      ['/mind-lab', { en: '/mind-lab', ar: '/ar/mind-lab/' }],
      ['/collections', { en: '/collections', ar: '/ar/collections/' }],
      ['/about', { en: '/about', ar: '/ar/about/' }],
      ['/privacy', PRIVACY_ROUTES],
    ]);
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      try {
        const url = new URL(href, location.origin);
        if (url.origin !== location.origin) return;
        const normalized = normalizePrivacyPath(url.pathname);
        const route = [...sharedRoutes.values()].find((candidate) => (
          normalizePrivacyPath(candidate.en) === normalized || normalizePrivacyPath(candidate.ar) === normalized
        ));
        if (!route) return;
        url.searchParams.delete('lang');
        link.setAttribute('href', `${route[state.lang]}${url.search}${url.hash}`);
      } catch {
        // Leave malformed or non-navigation values unchanged.
      }
    });
  }

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
    elements.privacyRequestType?.querySelectorAll('option').forEach((option) => {
      option.textContent = state.lang === 'ar'
        ? option.dataset.labelAr || option.textContent
        : option.dataset.labelEn || option.textContent;
    });
  }

  function updateDeviceStatus() {
    const localized = currentCopy();
    const preference = window.JakhPrivacy?.getPreference?.() || null;
    const message = !preference
      ? localized.deviceUnset
      : preference.analytics
        ? localized.deviceAllowed
        : state.deviceReloadRecommended
          ? localized.deviceDeniedAfterLoad
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

    const canLinkPrivacyRequest = state.accountMode === 'signed-in' && Boolean(state.user);
    elements.privacyRequestSaveWithAccount.disabled = !canLinkPrivacyRequest;
    if (!canLinkPrivacyRequest) elements.privacyRequestSaveWithAccount.checked = false;
    const privacyRequestLinkMessage = canLinkPrivacyRequest
      ? localized.privacyRequestLinkReady
      : state.accountMode === 'checking'
        ? localized.privacyRequestLinkChecking
        : state.accountMode === 'unavailable'
          ? localized.privacyRequestLinkUnavailable
          : localized.privacyRequestLinkSignedOut;
    setStatus(elements.privacyRequestLinkStatus, privacyRequestLinkMessage);

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
      url.searchParams.delete('lang');
      location.assign(`${PRIVACY_ROUTES[state.lang]}${url.search}${url.hash}`);
      return;
    }
    localizePrivacyLinks();
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

  function handleConsentChange(event) {
    state.deviceReloadRecommended = event?.detail?.reloadRecommended === true;
    updateDeviceStatus();
  }

  async function clearDeviceData() {
    const localized = currentCopy();
    if (!window.confirm(localized.clearConfirm)) return;
    setStatus(elements.deviceClearStatus, localized.clearingDevice, 'success');
    try {
      window.JakhPrivacy?.setAnalyticsConsent?.(false, 'clear-device');
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } finally {
      const url = new URL(PRIVACY_ROUTES[state.lang], location.origin);
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

  function privacyRequestValidationIssue() {
    const localized = currentCopy();
    if (!PRIVACY_REQUEST_TYPES.has(elements.privacyRequestType.value)) {
      return {
        field: elements.privacyRequestType,
        message: localized.privacyRequestInvalidType,
      };
    }
    const text = elements.privacyRequestText.value.trim();
    if (text.length < 5 || text.length > 2000) {
      return {
        field: elements.privacyRequestText,
        message: localized.privacyRequestInvalidText,
      };
    }
    const email = elements.privacyRequestEmail.value.trim();
    if (email && !elements.privacyRequestEmail.validity.valid) {
      return {
        field: elements.privacyRequestEmail,
        message: localized.privacyRequestInvalidEmail,
      };
    }
    return null;
  }

  async function submitPrivacyRequest(event) {
    event.preventDefault();
    const localized = currentCopy();
    const formFields = [
      elements.privacyRequestType,
      elements.privacyRequestText,
      elements.privacyRequestEmail,
    ];
    formFields.forEach((field) => field.removeAttribute('aria-invalid'));
    const validationIssue = privacyRequestValidationIssue();
    if (validationIssue) {
      validationIssue.field.setAttribute('aria-invalid', 'true');
      validationIssue.field.focus();
      setStatus(elements.privacyRequestStatus, validationIssue.message, 'error');
      return;
    }

    const saveWithAccount = elements.privacyRequestSaveWithAccount.checked;
    elements.privacyRequestSubmit.disabled = true;
    elements.privacyRequestSubmit.setAttribute('aria-busy', 'true');
    setStatus(elements.privacyRequestStatus, localized.privacyRequestSending);
    try {
      const response = await apiRequest('/privacy/requests', {
        method: 'POST',
        body: JSON.stringify({
          type: elements.privacyRequestType.value,
          text: elements.privacyRequestText.value.trim(),
          email: elements.privacyRequestEmail.value.trim() || null,
          saveWithAccount,
        }),
      });
      if (response?.privacyRequest?.accepted !== true) throw new Error('Request not accepted');
      elements.privacyRequestForm.reset();
      updateAccountPresentation();
      setStatus(elements.privacyRequestStatus, localized.privacyRequestDone, 'success');
    } catch (error) {
      if (error?.status === 401 && saveWithAccount) {
        state.user = null;
        state.privacy = null;
        state.accountMode = 'signed-out';
        updateAccountPresentation();
        setStatus(elements.privacyRequestStatus, localized.privacyRequestAuthFailed, 'error');
      } else if (error?.status === 429) {
        setStatus(elements.privacyRequestStatus, localized.privacyRequestRateLimited, 'error');
      } else {
        setStatus(elements.privacyRequestStatus, localized.privacyRequestFailed, 'error');
      }
    } finally {
      elements.privacyRequestSubmit.disabled = false;
      elements.privacyRequestSubmit.removeAttribute('aria-busy');
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
    elements.privacyRequestForm = document.getElementById('privacyRequestForm');
    elements.privacyRequestType = document.getElementById('privacyRequestType');
    elements.privacyRequestText = document.getElementById('privacyRequestText');
    elements.privacyRequestEmail = document.getElementById('privacyRequestEmail');
    elements.privacyRequestSaveWithAccount = document.getElementById('privacyRequestSaveWithAccount');
    elements.privacyRequestLinkStatus = document.getElementById('privacyRequestLinkStatus');
    elements.privacyRequestSubmit = document.getElementById('privacyRequestSubmit');
    elements.privacyRequestStatus = document.getElementById('privacyRequestStatus');
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
    elements.privacyRequestForm.addEventListener('submit', submitPrivacyRequest);
    document.addEventListener('jakh:consentchange', handleConsentChange);
  }

  function initialLanguage() {
    const url = new URL(location.href);
    const requested = url.searchParams.get('lang');
    if (requested === 'ar' || requested === 'en') {
      url.searchParams.delete('lang');
      const target = `${PRIVACY_ROUTES[requested]}${url.search}${url.hash}`;
      if (privacyRouteLanguage(url.pathname) !== requested) location.replace(target);
      else history.replaceState(null, '', target);
      return requested;
    }
    const routeLanguage = privacyRouteLanguage();
    if (routeLanguage) return routeLanguage;
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
