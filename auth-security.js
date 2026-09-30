// Authenticator material stays in this dialog's memory and is removed on close.
// API responses must never be persisted, sent to analytics, or logged.
let stylesheetPromise;
function loadSecurityStyles() {
  if (stylesheetPromise) return stylesheetPromise;
  stylesheetPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/auth-security.css';
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      link.remove(); stylesheetPromise = undefined;
      reject(new Error('Could not load account security. Please try again.'));
    }, { once: true });
    document.head.append(link);
  });
  return stylesheetPromise;
}
export async function openAdminSecurity({ api, language = 'en', onVerified = () => {}, onPasswordChange = () => {}, onSignIn = () => {} }) {
  await loadSecurityStyles();
  const arabic = language === 'ar';
  const copy = arabic ? {
    title: 'حماية حساب الإدارة', loading: 'جارٍ التحقق من حماية الحساب…', cancel: 'إلغاء',
    setup: 'أضف حساب Riddle Arabia إلى تطبيق المصادقة. ستحتاج رمزًا من التطبيق عند دخول الإدارة.',
    password: 'كلمة المرور الحالية', begin: 'إعداد تطبيق المصادقة',
    secret: 'مفتاح الإعداد اليدوي', add: 'أدخل هذا المفتاح في تطبيق المصادقة كرمز زمني، من 6 أرقام يتغير كل 30 ثانية. ثم أدخل الرمز الظاهر في التطبيق.',
    code: 'رمز تطبيق المصادقة', verify: 'تأكيد الرمز', challenge: 'أدخل رمز تطبيق المصادقة المكوّن من 6 أرقام، أو أحد رموز الاسترداد المحفوظة.',
    recoveryCode: 'رمز المصادقة أو الاسترداد', save: 'احفظ رموز الاسترداد الآن',
    backup: 'يُستخدم كل رمز مرة واحدة بدلًا من رمز التطبيق. احفظها في مدير كلمات المرور أو في مكان آمن خارج هذا الجهاز. لن تظهر مرة أخرى.',
    saved: 'حفظت رموز الاسترداد في مكان آمن', continue: 'متابعة إلى الإدارة',
    enabled: 'تطبيق المصادقة مفعّل وتم التحقق من هذه الجلسة.', replace: 'استبدال تطبيق المصادقة ورموز الاسترداد',
    replaceNote: 'سيبقى التطبيق الحالي صالحًا حتى تأكيد التطبيق الجديد. بعد التأكيد تتوقف رموز الاسترداد القديمة وتنتهي صلاحية التحقق في الجلسات الأخرى.',
    rotation: 'غيّر كلمة مرورك أولًا إلى عبارة فريدة من 15 حرفًا على الأقل، ثم عُد لإعداد التطبيق.',
    change: 'تغيير كلمة المرور', failed: 'تعذر إكمال العملية. حاول مرة أخرى.',
    invalid: 'الرمز غير صحيح أو انتهت صلاحيته أو سبق استخدامه. انتظر رمزًا جديدًا ثم حاول.',
    expired: 'انتهت مهلة الإعداد. أغلق النافذة وابدأ من جديد.',
    passwordWrong: 'كلمة المرور الحالية غير صحيحة.', limited: 'محاولات كثيرة. انتظر 15 دقيقة ثم حاول.', retry: 'المحاولة مجددًا', restart: 'بدء الإعداد من جديد', sessionExpired: 'انتهت جلسة الدخول. سجّل الدخول مجددًا للمتابعة.', signIn: 'تسجيل الدخول مجددًا',
  } : {
    title: 'Protect administrator access', loading: 'Checking account security…', cancel: 'Cancel',
    setup: 'Add Riddle Arabia to an authenticator app. You will need a code from it when entering administration.',
    password: 'Current password', begin: 'Set up authenticator', secret: 'Manual setup key',
    add: 'Enter this key in your authenticator as a time-based code: 6 digits, changing every 30 seconds. Then enter the code shown by the app.',
    code: 'Authenticator code', verify: 'Verify code', challenge: 'Enter the 6-digit code from your authenticator, or one of your saved recovery codes.',
    recoveryCode: 'Authenticator or recovery code', save: 'Save your recovery codes now',
    backup: 'Each code can be used once in place of an app code. Save them in a password manager or a safe place outside this device. They will not be shown again.',
    saved: 'I have saved these recovery codes safely', continue: 'Continue to administration',
    enabled: 'Your authenticator is enabled and this session is verified.', replace: 'Replace authenticator and recovery codes',
    replaceNote: 'Your current authenticator stays active until the new one is confirmed. Confirmation replaces old recovery codes and clears verification in your other sessions.',
    rotation: 'First change your password to a unique passphrase of at least 15 characters, then return to set up your authenticator.',
    change: 'Change password', failed: 'The request could not be completed. Please try again.',
    invalid: 'The code is incorrect, expired, or already used. Wait for a new code and try again.',
    expired: 'Setup expired. Close this dialog and start again.', passwordWrong: 'Your current password is incorrect.',
    limited: 'Too many attempts. Wait 15 minutes and try again.', retry: 'Try again', restart: 'Start setup again', sessionExpired: 'Your session expired. Sign in again to continue.', signIn: 'Sign in again',
  };
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'auth-security-dialog';
  dialog.dir = arabic ? 'rtl' : 'ltr';
  dialog.lang = arabic ? 'ar' : 'en';
  const titleId = `auth-security-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', titleId);
  let finished = false;
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  let view = 'loading';
  let setupSecret = '';
  let recoveryCodes = [];
  let verified = false;
  let busy = false;
  const finish = (success) => {
    if (finished) return;
    finished = true;
    setupSecret = ''; recoveryCodes = [];
    dialog.replaceChildren(); dialog.close(); dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
    resolveResult(success);
    if (success) onVerified();
  };
  const element = (tag, text, attributes = {}) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
  };
  const isExpiredSession = (error) => ['UNAUTHORIZED', 'ADMIN_SESSION_EXPIRED'].includes(error.code);
  const showExpiredSession = (container) => {
    container.textContent = copy.sessionExpired;
    const signIn = element('button', copy.signIn, { type: 'button' });
    signIn.addEventListener('click', () => { finish(false); onSignIn(); });
    container.append(document.createElement('br'), signIn);
  };
  function render() {
    if (finished) return;
    dialog.replaceChildren();
    const form = element('form');
    const title = element('h2', view === 'backup' ? copy.save : copy.title, { id: titleId, tabindex: '-1' });
    form.append(title);
    const error = element('p', '', { role: 'alert', class: 'auth-security-error' });
    const description = element('p', copy[view === 'setup' ? 'setup' : view === 'confirm' ? 'add' : view === 'verify' ? 'challenge' : view === 'backup' ? 'backup' : view === 'enabled' ? 'enabled' : 'loading']);
    form.append(description);
    const addInput = (labelText, type, name, autocomplete) => {
      const label = element('label', labelText);
      const input = element('input', '', { type, name, autocomplete, required: '', spellcheck: 'false', autocapitalize: 'none' });
      if (name === 'code') { input.dir = 'ltr'; input.maxLength = 32; }
      if (view === 'confirm') { input.inputMode = 'numeric'; input.pattern = '[0-9]{6}'; input.maxLength = 6; }
      label.append(input); form.append(label); return input;
    };
    if (view === 'setup') addInput(copy.password, 'password', 'password', 'current-password');
    if (view === 'confirm') {
      form.append(element('p', copy.secret));
      form.append(element('code', setupSecret, { class: 'auth-security-secret', dir: 'ltr' }));
      addInput(copy.code, 'text', 'code', 'one-time-code');
    }
    if (view === 'verify') addInput(copy.recoveryCode, 'text', 'code', 'one-time-code');
    if (view === 'backup') {
      const list = element('ul', '', { class: 'auth-security-codes', dir: 'ltr' });
      recoveryCodes.forEach((code) => { const item = element('li'); item.append(element('code', code)); list.append(item); });
      form.append(list);
      const label = element('label', '', { class: 'auth-security-acknowledgement' });
      label.append(element('input', '', { type: 'checkbox', required: '', name: 'saved' }), document.createTextNode(copy.saved));
      form.append(label);
    }
    if (view === 'enabled') {
      form.append(element('p', copy.replaceNote));
      const replace = element('button', copy.replace, { type: 'button' });
      replace.addEventListener('click', () => { view = 'setup'; render(); });
      form.append(replace);
    }
    form.append(error);
    const actions = element('div', '', { class: 'auth-security-actions' });
    const cancel = element('button', copy.cancel, { type: 'button' });
    cancel.addEventListener('click', () => finish(false));
    actions.append(cancel);
    if (view !== 'loading') actions.append(element('button', view === 'setup' ? copy.begin : ['backup', 'enabled'].includes(view) ? copy.continue : copy.verify, { type: 'submit', class: 'auth-security-primary' }));
    form.append(actions); dialog.append(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      if (view === 'enabled' || view === 'backup') { finish(verified); return; }
      const data = new FormData(form);
      const payload = view === 'setup' ? { password: String(data.get('password') || '') } : { code: String(data.get('code') || '') };
      // Remove entered credentials from the DOM immediately after reading them.
      form.querySelectorAll('input').forEach((input) => { input.value = ''; });
      busy = true; form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      error.textContent = '';
      try {
        const endpoint = view === 'setup' ? 'setup' : view === 'confirm' ? 'confirm' : 'verify';
        const response = await api(`/user/security/${endpoint}`, { method: 'POST', body: JSON.stringify(payload) });
        if (finished) return;
        if (view === 'setup') { setupSecret = response.secret; view = 'confirm'; }
        else if (view === 'confirm') { setupSecret = ''; recoveryCodes = response.recoveryCodes; verified = true; view = 'backup'; }
        else { finish(true); return; }
        render();
      } catch (requestError) {
        if (finished) return;
        if (isExpiredSession(requestError)) {
          showExpiredSession(error);
        } else if (requestError.code === 'PASSWORD_ROTATION_REQUIRED') {
          error.textContent = copy.rotation;
          const change = element('button', copy.change, { type: 'button' });
          change.addEventListener('click', () => { finish(false); onPasswordChange(); });
          error.append(document.createElement('br'), change);
        } else {
          error.textContent = ({ MFA_CODE_INVALID: copy.invalid, MFA_SETUP_EXPIRED: copy.expired,
            CURRENT_PASSWORD_INCORRECT: copy.passwordWrong, RATE_LIMITED: copy.limited })[requestError.code] || copy.failed;
          if (requestError.code === 'MFA_SETUP_EXPIRED') {
            const restart = element('button', copy.restart, { type: 'button' });
            restart.addEventListener('click', () => { setupSecret = ''; view = 'setup'; render(); });
            error.append(document.createElement('br'), restart);
          }
        }
        form.querySelector('input')?.focus();
      } finally {
        payload.password = undefined; payload.code = undefined;
        busy = false;
        form.removeAttribute('aria-busy');
        form.querySelectorAll('button').forEach((button) => { button.disabled = false; });
      }
    });
    queueMicrotask(() => { if (!finished) (form.querySelector('input') || title).focus(); });
  }
  dialog.addEventListener('cancel', (event) => {
    // Keep one-time backup codes visible until the user explicitly acknowledges
    // or closes them; Escape does not accidentally dismiss this handoff.
    event.preventDefault();
    if (!busy && view !== 'backup') finish(false);
  });
  document.body.append(dialog); render(); dialog.showModal();
  async function loadStatus() {
    try {
      view = 'loading'; render();
      const status = await api('/user/security');
      if (!finished) { verified = status.verified; view = status.enabled ? (verified ? 'enabled' : 'verify') : 'setup'; render(); }
    } catch (error) {
      if (!finished) {
        const message = dialog.querySelector('[role="alert"]');
        if (message) {
          if (isExpiredSession(error)) { showExpiredSession(message); return; }
          message.textContent = error.code === 'RATE_LIMITED' ? copy.limited : copy.failed;
          const retry = element('button', copy.retry, { type: 'button' });
          retry.addEventListener('click', () => { void loadStatus(); });
          message.append(document.createElement('br'), retry);
        }
      }
    }
  }
  await loadStatus();
  return result;
}
