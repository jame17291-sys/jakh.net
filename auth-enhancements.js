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

// Account-only markup is downloaded when Profile opens; event handlers stay in app.js.
export function renderAccountPanel({
  account, language, role, score, correctCount, progress, categories, getCorrectCountByDifficulty,
  avatarSaving, securityLoading, privacyPath, t, fmt, escapeHtml,
}) {
    const easyCount = getCorrectCountByDifficulty('easy');
    const medCount = getCorrectCountByDifficulty('medium');
    const hardCount = getCorrectCountByDifficulty('hard');
    const advCount = getCorrectCountByDifficulty('very-advanced');
    const earnedBadges = [
      easyCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeBronze'))}">🥉 ${escapeHtml(t('badgeBronzeName'))}</span>` : '',
      medCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeSilver'))}">🥈 ${escapeHtml(t('badgeSilverName'))}</span>` : '',
      hardCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeGold'))}">🥇 ${escapeHtml(t('badgeGoldName'))}</span>` : '',
      advCount >= 10 ? `<span class="badge" title="${escapeHtml(t('badgeDiamond'))}">💎 ${escapeHtml(t('badgeDiamondName'))}</span>` : '',
    ].filter(Boolean).join(' ') || '<span class="muted">—</span>';

    const byCategory = {};
    progress.forEach(p => {
      const cat = p.categoryId && p.categoryId !== 'unknown' ? p.categoryId : null;
      if (!cat) return;
      if (!byCategory[cat]) byCategory[cat] = { correct: 0, wrong: 0 };
      if (p.status.startsWith('wrong-')) byCategory[cat].wrong++;
      else byCategory[cat].correct++;
    });
    const reportRows = Object.entries(byCategory).map(([cat, counts]) => {
      const category = categories.find(item => item.slug === cat);
      const categoryName = category?.title?.[language] || category?.title?.en || cat;
      return `
      <tr>
        <td style="padding:0.3rem 0.5rem">${escapeHtml(categoryName)}</td>
        <td style="padding:0.3rem 0.5rem;color:var(--c-green,#4caf50)">${counts.correct}</td>
        <td style="padding:0.3rem 0.5rem;color:var(--c-red,#f44336)">${counts.wrong}</td>
      </tr>
    `;
    }).join('');
    const reportHtml = reportRows ? `
      <hr style="margin:1.5rem 0;opacity:0.2;" />
      <strong style="display:block;margin-bottom:0.75rem;">${escapeHtml(t('reportTitle'))}</strong>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead><tr>
            <th style="text-align:start;padding:0.3rem 0.5rem;opacity:0.6">${escapeHtml(t('reportCategory'))}</th>
            <th style="padding:0.3rem 0.5rem;opacity:0.6">✓ ${escapeHtml(t('reportCorrect'))}</th>
            <th style="padding:0.3rem 0.5rem;opacity:0.6">✗ ${escapeHtml(t('reportWrong'))}</th>
          </tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
      </div>
    ` : '';

  return `
      <section class="auth-panel" id="signedInAccountPanel" tabindex="-1">
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
          <div id="profileAvatar" style="font-size:3rem;line-height:1;background:var(--panel);padding:0.5rem;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.1);">${escapeHtml(account.avatar)}</div>
          <div>
            <strong style="font-size:1.2rem;">${escapeHtml(account.username)}</strong>
            <p style="margin:0;opacity:0.7;font-size:0.9rem;">${escapeHtml(t('accountReady'))}</p>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-box"><span>${escapeHtml(t('score'))}</span><strong>${score}</strong></div>
          <div class="stat-box"><span>${escapeHtml(t('solved'))}</span><strong>${correctCount}</strong></div>
          <div class="stat-box"><span>${escapeHtml(t('favorites'))}</span><strong>${account.favorites.length}</strong></div>
        </div>

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(t('badgesTitle'))}</strong>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">${earnedBadges}</div>

        ${reportHtml}

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(language === 'ar' ? 'اختر صورتك الرمزية' : 'Choose Your Avatar')}</strong>
        <div id="avatarSelector" tabindex="-1" ${avatarSaving ? 'aria-busy="true"' : ''} style="display:flex;gap:0.5rem;flex-wrap:wrap;font-size:1.75rem;margin-bottom:1rem;">
          ${['👤','🦊','🦉','🐉','⚡️','🔥','👻','👽','🦄','🦁','🐼', '👑', '🚀', '🧠', '🧙‍♂️', '👾'].map(emoji => `
             <button type="button" class="avatar-btn ${account.avatar === emoji ? 'is-active' : ''}" ${avatarSaving ? 'disabled' : ''} aria-describedby="avatarStatus" aria-label="${escapeHtml(fmt('chooseAvatarAria', { avatar: emoji }))}" aria-pressed="${account.avatar === emoji ? 'true' : 'false'}" style="border:2px solid ${account.avatar === emoji ? 'var(--accent, #e8613c)' : 'transparent'};background:transparent;cursor:pointer;border-radius:50%;padding:4px;transition:all 0.2s;transform:${account.avatar === emoji ? 'scale(1.1)' : 'scale(1)'};" data-emoji="${emoji}">${emoji}</button>
          `).join('')}
        </div>
        <p id="avatarStatus" class="auth-inline-status" role="status" aria-live="polite" aria-atomic="true">${avatarSaving ? escapeHtml(t('avatarSaving')) : ''}</p>

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password')}</strong>
        <div class="form-row" style="margin-bottom:1rem;">
             <label>
               <span>${escapeHtml(language === 'ar' ? 'كلمة المرور الحالية' : 'Current Password')}</span>
               <input type="password" id="currentPassword" autocomplete="current-password" aria-describedby="changePasswordStatus" />
             </label>
             <label>
               <span>${escapeHtml(language === 'ar' ? 'كلمة المرور الجديدة' : 'New Password')}</span>
               <input type="password" id="newPassword" autocomplete="new-password" minlength="15" maxlength="128" aria-describedby="changePasswordRules changePasswordStatus" />
             </label>
        </div>
        <p id="changePasswordRules" class="password-rules">${escapeHtml(t('passwordRules'))}</p>
        <p id="changePasswordStatus" class="auth-inline-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <button class="mini-btn" type="button" id="changePasswordBtn" aria-describedby="changePasswordStatus">${escapeHtml(language === 'ar' ? 'تحديث كلمة المرور' : 'Update Password')}</button>
        ${(role === 'ADMIN' || role === 'OWNER') ? `<hr /><h3>${escapeHtml(language === 'ar' ? 'حماية الوصول إلى الإدارة' : 'Protect admin access')}</h3><p>${escapeHtml(language === 'ar' ? 'أضف تطبيق مصادقة واحفظ رموز الاسترداد لفتح لوحة الإدارة بأمان.' : 'Add an authenticator and save recovery codes to securely open the administration console.')}</p><button class="secondary-btn" type="button" id="adminSecurityBtn" aria-describedby="adminSecurityStatus" ${securityLoading ? 'disabled aria-busy="true"' : ''}>${escapeHtml(language === 'ar' ? 'إعداد تطبيق المصادقة أو التحقق منه' : 'Set up or verify authenticator')}</button><p id="adminSecurityStatus" class="auth-inline-status" role="status" aria-live="polite" aria-atomic="true">${securityLoading ? escapeHtml(t('adminSecurityLoading')) : ''}</p>` : ''}

        <hr style="margin:1.5rem 0;opacity:0.2;" />
        <strong style="display:block;margin-bottom:0.5rem;">${escapeHtml(t('recoveryRotateTitle'))}</strong>
        <p class="muted">${escapeHtml(t('recoveryRotateLead'))}</p>
        <div class="form-row">
          <label>
            <span>${escapeHtml(language === 'ar' ? 'كلمة المرور الحالية' : 'Current Password')}</span>
            <input type="password" id="recoveryRotatePassword" autocomplete="current-password" required minlength="8" maxlength="128" />
          </label>
        </div>
        <p id="recoveryRotateStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
        <button class="mini-btn" type="button" id="rotateRecoveryCodeBtn">${escapeHtml(t('recoveryRotate'))}</button>

        <div class="hero-actions" style="margin-top:2rem;">
          ${(role === 'ADMIN' || role === 'OWNER') ? `<a class="secondary-btn" href="/admin${language === 'ar' ? '?lang=ar' : ''}">🛡 ${escapeHtml(t('adminConsole'))}</a>` : ''}
          <a class="secondary-btn" href="${privacyPath}">${escapeHtml(language === 'ar' ? 'الخصوصية وبيانات الحساب' : 'Privacy & account data')}</a>
          <button class="primary-btn" id="logoutBtn" style="background:#555;">${escapeHtml(t('logout'))}</button>
        </div>
        <p id="logoutStatus" class="auth-inline-status" role="status" aria-live="polite"></p>
      </section>
    `;
}
