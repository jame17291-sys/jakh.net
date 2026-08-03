export function ensureAuthModalShell() {
  if (!document.getElementById('openAuthBtn') || document.getElementById('authModal')) return;
  const modal = document.createElement('div');
  modal.id = 'authModal';
  modal.className = 'modal hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="auth"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
      <div class="modal-head">
        <div><p class="eyebrow" data-i18n="authEyebrow">Profile</p><h2 id="authModalTitle" data-i18n="authTitle">Create account or sign in</h2></div>
        <button class="icon-btn" type="button" data-close-modal="auth" aria-label="Close" data-i18n-aria-label="close">×</button>
      </div>
      <div id="authModalBody"></div>
    </div>`;
  document.body.appendChild(modal);
}

export function enhancePasswordInputs({ root, language, translate }) {
  const capsLockStatus = root.querySelector('#authCapsLockStatus');
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.nextElementSibling?.classList.contains('password-toggle')) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.textContent = language === 'ar' ? 'إظهار' : 'Show';
    toggle.setAttribute('aria-label', translate('showPassword'));
    toggle.setAttribute('aria-pressed', 'false');
    input.insertAdjacentElement('afterend', toggle);
    toggle.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      toggle.textContent = reveal
        ? (language === 'ar' ? 'إخفاء' : 'Hide')
        : (language === 'ar' ? 'إظهار' : 'Show');
      toggle.setAttribute('aria-label', translate(reveal ? 'hidePassword' : 'showPassword'));
      toggle.setAttribute('aria-pressed', String(reveal));
      input.focus();
    });
    const reportCapsLock = (event) => {
      if (capsLockStatus) capsLockStatus.textContent = event.getModifierState?.('CapsLock') ? translate('capsLockOn') : '';
    };
    input.addEventListener('keydown', reportCapsLock);
    input.addEventListener('keyup', reportCapsLock);
    input.addEventListener('blur', () => { if (capsLockStatus) capsLockStatus.textContent = ''; });
  });
}
